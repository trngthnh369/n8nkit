#!/usr/bin/env node
// Block hardcoded secrets in n8n workflow JSON files + Claude Code config files
const { safeHook, readInput } = require('./_lib.cjs');

const SECRET_PATTERNS = [
  { name: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'AWS key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Bearer token', re: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/ },
  { name: 'OpenAI key', re: /sk-[A-Za-z0-9]{32,}/ },
  { name: 'GitHub PAT', re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
];

safeHook('pre-write-n8n-secret', () => {
  const data = readInput();
  const file = (data.tool_input && data.tool_input.file_path) || '';
  const content = (data.tool_input && (data.tool_input.content || data.tool_input.new_string)) || '';

  const isWorkflowJson = /build-workflow[\\/].*\.json$/i.test(file);
  // Claude Code config: settings.json + any .bak under ~/.claude (plaintext keys leaked here before — 2026-06-10)
  const isClaudeConfig = /[\\/]\.claude[\\/](settings\.json|.*\.bak[^\\/]*)$/i.test(file);
  if (!isWorkflowJson && !isClaudeConfig) return;

  for (const pat of SECRET_PATTERNS) {
    if (pat.re.test(content)) {
      const where = isWorkflowJson ? 'workflow JSON' : 'Claude config file';
      const hint = isWorkflowJson ? 'Use n8n credentials reference instead.' : 'Use OS-level env var (setx) instead.';
      process.stderr.write(`BLOCKED: hardcoded ${pat.name} detected in ${where}. ${hint}\n`);
      process.exit(2);
    }
  }
});
