/** Fonts for ffmpeg's drawtext (telemetry overlay). */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
