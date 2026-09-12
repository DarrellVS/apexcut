/**

 * Telemetry overlay: layout, drawing and the ffmpeg command stream for the lean gauge that goes into
 * the export and the live preview. Pure: drawing takes a minimal 2D-context interface (canvas in the
 * renderer, a mock in tests); the export composes three sprites drawn by that same code (bike, dial,
 * needle) with ffmpeg `rotate`/`drawtext`/`drawbox` driven per frame by `sendcmd` (main/actions/overlay.ts).
 *
 * spec.ts    what an overlay is and where its pieces go
 * draw.ts    drawing it on a canvas (preview and sprites)
 * sendcmd.ts driving it per frame in the export
 */
export * from './spec';
export * from './draw';
export * from './sendcmd';
