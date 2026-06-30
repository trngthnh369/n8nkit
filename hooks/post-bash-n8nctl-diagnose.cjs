#!/usr/bin/env node
// Post-execute diagnose hint for n8nctl commands.
// If an n8nctl command errored → suggest /n8n-fix to user.
// Non-blocking (exit 0), warning only.
const { safeHook, readInput } = require('./_lib.cjs');

// n8nctl error signatures in stderr/stdout
const ERROR_PATTERNS = [
  /execution.*failed/i,
  /status:\s*(error|failed|crashed)/i,
  /Error:\s*\w+/i,
  /HTTP\s+(4\d{2}|5\d{2})/,
  /ECONNREFUSED|ETIMEDOUT/i,
  /ValidationError|WorkflowActivationError/i,
];

safeHook('post-bash-n8nctl-diagnose', () => {
  const data = readInput();
  const cmd = (data.tool_input && data.tool_input.command) || '';
  if (!/\bn8nctl\b/.test(cmd)) return;

  const resp = data.tool_response || {};
  const output = [
    resp.stdout || '',
    resp.stderr || '',
    resp.output || '',
    resp.error || '',
  ].join('\n');

  // Check success: exit code present and === 0
  const exitCode = (resp.exit_code !== undefined) ? resp.exit_code
                 : (resp.exitCode !== undefined) ? resp.exitCode
                 : null;

  const hasError = ERROR_PATTERNS.some(re => re.test(output)) ||
                   (exitCode !== null && exitCode !== 0);

  if (!hasError) return;

  // Extract workflow id/name if possible
  const idMatch = cmd.match(/\b(?:workflow|execution)\s+(?:update|get|execute|trigger|debug)\s+([A-Za-z0-9_-]+)/i);
  const hint = idMatch ? ` (workflow/exec: ${idMatch[1]})` : '';

  const isExecution = /\bn8nctl\s+(execution|workflow\s+trigger|workflow\s+execute)\b/i.test(cmd);
  const suggestCmd = isExecution ? '/n8n-fix' : '/n8n-fix (or /fix for generic)';

  process.stderr.write(`\n[n8nctl-diagnose] ⚠️  Error detected${hint}.\n`);
  process.stderr.write(`Suggest: ${suggestCmd} to self-heal with retry.\n`);
});
