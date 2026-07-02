#!/usr/bin/env node
// pre-bash-n8n-prod-guard — fail-closed production-write gate (PreToolUse Bash|PowerShell).
//
// WHY THIS EXISTS: the user's harness runs in permission-bypass mode, so a prose "ask the user
// first" gate inside a SKILL.md is NOT a control plane — a model can still run a mutating n8nctl
// command directly. This hook is the deterministic compensating control (same pattern as the
// negative-tested pre-n8n-secret-guard). n8n execution text is untrusted input (a prompt-injection
// path to a write), so the last line of defense must be deterministic, not procedural.
//
// TWO CHECKS:
//   1. Mutating n8nctl verbs (workflow update|promote|activate|delete|import|rollback, credential
//      create) require a FRESH approval artifact — one that a skill gate (deploy/fix/promote/
//      credentials/rollback) just produced. No fresh artifact → exit 2 (blocked).
//   2. Shell-writes of a provider secret into a workflow JSON path → exit 2 (covers the write path
//      the Write|Edit secret guard can't see: Set-Content / redirection / fs.writeFile).
//
// Read-only verbs (get/list/validate/diff/backup/export/schema/...) never match → zero friction.
// Escape hatch: env N8NKIT_PROD_GUARD=off (documented, for emergencies). Default ON.
const fs = require('fs');
const path = require('path');
const { safeHook, readInput, resolveWorkflowRoot } = require('./_lib.cjs');

const ARTIFACT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const MUTATING_RE = /n8nctl\s+workflow\s+(?:update|promote|activate|delete|import|rollback)\b|n8nctl\s+credential\s+create\b/;
const WRITE_OP_RE = /(?:>>?|\bSet-Content\b|\bOut-File\b|\bAdd-Content\b|\btee\b|fs\.(?:appendFile|writeFile)(?:Sync)?)/;
const ARTIFACT_DIR_RE = /^n8n-(?:deploy|fix|promote|credentials|rollback)-/;

// Walk up from startDir to find the nearest .claude/artifacts directory (project root, even from a subdir).
function findArtifactsDir(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10 && dir; i++) {
    const candidate = path.join(dir, '.claude', 'artifacts');
    try { if (fs.statSync(candidate).isDirectory()) return candidate; } catch (_) { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// True if a skill approval artifact was produced within the freshness window.
function hasFreshApprovalArtifact(cwd) {
  const artifactsDir = findArtifactsDir(cwd || process.cwd());
  if (!artifactsDir) return false;
  let entries;
  try { entries = fs.readdirSync(artifactsDir); } catch (_) { return false; }
  const now = Date.now();
  for (const name of entries) {
    if (!ARTIFACT_DIR_RE.test(name)) continue;
    for (const marker of ['context-snippets.json', 'verification.json']) {
      const p = path.join(artifactsDir, name, marker);
      try {
        if (now - fs.statSync(p).mtimeMs <= ARTIFACT_MAX_AGE_MS) return true;
      } catch (_) { /* marker absent */ }
    }
  }
  return false;
}

// Load the block-action secret regexes from the canonical pattern file (best-effort).
function loadBlockPatterns() {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(__dirname, 'secret-patterns.json'), 'utf8'));
    return (json.patterns || [])
      .filter((p) => p.action !== 'warn')
      .map((p) => new RegExp(p.re, p.flags || ''));
  } catch (_) {
    // Minimal fail-safe set — better to catch the obvious ones than nothing.
    return [/AKIA[0-9A-Z]{16}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, /sk-ant-[A-Za-z0-9_-]{32,}/];
  }
}

function main() {
  safeHook('pre-bash-n8n-prod-guard', () => {
    if (process.env.N8NKIT_PROD_GUARD === 'off') return;
    const data = readInput();
    const cmd = (data.tool_input && data.tool_input.command) || '';
    if (!cmd) return;

    // --- Check 1: mutating verb needs a fresh approval artifact ---
    const isDryOrHelp = /--dry-run\b|--help\b|(?:^|\s)-h(?:\s|$)/.test(cmd);
    if (MUTATING_RE.test(cmd) && !isDryOrHelp) {
      if (!hasFreshApprovalArtifact(data.cwd)) {
        process.stderr.write(
          'BLOCKED: production-write n8nctl verb without a fresh approval artifact.\n' +
          'Run the matching skill gate first (/n8n-deploy, /n8n-fix, /n8n-promote, /n8n-credentials, /n8n-rollback),\n' +
          'which creates .claude/artifacts/n8n-<skill>-<id>/ after you confirm. (Emergency override: N8NKIT_PROD_GUARD=off.)\n'
        );
        process.exit(2);
      }
    }

    // --- Check 2: shell-write of a provider secret into a workflow JSON path ---
    if (WRITE_OP_RE.test(cmd) && /\.json\b/.test(cmd)) {
      const root = resolveWorkflowRoot(null, data);
      const touchesWorkflowArea =
        /build-workflow/i.test(cmd) || (root && cmd.toLowerCase().includes(String(root).replace(/\\/g, '/').toLowerCase()));
      if (touchesWorkflowArea) {
        for (const re of loadBlockPatterns()) {
          if (re.test(cmd)) {
            process.stderr.write('BLOCKED: shell-write of a hardcoded secret into a workflow JSON. Use an n8n credential reference instead.\n');
            process.exit(2);
          }
        }
      }
    }
  });
}

if (require.main === module) main();
module.exports = { main, hasFreshApprovalArtifact, findArtifactsDir, MUTATING_RE };
