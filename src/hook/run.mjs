import fs from 'node:fs';
import path from 'node:path';
import { analyzeChange } from '../classify/analyze.mjs';
import { loadConfig, PROJECT_CONFIG_FILES, userConfigPath } from '../config/config.mjs';
import { discoverDocumentationRequirements, fileReader, resolveRequirements, weakenedRequirements } from '../discovery/index.mjs';
import { isDiscoveryFile } from '../discovery/resolvers.mjs';
import { advisoryMessage, blockMessage, configProtectionMessage, retryReleaseMessage, weakenedDocumentationMessage } from './feedback.mjs';
import { OperationSkipped, operationsFromPayload } from './operations.mjs';
import { RetryGuard } from './retry-guard.mjs';

const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;

function findRepositoryRoot(startDirectory) {
  let directory = startDirectory;
  for (let depth = 0; depth < 64; depth++) {
    if (fs.existsSync(path.join(directory, '.git'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
  return null;
}

function isInside(root, filePath) {
  const relative = path.relative(root, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function projectRootFor(filePath, payload, env) {
  const declared = env.CLAUDE_PROJECT_DIR || payload.cwd;
  if (declared && isInside(path.resolve(declared), filePath)) return path.resolve(declared);
  return findRepositoryRoot(path.dirname(filePath)) ?? path.dirname(filePath);
}

function toRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function decision(kind, message) {
  if (kind === 'context') return { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message } };
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: kind, permissionDecisionReason: message } };
}

function isReadabilityConfig(filePath, projectRoot, env) {
  const relative = toRelative(projectRoot, filePath);
  return PROJECT_CONFIG_FILES.includes(relative) || path.resolve(filePath) === path.resolve(userConfigPath(env));
}

function linterConfigWeakening(operation, projectRoot, relativePath) {
  if (!isDiscoveryFile(relativePath)) return [];
  const list = () => {
    try {
      return [...new Set([...fs.readdirSync(projectRoot), relativePath])];
    } catch {
      return [relativePath];
    }
  };
  const before = resolveRequirements(fileReader(projectRoot, new Map([[relativePath, operation.before]])), list).requirements;
  const after = resolveRequirements(fileReader(projectRoot, new Map([[relativePath, operation.after]])), list).requirements;
  return weakenedRequirements(before, after);
}

export function evaluate(payload, env = process.env) {
  if (!payload || typeof payload !== 'object') return { output: null, trace: 'payload is not an object' };
  let operations;
  try {
    operations = operationsFromPayload(payload);
  } catch (error) {
    if (error instanceof OperationSkipped) return { output: null, trace: error.message };
    throw error;
  }
  if (operations.length === 0) return { output: null, trace: 'no file operations' };

  const firstPath = path.resolve(operations[0].filePath.replace(/#[^/\\]*$/, ''));
  const projectRoot = projectRootFor(firstPath, payload, env);
  const { config, warnings } = loadConfig({ projectRoot, env });
  if (config.mode === 'off') return { output: null, trace: 'mode off' };
  const enforcing = config.mode !== 'advisory';

  const results = [];
  const traces = [...warnings];
  for (const operation of operations) {
    const realPath = path.resolve(operation.filePath.replace(/#[^/\\]*$/, ''));
    const relativePath = toRelative(projectRoot, realPath);
    if (config.protectConfigFiles && isReadabilityConfig(realPath, projectRoot, env)) {
      return { output: decision('ask', configProtectionMessage(relativePath)), trace: 'readability config protection' };
    }
    if (config.discovery.enabled !== false) {
      const weakened = linterConfigWeakening(operation, projectRoot, relativePath);
      if (weakened.length > 0) return { output: decision('ask', weakenedDocumentationMessage(relativePath, weakened)), trace: 'documentation requirement weakened' };
    }
    const documentationRequirements = discoverDocumentationRequirements({ projectRoot, enabled: config.discovery.enabled !== false });
    const result = analyzeChange({
      filePath: path.resolve(operation.filePath),
      projectRoot,
      before: operation.before,
      after: operation.after,
      config,
      documentationRequirements,
    });
    if (operation.displayPath && result.relativePath) result.relativePath = toRelative(projectRoot, path.resolve(operation.displayPath));
    traces.push(`${relativePath}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    if (result.status === 'analyzed') results.push({ ...result, filePath: realPath });
  }

  const blocking = results.filter((result) => result.findings.length > 0);
  const guard = new RetryGuard({ sessionId: payload.session_id, limit: config.retryLimit, env });
  if (blocking.length === 0) {
    for (const result of results) guard.registerSuccess(result.filePath);
    return { output: null, trace: traces.join('; ') };
  }
  if (!enforcing) return { output: decision('context', advisoryMessage(blocking)), trace: traces.join('; ') };

  const releases = blocking.map((result) => guard.registerBlock(result.filePath, result.findings));
  if (releases.every((release) => release.release)) {
    return { output: decision('context', retryReleaseMessage(blocking)), trace: 'released after repeated rejections' };
  }
  return { output: decision('deny', blockMessage(blocking, config)), trace: traces.join('; ') };
}

export async function readStdin(stream = process.stdin) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_PAYLOAD_BYTES) throw new OperationSkipped('hook payload too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function main({ stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  try {
    const raw = await readStdin(stdin);
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      if (env.READABILITY_DEBUG) stderr.write('readability: hook input is not valid JSON; allowing\n');
      return 0;
    }
    const { output, trace } = evaluate(payload, env);
    if (env.READABILITY_DEBUG) stderr.write(`readability: ${trace}\n`);
    if (output) stdout.write(JSON.stringify(output));
    return 0;
  } catch (error) {
    if (env.READABILITY_DEBUG) stderr.write(`readability: internal error, allowing the edit: ${error?.stack ?? error}\n`);
    return 0;
  }
}
