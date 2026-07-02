#!/usr/bin/env node
// pre-n8n-secret-guard — block hardcoded provider secrets in n8n workflow JSON + Claude config (PreToolUse Write|Edit).
// Upgrade of pre-write-n8n-secret: pattern set derived from @trngthnh369/n8n-workflow-validator (single source:
// secret-patterns.json next to this file). action=block → exit(2); action=warn → stderr only (no false-positive
// block on legit field names like token/secret/password). FAIL-SAFE: if the JSON can't load, fall back to an
// inlined provider set (blocking never silently disappears) and warn loudly.
const fs = require('fs');
const path = require('path');
const { safeHook, readInput } = require('./_lib.cjs');

// Inlined fallback — the high-entropy provider patterns only (action=block). Used if secret-patterns.json is missing.
const FALLBACK_BLOCK = [
  { name: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS session token', re: /ASIA[0-9A-Z]{16}/ },
  { name: 'Bearer token', re: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/ },
  { name: 'OpenAI API key', re: /sk-(proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{32,}/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{36}/ },
  { name: 'Stripe live key', re: /(sk|rk)_live_[A-Za-z0-9]{24,}/ },
  { name: 'Slack token', re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/ },
];

function loadPatterns() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'secret-patterns.json'), 'utf8');
    const json = JSON.parse(raw);
    const compiled = (json.patterns || []).map((p) => ({
      name: p.name,
      re: new RegExp(p.re, p.flags || ''),
      action: p.action === 'warn' ? 'warn' : 'block',
    }));
    if (compiled.length === 0) throw new Error('empty pattern set');
    return { patterns: compiled, degraded: false };
  } catch (err) {
    // FAIL-LOUD + FAIL-SAFE: warn, but still block on the inlined provider set (never silently pass).
    process.stderr.write(`[pre-n8n-secret-guard] WARN: could not load secret-patterns.json (${err.message}); using inlined provider fallback.\n`);
    return { patterns: FALLBACK_BLOCK.map((p) => ({ ...p, action: 'block' })), degraded: true };
  }
}

function main() {
  safeHook('pre-n8n-secret-guard', () => {
    const data = readInput();
    const file = (data.tool_input && data.tool_input.file_path) || '';
    const content = (data.tool_input && (data.tool_input.content || data.tool_input.new_string)) || '';

    const isWorkflowJson = /build-workflow[\\/].*\.json$/i.test(file);
    // Claude config: settings.json + any .bak under ~/.claude (plaintext keys leaked here before — 2026-06-10)
    const isClaudeConfig = /[\\/]\.claude[\\/](settings\.json|.*\.bak[^\\/]*)$/i.test(file);
    if (!isWorkflowJson && !isClaudeConfig) return;

    const where = isWorkflowJson ? 'workflow JSON' : 'Claude config file';
    const hint = isWorkflowJson ? 'Use an n8n credentials reference instead.' : 'Use an OS-level env var (setx) instead.';

    const { patterns } = loadPatterns();
    for (const pat of patterns) {
      if (pat.re.test(content)) {
        if (pat.action === 'block') {
          process.stderr.write(`BLOCKED: hardcoded ${pat.name} detected in ${where}. ${hint}\n`);
          process.exit(2);
        } else {
          // warn-only: surfaces a heads-up without blocking legit field names
          process.stderr.write(`[pre-n8n-secret-guard] WARN: possible secret near a "${pat.name}" field in ${where} — verify it is a credential reference, not a literal.\n`);
        }
      }
    }
  });
}

// Run as a hook only when invoked directly; when require()'d (e.g. by test-hooks.cjs)
// expose internals without executing the hook against stdin.
if (require.main === module) main();
module.exports = { FALLBACK_BLOCK, loadPatterns, main };
