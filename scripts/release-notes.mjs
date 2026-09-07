#!/usr/bin/env node
/**
 * Print the CHANGELOG.md section of one version (default: the version in package.json), so the
 * release workflow can use it as the GitHub release body — which is also what the in-app
 * “What’s new” shows.
 *   node scripts/release-notes.mjs [version]
 */
import { readFileSync } from 'node:fs';

const version = process.argv[2] ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
const md = readFileSync('CHANGELOG.md', 'utf8');
const re = new RegExp(
  `^## ${version.replace(/\./g, '\\.')}[^\\n]*\\n([\\s\\S]*?)(?=^## |\\s*$)`,
  'm',
);
const m = re.exec(md);
if (!m) {
  console.error(`no CHANGELOG section for ${version}`);
  process.exit(1);
}
process.stdout.write(m[1].trim() + '\n');
