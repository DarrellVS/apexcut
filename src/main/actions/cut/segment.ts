/**
 * Cutting one part with ffmpeg: probe the source, pick the encoder, draw the dark-edges mask and
 * the telemetry overlay if the part has them, then run the arguments `plan.ts` built. NVENC decodes
 * on the GPU when it can, and falls back to the CPU when the driver refuses.
 */
import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { followCommands } from '@core/framing';
import { vignetteStrength } from '@core/grade';
import { runFfmpeg } from '../../services/media';
import type { JobContext } from '../../services/jobs';
import { overlayGraph } from '../overlay';
import { VignetteMaskAction } from '../vignette';
import { videoArgsFor } from './encode';
import { gradeOf, needsEncode, planCopy, planEncode } from './plan';
import { cropBox, outputSize } from './quality';
import type { CutInput } from './types';

export class CutSegmentAction {
  async execute(
    input: CutInput,
    ctx: JobContext,
    onProgress: (f: number) => void,
  ): Promise<string> {
    const run = (args: string[], durationS: number): Promise<void> =>
      runFfmpeg(args, { durationS, onProgress, signal: ctx.signal });

    if (!needsEncode(input)) {
      const plan = planCopy(input);
      await run(plan.args, plan.durationS);
      return input.dst;
    }

    const {
      args: encArgs,
      enc,
      info,
    } = await videoArgsFor(input.src, input.format, input.quality ?? 18);
    const grade = gradeOf(input);
    const out = outputSize(input.format, info.width, info.height);
    const dir = join(input.dst, '..');
    // dark edges: a mask PNG overlaid on the picture (see vignette.ts)
    const mask =
      grade && grade.vignette > 0
        ? await new VignetteMaskAction().execute(
            out.width,
            out.height,
            vignetteStrength(grade),
            dir,
          )
        : null;
    const overlay = input.overlay
      ? overlayGraph(
          input.overlay,
          out.width,
          out.height,
          mask ? 2 : 1,
          dir,
          basename(input.dst, '.mp4'),
        )
      : null;
    // a crop window that leans into the corners: one command line per frame that moves it
    let followCmd: string | null = null;
    const box = cropBox(input.format, info.width, info.height, input.framePos);
    if (input.follow && box && box.slackX > 0) {
      followCmd = join(dir, `${basename(input.dst, '.mp4')}.follow.cmd`);
      writeFileSync(
        followCmd,
        followCommands(input.follow.pos, input.follow.fps, box.slackX),
        'utf8',
      );
    }
    const plan = planEncode(input, info, encArgs, { mask, overlay, followCmd });

    if (enc === 'hevc_nvenc') {
      try {
        await run(['-hwaccel', 'cuda', ...plan.args], plan.durationS);
        return input.dst;
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        ctx.log(
          `GPU decode failed, falling back to CPU decode: ${(e as Error).message.slice(0, 200)}`,
        );
      }
    }
    await run(plan.args, plan.durationS);
    return input.dst;
  }
}
