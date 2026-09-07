#!/usr/bin/env node
/**
 * Print the CHANGELOG.md section of one version (default: the version in package.json), so the
 * release workflow can use it as the GitHub release body — which is also what the in-app
 * “What’s new” shows.
 *   node scripts/release-notes.mjs [version]
 */
import { readFileSync } from 'node:fs';

const version = process.argv[2] ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
const lines = readFileSync('CHANGELOG.md', 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith(`## ${version}`));
if (start < 0) {
  console.error(`no CHANGELOG section for ${version}`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
if (end < 0) end = lines.length;
const body = lines
  .slice(start + 1, end)
  .join('\n')
  .trim();
if (!body) {
  console.error(`CHANGELOG section for ${version} is empty`);
  process.exit(1);
}
process.stdout.write(body + '\n');
