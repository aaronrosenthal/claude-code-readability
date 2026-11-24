import fs from 'node:fs';
import path from 'node:path';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export class OperationSkipped extends Error {}

function readExisting(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new OperationSkipped('target is not a regular file');
    if (stat.size > MAX_FILE_BYTES) throw new OperationSkipped('file is too large to analyze');
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    if (error instanceof OperationSkipped) throw error;
    throw new OperationSkipped(`cannot read file (${error.code ?? error.message})`);
  }
}

function writeOperation(input) {
  const { file_path: filePath, content } = input;
  if (typeof filePath !== 'string' || typeof content !== 'string') throw new OperationSkipped('malformed Write input');
  if (content.length > MAX_FILE_BYTES) throw new OperationSkipped('content is too large to analyze');
  return [{ filePath, before: readExisting(filePath), after: content, tool: 'Write' }];
}

function editOperation(input) {
  const { file_path: filePath, old_string: oldString, new_string: newString, replace_all: replaceAll } = input;
  if (typeof filePath !== 'string' || typeof oldString !== 'string' || typeof newString !== 'string') throw new OperationSkipped('malformed Edit input');
  const before = readExisting(filePath);
  if (before === null) {
    if (oldString === '') return [{ filePath, before: null, after: newString, tool: 'Edit' }];
    throw new OperationSkipped('edited file does not exist');
  }
  if (oldString === '') throw new OperationSkipped('empty old_string on an existing file');
  const index = before.indexOf(oldString);
  if (index === -1) throw new OperationSkipped('old_string not found; the Edit tool will report the error');
  const after = replaceAll ? before.split(oldString).join(newString) : before.slice(0, index) + newString + before.slice(index + oldString.length);
  return [{ filePath, before, after, tool: 'Edit' }];
}

const NOTEBOOK_EXTENSIONS = { python: '.py', r: '.r', javascript: '.js', typescript: '.ts', ruby: '.rb', julia: null, scala: null };

function cellSource(cell) {
  return Array.isArray(cell?.source) ? cell.source.join('') : typeof cell?.source === 'string' ? cell.source : '';
}

function notebookOperation(input) {
  const { notebook_path: notebookPath, cell_id: cellId, new_source: newSource, cell_type: cellType, edit_mode: editMode = 'replace' } = input;
  if (typeof notebookPath !== 'string' || (editMode !== 'delete' && typeof newSource !== 'string')) throw new OperationSkipped('malformed NotebookEdit input');
  if (editMode === 'delete') return [];
  const raw = readExisting(notebookPath);
  let notebook = null;
  try {
    notebook = raw ? JSON.parse(raw) : null;
  } catch {
    throw new OperationSkipped('notebook is not valid JSON');
  }
  const cells = notebook?.cells ?? [];
  const target = cells.find((cell) => cell.id === cellId) ?? null;
  const effectiveType = cellType ?? target?.cell_type ?? 'code';
  if (effectiveType !== 'code') return [];
  const language = String(notebook?.metadata?.kernelspec?.language ?? notebook?.metadata?.language_info?.name ?? 'python').toLowerCase();
  const extension = NOTEBOOK_EXTENSIONS[language];
  if (!extension) throw new OperationSkipped(`notebook language ${language} is not supported`);
  const before = editMode === 'insert' ? '' : cellSource(target);
  return [{ filePath: `${notebookPath}#${cellId ?? 'new'}${extension}`, before, after: newSource, tool: 'NotebookEdit', displayPath: notebookPath }];
}

const HEREDOC_WRITE = /(?:^|\n|&&|;)[ \t]*(cat|tee)\b([^\n]*?)<<(-?)[ \t]*(['"]?)([A-Za-z_]\w*)\4([^\n]*)\n([\s\S]*?)\n[ \t]*\5[ \t]*(?=\n|$)/g;

function literalPath(token) {
  if (!token) return null;
  const unquoted = /^"([^"$`\\]*)"$|^'([^']*)'$|^([^\s"'$`*?;&|<>()\\]+)$/.exec(token);
  if (!unquoted) return null;
  return unquoted[1] ?? unquoted[2] ?? unquoted[3];
}

function heredocTarget(command, redirections) {
  if (command === 'cat') {
    const match = /(^|\s)(>>?)[ \t]*("[^"]*"|'[^']*'|[^\s;&|<>]+)/.exec(redirections);
    if (!match) return null;
    return { path: literalPath(match[3]), append: match[2] === '>>' };
  }
  const tokens = redirections.trim().split(/\s+/).filter(Boolean);
  const append = tokens.includes('-a') || tokens.includes('--append');
  const target = tokens.find((token) => !token.startsWith('-') && !token.startsWith('>'));
  if (tokens.some((token) => token.startsWith('>'))) return null;
  return { path: literalPath(target), append };
}

export function shellHeredocWrites(commandText, cwd) {
  const operations = [];
  for (const match of commandText.matchAll(HEREDOC_WRITE)) {
    const [, command, beforeHeredoc, dash, , , afterHeredoc, body] = match;
    const target = heredocTarget(command, `${beforeHeredoc} ${afterHeredoc}`);
    if (!target?.path) continue;
    const filePath = path.isAbsolute(target.path) ? target.path : path.resolve(cwd ?? process.cwd(), target.path);
    const content = dash ? body.replace(/^\t+/gm, '') : body;
    let before = null;
    try {
      before = readExisting(filePath);
    } catch {
      continue;
    }
    const after = target.append ? `${before ?? ''}${content}\n` : `${content}\n`;
    operations.push({ filePath, before, after, tool: 'Bash' });
  }
  return operations;
}

export function operationsFromPayload(payload) {
  const input = payload.tool_input;
  if (!input || typeof input !== 'object') throw new OperationSkipped('missing tool_input');
  switch (payload.tool_name) {
    case 'Write':
      return writeOperation(input);
    case 'Edit':
      return editOperation(input);
    case 'NotebookEdit':
      return notebookOperation(input);
    case 'Bash':
      return typeof input.command === 'string' ? shellHeredocWrites(input.command, payload.cwd) : [];
    default:
      return [];
  }
}
