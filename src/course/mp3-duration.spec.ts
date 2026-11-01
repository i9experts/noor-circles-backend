import { mp3DurationSec } from './mp3-duration';

/** MPEG-1 Layer III, 128 kbps, 44.1 kHz frames: 417 bytes, 1152 samples each. */
function cbr(frames: number, id3 = false) {
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  const tag = id3 ? Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 20, ...Array(20).fill(0)]) : Buffer.alloc(0);
  return Buffer.concat([tag, ...Array.from({ length: frames }, () => frame)]);
}

describe('mp3DurationSec', () => {
  it('adds up the frames of a constant-bitrate file', () => {
    expect(mp3DurationSec(cbr(383))).toBeCloseTo(10, 0);
  });

  it('skips an ID3 tag', () => {
    expect(mp3DurationSec(cbr(766, true))).toBeCloseTo(20, 0);
  });

  it('returns 0 for something that is not an MP3', () => {
    expect(mp3DurationSec(Buffer.from('not audio at all'))).toBe(0);
  });
});
