/**
 * URLs into the `apexcut://media` protocol (see main/services/protocol.ts) and the small bits of
 * DOM handling that go with media in the interface.
 */

/** the thumbnail of a scanned video */
export const thumbUrl = (stem: string): string =>
  `apexcut://media/clip/${encodeURIComponent(stem)}/thumb.jpg`;

/** a song, wherever the user keeps it: the path travels base64url-encoded (main allows its folder) */
export function musicUrl(path: string): string {
  const enc = btoa(unescape(encodeURIComponent(path)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `apexcut://media/music/${enc}`;
}

/** `@error` handler for a picture that may not be there (yet): hide it, keep the layout */
export const hideBrokenImage = (e: Event): void => {
  (e.target as HTMLImageElement).style.visibility = 'hidden';
};
