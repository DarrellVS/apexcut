#!/usr/bin/env node
/**
 * Packaging guard: every file unpacked from the asar (worker threads run from app.asar.unpacked with
 * plain Node resolution) must find its relative requires next to it. Caught the 0.4.9 bug where the
 * analysis worker required ../chunks/score-*.js that only existed inside app.asar.
 *   node scripts/check-package.mjs [dist/win-unpacked]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist/win-unpacked');
const unpacked = join(root, 'resources', 'app.asar.unpacked', 'out', 'main');
if (!existsSync(unpacked)) {
  console.error(`no unpacked main bundle at ${unpacked}`);
  process.exit(1);
}
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
};
walk(unpacked);
let missing = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
    const target = resolve(dirname(file), m[1]);
    const ok = ['', '.js', '.cjs', '/index.js'].some((ext) => existsSync(target + ext));
    if (!ok) {
      console.error(`${file}: require('${m[1]}') not found next to the unpacked file`);
      missing++;
    }
  }
}
console.log(`checked ${files.length} unpacked main files, ${missing} broken require(s)`);
process.exit(missing ? 1 : 0);
