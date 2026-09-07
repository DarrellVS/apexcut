/**
 * Title and end cards: 3 s on the brand gradient with the project name and a line of stats,
 * rendered by ffmpeg (gradients + drawtext) at the movie's own resolution, fps and bit depth, and
 * encoded with the same settings as the parts so the cards concatenate losslessly with them.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runFfmpeg } from '../services/media';
import type { JobContext } from '../services/jobs';

export const CARD_S = 3;
const FADE_S = 0.5;

export interface CardSpec {
  width: number;
  height: number;
  fps: string;
  tenBit: boolean;
  /** encoder arguments shared with the parts (see cut.ts videoArgsFor) */
  encArgs: string[];
  heading: string;
  subheading: string;
  /** small line bottom-right, e.g. "Made with ApexCut" */
  footer: string;
  dst: string;
  /** scratch folder for the text files drawtext reads (avoids escaping) */
  tmp: string;
}

/** A font ffmpeg's drawtext can open; Windows ships Segoe UI, elsewhere fontconfig picks a sans. */
export function cardFont(): string | null {
  if (process.platform !== 'win32') return null;
  const fonts = join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts');
  for (const f of ['segoeuisb.ttf', 'segoeui.ttf', 'arial.ttf']) {
    const p = join(fonts, f);
    if (existsSync(p)) return p;
  }
  return null;
}

/** drawtext option value: forward slashes and escaped colons keep Windows paths intact. */
const optPath = (p: string): string => p.replace(/\\/g, '/').replace(/:/g, '\\:');

/** Font size that fits `text` in ~85 % of the width, capped at a share of the height. */
function fitSize(text: string, width: number, height: number, share: number): number {
  const byHeight = height * share;
  const byWidth = (0.85 * width) / Math.max(1, text.length * 0.56);
  return Math.round(Math.max(height * 0.02, Math.min(byHeight, byWidth)));
}

export class CardAction {
  async execute(spec: CardSpec, ctx: JobContext): Promise<string> {
    const { width: w, height: h } = spec;
    const font = cardFont();
    const fontOpt = font ? `fontfile='${optPath(font)}':` : '';
    const textFile = (name: string, text: string): string => {
      const p = join(spec.tmp, `${name}.txt`);
      writeFileSync(p, text, 'utf8');
      return `textfile='${optPath(p)}'`;
    };
    const headSize = fitSize(spec.heading, w, h, 0.095);
    const subSize = Math.round(Math.max(h * 0.02, Math.min(h * 0.036, headSize * 0.4)));
    const footSize = Math.round(h * 0.018);
    const filters = [
      // a darker veil over the gradient so white text always reads
      `drawbox=c=black@0.35:t=fill`,
      `drawtext=${fontOpt}${textFile('heading', spec.heading)}:fontsize=${headSize}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-${Math.round(subSize * 0.9)}`,
      ...(spec.subheading
        ? [
            `drawtext=${fontOpt}${textFile('sub', spec.subheading)}:fontsize=${subSize}:fontcolor=white@0.85:x=(w-text_w)/2:y=(h-text_h)/2+${Math.round(headSize * 0.75)}`,
          ]
        : []),
      ...(spec.footer
        ? [
            `drawtext=${fontOpt}${textFile('foot', spec.footer)}:fontsize=${footSize}:fontcolor=white@0.7:x=w-text_w-${Math.round(w * 0.03)}:y=h-text_h-${Math.round(h * 0.03)}`,
          ]
        : []),
      `fade=t=in:st=0:d=${FADE_S},fade=t=out:st=${(CARD_S - FADE_S).toFixed(2)}:d=${FADE_S}`,
      `format=${spec.tenBit ? 'p010le' : 'yuv420p'}`,
    ];
    await runFfmpeg(
      [
        '-f',
        'lavfi',
        '-i',
        `gradients=s=${w}x${h}:c0=0xff7a3d:c1=0xff3d81:x0=0:y0=0:x1=${w}:y1=${h}:nb_colors=2:type=linear:speed=0.00001:d=${CARD_S}:r=${spec.fps}`,
        '-f',
        'lavfi',
        '-t',
        String(CARD_S),
        '-i',
        'anullsrc=r=48000:cl=stereo',
        '-vf',
        filters.join(','),
        ...spec.encArgs,
        '-c:a',
        'aac',
        '-b:a',
        '256k',
        '-shortest',
        '-movflags',
        '+faststart',
        spec.dst,
      ],
      { signal: ctx.signal },
    );
    return spec.dst;
  }
}
