/**
 * Turn raw error text into words a rider understands, plus what to try. The raw text stays
 * available under "Details".
 */
export interface FriendlyError {
  title: string;
  hint: string;
}

const RULES: [RegExp, FriendlyError][] = [
  [
    /no motion data|quaternion/i,
    {
      title: 'This video has no motion data',
      hint: 'ApexCut needs a DJI Osmo Action recording with its sensor track. Screen recordings, edited copies and other cameras are not supported yet.',
    },
  ],
  [
    /ENOENT|not found|no such file/i,
    {
      title: 'A file could not be found',
      hint: 'A video moved or the memory card is not plugged in. Use “Find video…” on the video, then try again.',
    },
  ],
  [
    /ENOSPC|no space/i,
    {
      title: 'The disk is full',
      hint: 'Free up space in your output folder or choose another one in Settings.',
    },
  ],
  [
    /EACCES|EPERM|permission/i,
    { title: 'ApexCut may not write there', hint: 'Choose another output folder in Settings.' },
  ],
  [
    /nvenc|cuda|encoder|ffmpeg/i,
    {
      title: 'Making the video failed',
      hint: 'Usually the graphics card driver. Update it, restart ApexCut and try again; the details below say what ffmpeg reported.',
    },
  ],
  [/cancel/i, { title: 'Cancelled', hint: '' }],
];

export function friendlyError(raw: string | null | undefined): FriendlyError {
  const text = raw ?? '';
  for (const [re, f] of RULES) if (re.test(text)) return f;
  return {
    title: 'Something went wrong',
    hint: 'Try again. If it keeps happening, use “Report a problem” in Settings so we can look at the logs.',
  };
}
