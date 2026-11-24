const MAX_LISTED_FINDINGS = 8;
const MAX_COMMENT_PREVIEW = 160;

const GUIDANCE_BY_CATEGORY = {
  unnecessary:
    'Treat the perceived need for this comment as a potential readability smell. Reconsider whether naming, types, control flow, domain modeling, or function decomposition can express the same intent directly. Preserve existing behavior and avoid unnecessary abstractions. If the code is already sufficiently expressive, simply remove the redundant comment.',
  'unnecessary-documentation':
    'Documentation is welcome when it adds what a signature cannot say: contracts, units, error behavior, invariants, or usage constraints. Rewrite it to carry that information, or remove it if the name and types already say everything.',
  suppression:
    "Fix the underlying diagnostic when you can. Keep a suppression only when it is genuinely necessary: name the specific rule, use the narrowest scope, and give the reason using the tool's own justification syntax.",
  'suppression-broadened': 'Leave existing suppressions as they were unless changing them is part of the task. Do not widen their scope or rule list.',
  'documentation-circumvention':
    'This project requires documentation for this code. Write the documentation the linter asks for. Do not suppress or disable the documentation rule.',
  'directive-prose': "Keep tool directives exactly as the tool documents them. Put any necessary explanation in the tool's justification syntax, or express it in code.",
  'malformed-directive': "Use the tool's documented directive syntax exactly, or remove the comment.",
};

function preview(comment) {
  const singleLine = comment.replace(/\s*\n\s*/g, ' ⏎ ');
  return singleLine.length > MAX_COMMENT_PREVIEW ? `${singleLine.slice(0, MAX_COMMENT_PREVIEW - 1)}…` : singleLine;
}

function location(relativePath, finding) {
  return finding.endLine && finding.endLine !== finding.line ? `${relativePath}:${finding.line}-${finding.endLine}` : `${relativePath}:${finding.line}`;
}

function exceptionHint(config) {
  const tags = config.exceptions.tags.map((tag) => `${tag}:`).join(', ');
  return `If the comment conveys essential information that cannot be represented adequately in code (a business or regulatory constraint, security invariant, external limitation, third-party workaround, concurrency requirement, or historical decision), keep it and start it with one of these exception tags: ${tags}. Use the tags only for information the code cannot express.`;
}

export function describeFindings(results) {
  const lines = [];
  const findings = results.flatMap((result) => result.findings.map((finding) => ({ ...finding, relativePath: result.relativePath })));
  for (const finding of findings.slice(0, MAX_LISTED_FINDINGS)) {
    lines.push(`- ${location(finding.relativePath, finding)}  ${preview(finding.comment)}`);
    lines.push(`  reason: ${finding.reason}`);
    if (finding.docs) lines.push(`  directive syntax: ${finding.docs}`);
  }
  if (findings.length > MAX_LISTED_FINDINGS) lines.push(`- …and ${findings.length - MAX_LISTED_FINDINGS} more`);
  return { lines, findings };
}

export function blockMessage(results, config) {
  const { lines, findings } = describeFindings(results);
  if (config.feedback === 'minimal') {
    return [
      `readability: edit blocked. ${findings.length === 1 ? 'A comment in this edit is' : `${findings.length} comments in this edit are`} not permitted.`,
      ...lines.filter((line) => line.startsWith('- ')),
    ].join('\n');
  }
  const categories = [...new Set(findings.map((finding) => finding.category))];
  const opening = categories.includes('unnecessary')
    ? `This edit introduces ${findings.length === 1 ? 'an unnecessary explanatory comment' : `${findings.length} comments that look unnecessary or unauthorized`}.`
    : `This edit introduces ${findings.length === 1 ? 'a comment' : `${findings.length} comments`} that the readability policy does not permit.`;
  const guidance = categories.map((category) => GUIDANCE_BY_CATEGORY[category]).filter(Boolean);
  const parts = [`readability: ${opening}`, '', ...lines, '', ...guidance];
  if (categories.includes('unnecessary') || categories.includes('unnecessary-documentation')) parts.push(exceptionHint(config));
  parts.push('Do not add a linter suppression, modify linter configuration, or edit the readability configuration to get around this check.');
  return parts.join('\n');
}

export function advisoryMessage(results) {
  const { lines } = describeFindings(results);
  return [
    'readability (advisory): these new comments may be unnecessary. If a comment only says what the code does, consider expressing it in the code (names, types, control flow) instead. Keep any comment that records a reason, rule, precondition, or external fact the code cannot express. No change is required.',
    ...lines,
  ].join('\n');
}

export function configProtectionMessage(relativePath) {
  return `readability: ${relativePath} is the readability plugin's own configuration. Changing it changes how comments are checked, so the user must approve this edit. Only proceed if the user asked for this change.`;
}

export function weakenedDocumentationMessage(relativePath, weakened) {
  const details = weakened.slice(0, 6).map((item) => `- ${item.entry.tool} ${item.entry.rule} for ${item.entry.family} ${item.kind} declarations: ${item.change}`);
  return [
    `readability: this edit to ${relativePath} weakens the project's documentation requirements:`,
    ...details,
    'Write the required documentation instead of relaxing the linter. The user must approve this edit; only proceed if the user asked for this configuration change.',
  ].join('\n');
}

export function retryReleaseMessage(results) {
  const { lines } = describeFindings(results);
  return [
    'readability: allowing this edit after repeated rejections of the same comments, to avoid a retry loop. Mention these comments to the user so they can review them:',
    ...lines.filter((line) => line.startsWith('- ')),
  ].join('\n');
}
