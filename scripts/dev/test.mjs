#!/usr/bin/env node
// COMPAT: Node 20 treats a directory argument to `node --test` as a folder to search, Node 22+ as a module to load, and
// shell globs do not expand on Windows, so this script lists the test files itself.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const suites = process.argv.slice(2);
const directories = suites.length > 0 ? suites : ['tests/unit', 'tests/integration'];

function testFiles(directory) {
  return fs
    .readdirSync(path.join(repoRoot, directory), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
    .sort();
}

const files = directories.flatMap(testFiles);
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: repoRoot, stdio: 'inherit' });
process.exit(result.status ?? 1);
