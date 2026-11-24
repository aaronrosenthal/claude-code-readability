# Trust model

**The readability hook is a code-quality guardrail, not a security boundary.**

It exists to nudge an AI coding agent that is trying to do good work toward code that explains itself. It assumes the
agent is cooperative. It does not try to stop a determined actor, and it must never be relied on to keep anything out of
a codebase.

## What the hook does

- Runs locally as a `PreToolUse` command hook, using the Node.js runtime Claude Code already requires.
- Reads the hook payload from stdin, the file being edited (to know what is new), the plugin and project configuration
  files, and linter configuration files in the project root (to learn documentation requirements).
- Writes a small retry counter per session under `$CLAUDE_PLUGIN_DATA` (or the system temp directory) to avoid loops.
  Counter files contain only hashes and are swept after 24 hours.
- Returns a JSON decision on stdout: deny with a reason, ask, add context, or nothing.

## What the hook never does

- No network access, telemetry, or analytics. Source code never leaves the machine through the plugin.
- No LLM calls. Decisions are deterministic and reproducible from the same inputs.
- No execution of project code or configuration. ESLint `.js`/`.ts` configs are read as text, never imported.
- No shell commands. The hook is invoked in exec form (`node <script>`) with no shell interpolation of payload data, and
  it spawns no processes.
- No modification of your files. It only blocks, asks, or advises; it never rewrites an edit.
- No elevated privileges.

## Failure behavior

The hook fails **open**. Malformed payloads, unreadable or oversized files (> 5 MB), oversized payloads (> 32 MB),
unsupported languages, input the lexer cannot tokenize with confidence, and internal errors all result in the edit being
allowed with exit code 0. With `READABILITY_DEBUG=1` the reason is printed to stderr. A hook timeout (15 s) is treated by
Claude Code as a non-blocking error.

Repeated identical rejections are released after `retryLimit` attempts so an agent can never be stuck in a loop.

## Known ways around the hook

These are documented so nobody mistakes the guardrail for enforcement:

- **Shell writes.** The hook inspects `Write`, `Edit`, and `NotebookEdit`. For `Bash` it only understands
  `cat > file <<EOF` and `tee file <<EOF` heredocs with a literal path. `printf`, `echo`, `sed -i`, scripts that write
  files, `git apply`, and anything else that writes through the shell are not checked. Claude Code's `if` filter for
  Bash is best-effort, and the hook's own parser is intentionally conservative.
- **MCP tools and subprocesses** that write files are not checked.
- **Strings used as comments**, such as a bare Python string statement, are detected in Python only.
- **Configuration.** Anyone can edit `.readability.json`, set `READABILITY_MODE=off`, or disable the plugin. Edits made
  by Claude to the readability configuration are turned into a permission prompt, but that is a speed bump.
- **Exception tags** can be applied to narration. They are an auditable claim, not a proof.

Eval runs measure how often an agent routes around the hook (shell writes after a rejection) so this can be watched
rather than assumed.

## Security tools are out of scope

Suppressing a security scanner (Bandit `# nosec`, tfsec, Checkov, Semgrep, ...) goes through the same suppression policy
as any other linter: it is recognized, and it must be specific and justified in balanced mode (advisory mode reports it). That is a readability
and hygiene rule. Use your CI and code review, not this hook, to enforce security policy.
