import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, mongo } from 'mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { Readable } from 'stream';

const BUCKET = 'courseAudio';
const LINK_TTL_SEC = 3 * 3600;

/** True for MP3 data (ID3 tag or an MPEG audio frame header). */
export function looksLikeMp3(buf: Buffer) {
  if (buf.length < 4) return false;
  if (buf.subarray(0, 3).toString('latin1') === 'ID3') return true;
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
}

/**
 * Lesson audio lives in MongoDB (GridFS), so it needs no extra service and is
 * only playable through short-lived links issued to signed-in users.
 */
@Injectable()
export class AudioStoreService {
  private readonly secret: string;

  constructor(@InjectConnection() private readonly conn: Connection, config: ConfigService) {
    this.secret = createHmac('sha256', config.getOrThrow<string>('JWT_ACCESS_SECRET')).update('course-audio').digest('hex');
  }

  private bucket() {
    return new mongo.GridFSBucket(this.conn.db as any, { bucketName: BUCKET });
  }

  async save(buffer: Buffer, filename: string): Promise<Types.ObjectId> {
    return new Promise((resolve, reject) => {
      const up = this.bucket().openUploadStream(filename, { metadata: { contentType: 'audio/mpeg' } });
      Readable.from(buffer).pipe(up)
        .on('error', reject)
        .on('finish', () => resolve(up.id as unknown as Types.ObjectId));
    });
  }

  async remove(id: Types.ObjectId | null | undefined) {
    if (!id) return;
    await this.bucket().delete(id as any).catch(() => {});
  }

  /** File size, and a stream of [start, end] (inclusive) if a range is given. */
  async open(id: Types.ObjectId, range?: { start: number; end: number }) {
    const [file] = await this.bucket().find({ _id: id as any }).toArray();
    if (!file) throw new NotFoundException('Audio not found.');
    const stream = range
      ? this.bucket().openDownloadStream(id as any, { start: range.start, end: range.end + 1 })
      : this.bucket().openDownloadStream(id as any);
    return { size: file.length, stream };
  }

  // ── Short-lived play links ────────────────────────────────────────────────

  private sign(payload: string) {
    return createHmac('sha256', this.secret).update(payload).digest('base64url').slice(0, 32);
  }

  /** `<lessonId>.<userId>.<expiry>.<sig>` */
  issueToken(lessonId: string, userId: string) {
    const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SEC;
    const payload = `${lessonId}.${userId}.${exp}`;
    return { token: `${payload}.${this.sign(payload)}`, expiresAt: new Date(exp * 1000) };
  }

  verifyToken(lessonId: string, token: string): boolean {
    const m = /^([a-f\d]{24})\.([a-f\d]{24})\.(\d{10})\.([\w-]{32})$/i.exec(token ?? '');
    if (!m || m[1] !== lessonId || Number(m[3]) * 1000 < Date.now()) return false;
    const expected = Buffer.from(this.sign(`${m[1]}.${m[2]}.${m[3]}`));
    return expected.length === m[4].length && timingSafeEqual(expected, Buffer.from(m[4]));
  }
}
