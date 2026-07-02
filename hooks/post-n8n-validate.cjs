#!/usr/bin/env node
// post-n8n-validate — fast-feedback validation after writing an n8n workflow JSON (PostToolUse Write|Edit).
// WARN-ONLY: PostToolUse runs AFTER the write, so it cannot block — it only surfaces feedback (always exit 0).
// COMPLETE-GATED: only validates a parsed, complete workflow (nodes[] non-empty + connections) → no draft spam.
// FAIL-LOUD: if the validator (n8nctl) can't run, says so loudly — never silently pretends "valid".
const fs = require('fs');
const { execSync } = require('child_process');
const { safeHook, readInput, isWorkflowJsonPath } = require('./_lib.cjs');

// Full n8n export key set — warn only on keys OUTSIDE this (genuinely unknown), not on normal id/active/meta/etc.
const KNOWN_TOP_LEVEL = new Set([
  'name', 'nodes', 'connections', 'settings', 'id', 'active', 'meta', 'pinData', 'staticData',
  'versionId', 'createdAt', 'updatedAt', 'tags', 'triggerCount', 'shared', 'isArchived', 'description',
]);

safeHook('post-n8n-validate', () => {
  const data = readInput();
  const file = (data.tool_input && data.tool_input.file_path) || '';
  if (!isWorkflowJsonPath(file, data)) return; // scope: workflow JSON only (config-driven root + legacy fallback)

  let wf;
  try {
    wf = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return; // not valid JSON yet (mid-write) — stay silent
  }
  // complete-gate: skip drafts
  if (!wf || !Array.isArray(wf.nodes) || wf.nodes.length === 0 || typeof wf.connections !== 'object') return;

  // extra-field warning (only genuinely-unknown top-level keys)
  const unknown = Object.keys(wf).filter((k) => !KNOWN_TOP_LEVEL.has(k));
  if (unknown.length) {
    process.stderr.write(`[post-n8n-validate] note: unknown top-level field(s) ${unknown.join(', ')} — n8nctl strips to {name,nodes,connections,settings} on deploy; a raw curl would 400.\n`);
  }

  // validate via n8nctl (local file check, no network). WARN-only.
  try {
    const out = execSync(`n8nctl workflow validate "${file}" --profile ci`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
    });
    if (out && out.trim()) process.stderr.write(`[post-n8n-validate] ${out.trim()}\n`);
  } catch (err) {
    const stdout = (err.stdout || '').toString().trim();
    const stderr = (err.stderr || '').toString().trim();
    const enoent = err.code === 'ENOENT' || /not recognized|not found|ENOENT/i.test(stderr);
    if (enoent) {
      // FAIL-LOUD: validator unavailable — do NOT pretend valid
      process.stderr.write('[post-n8n-validate] WARN: n8nctl not found — validate-on-write is INACTIVE. Install @trngthnh369/n8nctl globally to restore fast-feedback validation.\n');
    } else if (stdout) {
      // validation issues (n8nctl exits non-zero) — surface as warning, never block
      process.stderr.write(`[post-n8n-validate] issues found (warn-only):\n${stdout}\n`);
    } else if (stderr) {
      process.stderr.write(`[post-n8n-validate] WARN: validator error: ${stderr}\n`);
    }
  }
});
