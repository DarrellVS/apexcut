import { describe, expect, it } from 'vitest';
import { LOOKS, NEUTRAL_GRADE } from '@core/grade';
import { cropFilter, encoderArgs, outputSize, targetKbps } from '@main/actions/cut/quality';
import { needsEncode, planCopy, planEncode, planSegment } from '@main/actions/cut/plan';
import { prepareItems } from '@main/actions/cut/batch';
import type { CutInput, CutItem } from '@main/actions/cut/types';
import type { ProbeResult } from '@main/services/media';

/**
 * The export is the one thing a rider cannot check by looking: these tests freeze the ffmpeg
 * arguments ApexCut builds, so a refactor cannot quietly change quality, framing or colours.
 * The rules behind them are in docs/architecture.md → Export.
 */
const SOURCE = {
  width: 3840,
  height: 3840,
  kbps: 100_000,
  tenBit: true,
  duration: 600,
  fps: 29.97,
} as Partial<ProbeResult> as ProbeResult;

const part = (over: Partial<CutInput> = {}): CutInput => ({
  src: 'C:/rides/DJI_0001.MP4',
  startS: 61.5,
  endS: 73.25,
  dst: 'C:/out/part_000.mp4',
  format: 'original',
  framePos: 0.5,
  fade: 0,
  ...over,
});
/** ffmpeg takes value arguments after their flag: this reads them back */
const valueAfter = (args: string[], flag: string): string | undefined =>
  args[args.indexOf(flag) + 1];

describe('what a cut needs', () => {
  it('copies the streams for a plain square part and re-encodes everything else', () => {
    expect(needsEncode(part())).toBe(false);
    expect(needsEncode(part({ format: '16x9' }))).toBe(true);
    expect(needsEncode(part({ encode: true }))).toBe(true);
    expect(needsEncode(part({ grade: LOOKS[1].grade }))).toBe(true);
    // a neutral grade is no grade at all
    expect(needsEncode(part({ grade: NEUTRAL_GRADE }))).toBe(false);
  });

  it('the copy path touches no pixel and keeps the audio', () => {
    const { args, copy, durationS } = planSegment(part(), SOURCE, ['-c:v', 'ignored']);
    expect(copy).toBe(true);
    expect(durationS).toBeCloseTo(11.75, 3);
    expect(args.join(' ')).toBe(
      '-ss 61.500 -to 73.250 -i C:/rides/DJI_0001.MP4 -map 0:v:0 -map 0:a:0? ' +
        '-c copy -avoid_negative_ts make_zero -movflags +faststart C:/out/part_000.mp4',
    );
  });
});

describe('the crop of each format', () => {
  it('keeps the whole square frame and crops the others from the middle', () => {
    expect(cropFilter('original', 3840, 3840, 0.5)).toBeNull();
    expect(cropFilter('16x9', 3840, 3840, 0.5)).toBe('crop=3840:2160:0:840');
    expect(cropFilter('4x3', 3840, 3840, 0.5)).toBe('crop=3840:2880:0:480');
    expect(cropFilter('9x16', 3840, 3840, 0.5)).toBe('crop=2160:3840:840:0');
  });

  it('slides along the cropped axis with the frame position, on even pixels', () => {
    expect(cropFilter('16x9', 3840, 3840, 0)).toBe('crop=3840:2160:0:0');
    expect(cropFilter('16x9', 3840, 3840, 1)).toBe('crop=3840:2160:0:1680');
    expect(cropFilter('9x16', 3840, 3840, 0.25)).toBe('crop=2160:3840:420:0');
    // out-of-range positions are clamped, never negative
    expect(cropFilter('16x9', 3840, 3840, 2)).toBe('crop=3840:2160:0:1680');
    expect(cropFilter('16x9', 3840, 3840, -1)).toBe('crop=3840:2160:0:0');
  });

  it('never asks for more pixels than the source has', () => {
    expect(outputSize('original', 1920, 1920)).toEqual({ width: 1920, height: 1920 });
    expect(outputSize('16x9', 1920, 1920)).toEqual({ width: 1920, height: 1920 });
    expect(outputSize('16x9', 3840, 3840)).toEqual({ width: 3840, height: 2160 });
    expect(cropFilter('16x9', 1280, 720, 0.5)).toBe('crop=1280:720:0:0');
  });
});

describe('the encoder arguments', () => {
  it('keeps 10-bit 10-bit on every encoder', () => {
    for (const enc of ['hevc_nvenc', 'hevc_qsv', 'hevc_amf', 'libx265']) {
      const args = encoderArgs(enc, 18, true, null);
      const pix = valueAfter(args, '-pix_fmt');
      expect(pix === 'p010le' || pix === 'yuv420p10le').toBe(true);
      expect(args.join(' ')).toContain('-tag:v hvc1');
    }
    expect(valueAfter(encoderArgs('hevc_nvenc', 18, false, null), '-pix_fmt')).toBe('yuv420p');
  });

  it('caps the bitrate at the source rate scaled by the pixels that survive', () => {
    expect(targetKbps(SOURCE, 'original')).toBe(100_000);
    // 16:9 keeps 2160 of 3840 rows
    expect(targetKbps(SOURCE, '16x9')).toBe(56_250);
    expect(targetKbps({ ...SOURCE, kbps: null }, '16x9')).toBeNull();
    const capped = encoderArgs('hevc_nvenc', 18, true, 56_250);
    expect(valueAfter(capped, '-maxrate')).toBe('73125k');
    expect(valueAfter(capped, '-bufsize')).toBe('146250k');
    expect(encoderArgs('hevc_nvenc', 18, true, null)).not.toContain('-maxrate');
  });

  it('asks each encoder for the quality it understands', () => {
    expect(valueAfter(encoderArgs('hevc_nvenc', 18, true, null), '-cq')).toBe('18');
    expect(valueAfter(encoderArgs('hevc_qsv', 18, true, null), '-global_quality')).toBe('18');
    expect(valueAfter(encoderArgs('hevc_amf', 18, true, null), '-qp_i')).toBe('18');
    expect(valueAfter(encoderArgs('libx265', 18, true, null), '-crf')).toBe('18');
  });
});

describe('the filter chain of a re-encoded cut', () => {
  const ENC = ['-c:v', 'hevc_nvenc', '-cq', '18'];

  it('crops, then colours, then fades — in that order', () => {
    const plan = planEncode(
      part({ format: '16x9', fade: 0.4, grade: LOOKS[1].grade }),
      SOURCE,
      ENC,
    );
    const vf = valueAfter(plan.args, '-vf')!;
    const order = ['crop=', 'colorchannelmixer', 'curves', 'fade=t=in'];
    const at = order.map((f) => vf.indexOf(f));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // the sound fades with the picture
    expect(valueAfter(plan.args, '-af')).toBe('afade=t=in:st=0:d=0.40,afade=t=out:st=11.35:d=0.40');
    expect(plan.args.slice(-7)).toEqual([
      '-c:a',
      'aac',
      '-b:a',
      '256k',
      '-movflags',
      '+faststart',
      'C:/out/part_000.mp4',
    ]);
  });

  it('leaves a part alone when it is shorter than its two fades', () => {
    const plan = planEncode(part({ startS: 0, endS: 0.5, fade: 0.4, encode: true }), SOURCE, ENC);
    expect(plan.args.join(' ')).not.toContain('fade');
  });

  it('forces the keyframes a crossfade needs', () => {
    const items: CutItem[] = [0, 1, 2].map((k) => ({ ...part(), name: `p${k}.mp4` }));
    const prepared = prepareItems(items, 'crossfade');
    expect(prepared.map((p) => p.keyframesAt)).toEqual([[11.25], [0.5, 11.25], [0.5]]);
    const plan = planEncode({ ...prepared[1], dst: 'C:/out/p1.mp4' }, SOURCE, ENC);
    expect(valueAfter(plan.args, '-force_key_frames')).toBe('0.500,11.250');
    // a dip fades instead, and re-encodes even a square part
    expect(prepareItems(items, 'dip').every((p) => p.fade === 0.4 && p.encode)).toBe(true);
    expect(prepareItems(items, 'cut').every((p) => p.fade === 0 && !p.encode)).toBe(true);
  });

  it('puts the dark-edges mask and the telemetry overlay after the picture chain', () => {
    const plan = planEncode(part({ format: '16x9' }), SOURCE, ENC, {
      mask: 'C:/out/mask.png',
      overlay: { inputs: ['-loop', '1', '-i', 'C:/out/bike.png'], graph: '[base]null[v]' },
    });
    const graph = valueAfter(plan.args, '-filter_complex')!;
    expect(graph).toBe(
      '[0:v]crop=3840:2160:0:840[pre];[pre][1:v]overlay=format=yuv420p10:shortest=1[base];[base]null[v]',
    );
    // the mask is input 1, the overlay's sprites come after it
    expect(plan.args.slice(0, 10)).toEqual([
      '-ss',
      '61.500',
      '-to',
      '73.250',
      '-i',
      'C:/rides/DJI_0001.MP4',
      '-loop',
      '1',
      '-i',
      'C:/out/mask.png',
    ]);
    expect(plan.args.join(' ')).toContain('-map [v] -map 0:a:0?');
  });

  it('starts the overlay from the untouched picture when there is no crop or grade', () => {
    const plan = planEncode(part({ encode: true }), SOURCE, ENC, {
      overlay: { inputs: ['-loop', '1', '-i', 'C:/out/bike.png'], graph: '[base]null[v]' },
    });
    expect(valueAfter(plan.args, '-filter_complex')).toBe(
      '[0:v]null[pre];[pre]null[base];[base]null[v]',
    );
  });

  it('plans a copy or an encode depending on the part', () => {
    expect(planSegment(part(), SOURCE, ENC).copy).toBe(true);
    expect(planSegment(part({ format: '9x16' }), SOURCE, ENC).copy).toBe(false);
    expect(planCopy(part()).args).toContain('copy');
  });
});

describe('the crop window that follows the corners', () => {
  const follow = { pos: [0.5, 0.6], fps: 30 };

  it('forces an encode even for the square format', () => {
    expect(needsEncode(part({ follow }))).toBe(true);
  });

  it('names the crop and feeds it a command file, before the crop in the chain', () => {
    const { args } = planEncode(part({ format: '9x16', follow }), SOURCE, ['-c:v', 'x'], {
      followCmd: 'C:/tmp/part_000.follow.cmd',
    });
    expect(valueAfter(args, '-vf')).toBe(
      "sendcmd=f='C\\:/tmp/part_000.follow.cmd',crop@follow=2160:3840:840:0",
    );
  });

  it('leaves the crop alone when the format has no room sideways', () => {
    const { args } = planEncode(part({ format: '16x9', follow }), SOURCE, ['-c:v', 'x'], {
      followCmd: 'C:/tmp/part_000.follow.cmd',
    });
    expect(valueAfter(args, '-vf')).toBe('crop=3840:2160:0:840');
  });

  it('keeps the colours and the fade after the crop', () => {
    const { args } = planEncode(
      part({ format: '9x16', follow, grade: LOOKS[1].grade, fade: 0.4 }),
      SOURCE,
      ['-c:v', 'x'],
      { followCmd: 'C:/tmp/p.cmd' },
    );
    const vf = valueAfter(args, '-vf')!.split(',');
    expect(vf[0]).toBe("sendcmd=f='C\\:/tmp/p.cmd'");
    expect(vf[1]).toBe('crop@follow=2160:3840:840:0');
    expect(vf[vf.length - 1]).toContain('fade=t=out');
  });
});
