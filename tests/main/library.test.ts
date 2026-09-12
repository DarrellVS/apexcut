import { describe, expect, it } from 'vitest';
import { Library } from '@main/services/library';

/**
 * Which small copy belongs to which recording. DJI writes `DJI_…_0034_D.LRF` next to the MP4 of the
 * same name; GoPro writes `GL011234.LRV` next to `GX011234.MP4`, so the names differ.
 */
describe('pairing a video with its small copy', () => {
  const videos = ['DJI_20260906104754_0034_D', 'GX011234', 'GH010007'];

  it('keeps the DJI pair together, since both have the same name', () => {
    expect(Library.videoOf('DJI_20260906104754_0034_D', videos)).toBe('DJI_20260906104754_0034_D');
  });

  it('finds the GoPro recording a GL copy belongs to, whichever prefix it has', () => {
    expect(Library.videoOf('GL011234', videos)).toBe('GX011234');
    expect(Library.videoOf('GL010007', videos)).toBe('GH010007');
    expect(Library.videoOf('gl011234', videos)).toBe('GX011234');
  });

  it('leaves a copy whose recording is not there under its own name', () => {
    expect(Library.videoOf('GL019999', videos)).toBe('GL019999');
    expect(Library.videoOf('something-else', videos)).toBe('something-else');
  });
});
