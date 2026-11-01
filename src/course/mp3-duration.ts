// Reads an MP3's playing time from its frames, so a lesson's length always
// matches the audio actually uploaded (no extra dependency, no decoding).

const BITRATES: Record<string, number[]> = {
  // [MPEG version][layer] → kbps by index 1–14
  'V1L1': [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  'V1L2': [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  'V1L3': [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  'V2L1': [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  'V2L2': [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  'V2L3': [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

interface Frame { size: number; samples: number; sampleRate: number }

function frameAt(buf: Buffer, i: number): Frame | null {
  if (i + 4 > buf.length || buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (buf[i + 1] >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (buf[i + 1] >> 1) & 0x03;   // 3 = Layer I, 2 = II, 1 = III
  const brIndex = (buf[i + 2] >> 4) & 0x0f;
  const srIndex = (buf[i + 2] >> 2) & 0x03;
  const padding = (buf[i + 2] >> 1) & 0x01;
  if (version === 1 || layer === 0 || brIndex === 0 || brIndex === 15 || srIndex === 3) return null;
  const l = layer === 3 ? 1 : layer === 2 ? 2 : 3;
  const kbps = BITRATES[`${version === 3 ? 'V1' : 'V2'}L${l}`][brIndex - 1];
  const sampleRate = SAMPLE_RATES[version][srIndex];
  const samples = l === 1 ? 384 : l === 3 && version !== 3 ? 576 : 1152;
  const size = l === 1
    ? Math.floor((12 * kbps * 1000) / sampleRate + padding) * 4
    : Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding;
  return size > 4 ? { size, samples, sampleRate } : null;
}

/** Seconds of audio in an MP3 buffer (0 if it can't be read). */
export function mp3DurationSec(buf: Buffer): number {
  let i = 0;
  // Skip an ID3v2 tag (and any further ones some encoders stack).
  while (i + 10 <= buf.length && buf.subarray(i, i + 3).toString('latin1') === 'ID3') {
    const size = ((buf[i + 6] & 0x7f) << 21) | ((buf[i + 7] & 0x7f) << 14) | ((buf[i + 8] & 0x7f) << 7) | (buf[i + 9] & 0x7f);
    i += 10 + size + (buf[i + 5] & 0x10 ? 10 : 0);
  }
  // Find the first frame that is followed by another (avoids false syncs in junk).
  let first: Frame | null = null;
  for (; i < buf.length - 4; i++) {
    const f = frameAt(buf, i);
    if (f && frameAt(buf, i + f.size)) { first = f; break; }
  }
  if (!first) return 0;

  // A Xing/Info header (VBR files) states the frame count directly.
  const head = buf.subarray(i, Math.min(buf.length, i + 200));
  const tagAt = Math.max(head.indexOf('Xing'), head.indexOf('Info'));
  if (tagAt > 0 && (head[tagAt + 7] & 0x01)) {
    const frames = head.readUInt32BE(tagAt + 8);
    if (frames > 0) return round1((frames * first.samples) / first.sampleRate);
  }

  // Otherwise walk every frame.
  let seconds = 0;
  while (i < buf.length - 4) {
    const f = frameAt(buf, i);
    if (!f) { i++; continue; }
    seconds += f.samples / f.sampleRate;
    i += f.size;
  }
  return round1(seconds);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
