/**
 * IPC contract shared by main, preload and renderer.
 *
 *   movie.ts    formats, crops and transitions — the shape of a movie
 *   dto.ts      the plain objects that cross the bridge
 *   schemas.ts  zod for everything the renderer sends
 *   api.ts      the calls the renderer can make
 */
export * from './movie';
export * from './dto';
export * from './schemas';
export * from './api';
