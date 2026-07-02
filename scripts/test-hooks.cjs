#!/usr/bin/env node
// Phase-2 guard test harness. Spawns each hook as a child process with controlled stdin (PreToolUse/PostToolUse
// JSON), asserts the block/warn/exit behavior. Run: node scripts/test-hooks.cjs
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.resolve(__dirname, '..', 'hooks');
// Fixture dir MUST contain "build-workflow" so the path-scope regex matches.
const DIR = path.join(os.tmpdir(), 'n8nkit-test', 'build-workflow');
fs.mkdirSync(DIR, { recursive: true });

const uuid = (n) => `a1b2c3d4-0000-4000-8000-00000000000${n}`;
const validWf = {
  name: 'ping',
  nodes: [
    { id: uuid(1), name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: {} },
    { id: uuid(2), name: 'Set', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [250, 0], parameters: {} },
    { id: uuid(3), name: 'NoOp', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [500, 0], parameters: {} },
  ],
  connections: {
    'Schedule Trigger': { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
    Set: { main: [[{ node: 'NoOp', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataErrorExecution: 'all' },
};
const invalidWf = { name: 'bad', nodes: [{ id: 'x', name: 'Broken', position: [0, 0], parameters: {} }], connections: {}, settings: {} };
const extraWf = { ...validWf, bogusField: 123, executionData: {} };
const draft = '{"name":"x","nodes":[';

const fValid = path.join(DIR, 'valid.json'); fs.writeFileSync(fValid, JSON.stringify(validWf));
const fInvalid = path.join(DIR, 'invalid.json'); fs.writeFileSync(fInvalid, JSON.stringify(invalidWf));
const fExtra = path.join(DIR, 'extra.json'); fs.writeFileSync(fExtra, JSON.stringify(extraWf));
const fDraft = path.join(DIR, 'draft.json'); fs.writeFileSync(fDraft, draft);
const wfPath = path.join(DIR, 'wf.json');

function run(hook, input) {
  const r = spawnSync('node', [path.join(HOOKS, hook)], { input: JSON.stringify(input), encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
}

console.log('== pre-n8n-secret-guard ==');
let r = run('pre-n8n-secret-guard.cjs', { tool_input: { file_path: wfPath, content: '{"auth":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N"}' } });
check('JWT/Bearer → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-n8n-secret-guard.cjs', { tool_input: { file_path: wfPath, content: '{"password":"hunter2hunter2hunter2"}' } });
check('generic password literal → WARN only (exit 0)', r.code === 0 && /WARN/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-n8n-secret-guard.cjs', { tool_input: { file_path: wfPath, content: '{"note":"normal workflow, no secret here"}' } });
check('clean content → no block, no warn (exit 0, silent)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

// fallback assertion: rename patterns json, ensure provider block still fires + fail-loud
const pj = path.join(HOOKS, 'secret-patterns.json'); const pjb = pj + '.testbak';
fs.renameSync(pj, pjb);
r = run('pre-n8n-secret-guard.cjs', { tool_input: { file_path: wfPath, content: 'AKIAIOSFODNN7EXAMPLE1' } });
fs.renameSync(pjb, pj);
check('patterns.json missing → fail-loud WARN + still BLOCK via fallback (exit 2)', r.code === 2 && /could not load/.test(r.out) && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

console.log('== post-n8n-validate (WARN-only, exit 0 always) ==');
r = run('post-n8n-validate.cjs', { tool_input: { file_path: fExtra } });
check('extra-field → note unknown fields (exit 0)', r.code === 0 && /bogusField/.test(r.out) && /executionData/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('post-n8n-validate.cjs', { tool_input: { file_path: fInvalid } });
check('invalid complete workflow → issues surfaced (exit 0)', r.code === 0 && r.out.trim() !== '', `code=${r.code} out=${r.out.trim()}`);

r = run('post-n8n-validate.cjs', { tool_input: { file_path: fDraft } });
check('draft (incomplete JSON) → SILENT (exit 0, no spam)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

r = run('post-n8n-validate.cjs', { tool_input: { file_path: fValid } });
check('valid workflow → exit 0', r.code === 0, `code=${r.code} out=${r.out.trim()}`);

console.log('== secret-pattern single-source (fallback ⊆ json) ==');
// The crash-safe inlined FALLBACK_BLOCK must be a SUBSET of the canonical secret-patterns.json:
// it may never block something the json wouldn't. Some fallback entries are COMBINED regexes
// (e.g. one GitHub pattern) that the json splits into granular per-prefix patterns — this mapping
// declares that equivalence explicitly (a plain name-equality check would fail on those).
const { FALLBACK_BLOCK } = require(path.join(HOOKS, 'pre-n8n-secret-guard.cjs'));
const patternsJson = JSON.parse(fs.readFileSync(path.join(HOOKS, 'secret-patterns.json'), 'utf8'));
const jsonBlockNames = new Set(patternsJson.patterns.filter((p) => p.action === 'block').map((p) => p.name));
// fallback name → the json block pattern name(s) that together cover it
const FALLBACK_TO_JSON = {
  'JWT': ['JWT'],
  'Google API key': ['Google API key'],
  'AWS access key': ['AWS access key'],
  'AWS session token': ['AWS session token'],
  'Bearer token': ['Bearer token'],
  'OpenAI API key': ['OpenAI API key'],
  'Anthropic API key': ['Anthropic API key'],
  'GitHub token': ['GitHub PAT (classic)', 'GitHub OAuth token', 'GitHub user-to-server', 'GitHub server-to-server', 'GitHub refresh token'],
  'Stripe live key': ['Stripe live secret key', 'Stripe live restricted key'],
  'Slack token': ['Slack token'],
  'PEM private key': ['PEM private key'],
};
for (const fb of FALLBACK_BLOCK) {
  const mapped = FALLBACK_TO_JSON[fb.name];
  check(`fallback "${fb.name}" is mapped`, Array.isArray(mapped) && mapped.length > 0,
    'add a mapping entry in FALLBACK_TO_JSON when introducing a new fallback pattern');
  if (Array.isArray(mapped)) {
    const missing = mapped.filter((n) => !jsonBlockNames.has(n));
    check(`fallback "${fb.name}" covered by json block pattern(s)`, missing.length === 0,
      `missing from secret-patterns.json (action=block): ${missing.join(', ')}`);
  }
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
