import fs from 'node:fs';
import path from 'node:path';
import { matchesAny } from '../config/glob.mjs';
import { dotnetProjectRequirements, RESOLVERS } from './resolvers.mjs';

const MAX_CONFIG_BYTES = 1024 * 1024;

export function fileReader(projectRoot, overrides = new Map()) {
  return (relative) => {
    if (overrides.has(relative)) return overrides.get(relative);
    if (!projectRoot) return null;
    const full = path.join(projectRoot, relative);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) return null;
      return fs.readFileSync(full, 'utf8');
    } catch {
      return null;
    }
  };
}

function rootListing(projectRoot) {
  return () => {
    if (!projectRoot) return [];
    try {
      return fs.readdirSync(projectRoot);
    } catch {
      return [];
    }
  };
}

function visibilityApplies(required, actual) {
  if (required === 'all') return true;
  if (required === 'non-private') return actual !== 'private';
  if (required === 'protected') return actual === 'public' || actual === 'protected' || actual === 'special';
  return actual === 'public' || actual === 'special' || actual === 'protected';
}

function nestedConfigFor(projectRoot, relativePath, family) {
  if (!projectRoot) return null;
  const segments = relativePath.split('/').slice(0, -1);
  for (let depth = segments.length; depth >= 1; depth--) {
    const directory = segments.slice(0, depth).join('/');
    for (const definition of RESOLVERS) {
      if ((definition.families ?? [definition.family]).includes(family) === false) continue;
      for (const file of definition.files) {
        if (file.includes('/') || file === 'package.json' || file === 'pyproject.toml' || file === 'setup.cfg' || file === 'Cargo.toml') continue;
        if (fs.existsSync(path.join(projectRoot, directory, file))) return `${directory}/${file}`;
      }
    }
  }
  return null;
}

export function resolveRequirements(read, list = () => []) {
  const requirements = [];
  const errors = [];
  for (const definition of RESOLVERS) {
    try {
      requirements.push(...definition.resolve(read, list));
    } catch (error) {
      errors.push(`${definition.id}: ${error.message}`);
      requirements.push({
        status: 'unknown',
        family: definition.family,
        kinds: ['module', 'class', 'function', 'method', 'property'],
        visibility: 'all',
        excludes: [],
        source: `${definition.id} resolver failed`,
      });
    }
  }
  return { requirements, errors };
}

function nearestProjectFile(projectRoot, relativePath) {
  if (!projectRoot) return null;
  const segments = relativePath.split('/').slice(0, -1);
  for (let depth = segments.length; depth >= 1; depth--) {
    const directory = segments.slice(0, depth).join('/');
    try {
      const project = fs.readdirSync(path.join(projectRoot, directory)).find((name) => name.endsWith('.csproj'));
      if (project) return `${directory}/${project}`;
    } catch {}
  }
  return null;
}

export function discoverDocumentationRequirements({ projectRoot, enabled = true, overrides = new Map() }) {
  if (!enabled) return { requirements: [], errors: [], requirementFor: () => ({ status: 'not-required' }) };
  const read = fileReader(projectRoot, overrides);
  const { requirements, errors } = resolveRequirements(read, rootListing(projectRoot));
  return {
    requirements,
    errors,
    requirementFor(family, kind, visibility, relativePath) {
      const nested = nestedConfigFor(projectRoot, relativePath, family);
      if (nested) return { status: 'unknown', source: `nested configuration ${nested} is not resolved` };
      const scoped = [...requirements];
      if (family === 'csharp') {
        const project = nearestProjectFile(projectRoot, relativePath);
        const raw = project ? read(project) : null;
        if (raw !== null) scoped.push(...dotnetProjectRequirements(project, raw, read('.editorconfig')));
      }
      const applicable = scoped.filter((entry) => entry.family === family && entry.kinds.includes(kind));
      const required = applicable.find((entry) => entry.status === 'required' && visibilityApplies(entry.visibility, visibility) && !matchesAny(relativePath, entry.excludes));
      if (required) return { status: 'required', source: required.source };
      const unknown = applicable.find((entry) => entry.status === 'unknown');
      if (unknown) return { status: 'unknown', source: unknown.source };
      return { status: 'not-required' };
    },
  };
}

export function requirementSignature(requirements) {
  return requirements
    .filter((entry) => entry.status === 'required')
    .flatMap((entry) => entry.kinds.map((kind) => ({ key: `${entry.family}:${entry.tool}:${entry.rule}:${kind}`, entry, kind })));
}

export function weakenedRequirements(beforeRequirements, afterRequirements) {
  const after = requirementSignature(afterRequirements);
  const afterKeys = new Map(after.map((item) => [item.key, item]));
  const removed = [];
  for (const item of requirementSignature(beforeRequirements)) {
    const counterpart = afterKeys.get(item.key);
    if (!counterpart) {
      removed.push({ ...item, change: 'disabled' });
      continue;
    }
    const addedExcludes = counterpart.entry.excludes.filter((glob) => !item.entry.excludes.includes(glob));
    if (addedExcludes.length > 0) removed.push({ ...item, change: `new exclusions ${addedExcludes.join(', ')}` });
    const rank = { all: 3, 'non-private': 2, protected: 1, public: 0 };
    if ((rank[counterpart.entry.visibility] ?? 0) < (rank[item.entry.visibility] ?? 0))
      removed.push({ ...item, change: `narrowed to ${counterpart.entry.visibility} declarations` });
  }
  return removed;
}
