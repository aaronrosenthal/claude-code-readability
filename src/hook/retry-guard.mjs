import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function stateDirectory(env) {
  const base = env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'claude-readability');
  return path.join(base, 'retry-state');
}

function digest(parts) {
  return crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32);
}

function sweep(directory) {
  try {
    const now = Date.now();
    for (const name of fs.readdirSync(directory)) {
      const full = path.join(directory, name);
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > STALE_AFTER_MS) fs.rmSync(full, { force: true });
    }
  } catch {}
}

export class RetryGuard {
  constructor({ sessionId, limit, env = process.env }) {
    this.sessionId = sessionId ?? 'no-session';
    this.limit = limit;
    this.directory = stateDirectory(env);
    this.available = true;
    try {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      if (Math.random() < 0.02) sweep(this.directory);
    } catch {
      this.available = false;
    }
  }

  counterPath(kind, parts) {
    return path.join(this.directory, `${kind}-${digest([this.sessionId, ...parts])}`);
  }

  increment(counterPath) {
    if (!this.available) return 0;
    try {
      fs.appendFileSync(counterPath, '.', { mode: 0o600 });
      return fs.statSync(counterPath).size;
    } catch {
      return 0;
    }
  }

  registerBlock(filePath, findings) {
    const fingerprint = findings.map((finding) => `${finding.category}:${finding.comment.replace(/\s+/g, ' ').trim()}`).sort();
    const sameComments = this.increment(this.counterPath('comments', [filePath, ...fingerprint]));
    const sameFile = this.increment(this.counterPath('file', [filePath]));
    return { sameComments, sameFile, release: sameComments > this.limit || sameFile > this.limit * 2 };
  }

  registerSuccess(filePath) {
    if (!this.available) return;
    try {
      fs.rmSync(this.counterPath('file', [filePath]), { force: true });
    } catch {}
  }
}
