import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, mongo } from 'mongoose';
import { Readable } from 'stream';
import { v2 as cloudinary } from 'cloudinary';

const BUCKET = 'images';

/** The real type from the file's first bytes (the browser's label can't be trusted). */
export function imageType(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Profile and student photos. Uses Cloudinary when it's configured and
 * working; otherwise the image is kept in MongoDB (GridFS) and served by the
 * API, so uploads never depend on an outside service being set up.
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly cloudinaryReady: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectConnection() private readonly conn: Connection,
  ) {
    const cloud_name = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const api_key    = this.configService.get<string>('CLOUDINARY_API_KEY');
    const api_secret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    this.cloudinaryReady = !!(cloud_name && api_key && api_secret);
    if (this.cloudinaryReady) cloudinary.config({ cloud_name, api_key, api_secret });
    else this.logger.log('Cloudinary is not set up: images are stored in the database.');
  }

  private bucket() {
    return new mongo.GridFSBucket(this.conn.db as any, { bucketName: BUCKET });
  }

  /** `apiBase` is the public API root, e.g. https://…/api/v1 (used for images kept in the database). */
  async uploadFile(file: Express.Multer.File | undefined, apiBase: string): Promise<{ url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file received. Attach an image in the "file" field.'); // BUG-46
    }
    const type = imageType(file.buffer);
    if (!type) throw new BadRequestException('That file isn’t a JPG, PNG or WebP image.');

    if (this.cloudinaryReady) {
      try {
        return await this.toCloudinary(file.buffer);
      } catch (err) {
        this.logger.warn(`Cloudinary upload failed (${(err as Error).message}); keeping the image in the database instead.`);
      }
    }
    const id = await new Promise<Types.ObjectId>((resolve, reject) => {
      const up = this.bucket().openUploadStream(file.originalname || 'image', { metadata: { contentType: type } });
      Readable.from(file.buffer).pipe(up).on('error', reject).on('finish', () => resolve(up.id as unknown as Types.ObjectId));
    });
    return { url: `${apiBase}/upload/images/${id.toString()}` };
  }

  private toCloudinary(buffer: Buffer): Promise<{ url: string }> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'uploads', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] },
        (error, result) => (error || !result?.secure_url ? reject(error ?? new Error('no URL returned')) : resolve({ url: result.secure_url })),
      );
      stream.end(buffer);
    });
  }

  /** An image kept in the database. */
  async open(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Image not found.');
    const [file] = await this.bucket().find({ _id: new Types.ObjectId(id) as any }).toArray();
    if (!file) throw new NotFoundException('Image not found.');
    return {
      size: file.length,
      contentType: (file.metadata as any)?.contentType ?? 'application/octet-stream',
      stream: this.bucket().openDownloadStream(file._id),
    };
  }
}
