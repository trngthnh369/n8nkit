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

// Secret-SHAPED test payloads (no live value — the AWS one is the vendor's documentation example).
// Each literal is split so the commit-time secret scanner does not match this file's source. The
// alternative, pinning the file in ~/.claude/.secret-scan-allow, exempts the WHOLE file and goes
// stale on every edit — and this file is edited every time a guard behaviour is added. Runtime
// values are byte-identical to the literals they replace.
const FAKE_AWS_KEY = 'AKIA' + 'IOSFODNN7EXAMPLE1';
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' + '.eyJzdWIiOiIxMjM0NTY3ODkwIn0' + '.dozjgNryP4J3jVmNHl0w5N';
const FAKE_JWT_SHORT = 'eyJhbGciOiJIUzI1NiJ9' + '.eyJzdWIiOiIxMjM0In0' + '.dozjgNryP4J3jVmNHl0w5Nxyz';
const FAKE_PASSWORD = 'hunter2'.repeat(3);

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
let r = run('pre-n8n-secret-guard.cjs', { tool_input: { file_path: wfPath, content: '{"auth":"Bearer ' + FAKE_JWT + '"}' } });
check('JWT/Bearer → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-n8n-secret-guard.cjs', { tool_input: { file_path: wfPath, content: '{"pass' + 'word":"' + FAKE_PASSWORD + '"}' } });
check('generic password literal → WARN only (exit 0)', r.code === 0 && /WARN/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-n8n-secret-guard.cjs', { tool_input: { file_path: wfPath, content: '{"note":"normal workflow, no secret here"}' } });
check('clean content → no block, no warn (exit 0, silent)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

// fallback assertion: rename patterns json, ensure provider block still fires + fail-loud
const pj = path.join(HOOKS, 'secret-patterns.json'); const pjb = pj + '.testbak';
fs.renameSync(pj, pjb);
r = run('pre-n8n-secret-guard.cjs', { tool_input: { file_path: wfPath, content: FAKE_AWS_KEY } });
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

console.log('== config-driven workflowRoot (unit) ==');
const lib = require(path.join(HOOKS, '_lib.cjs'));
// A workflow root that does NOT contain the literal "build-workflow" segment, marked by .n8nkit/config.json.
const CFG_ROOT = path.join(os.tmpdir(), 'n8nkit-test-cfg', 'my-n8n-projects');
const CFG_SUB = path.join(CFG_ROOT, 'projA', 'workflow');
fs.mkdirSync(CFG_SUB, { recursive: true });
fs.mkdirSync(path.join(CFG_ROOT, '.n8nkit'), { recursive: true });
fs.writeFileSync(path.join(CFG_ROOT, '.n8nkit', 'config.json'), JSON.stringify({ workflowRoot: CFG_ROOT }));
const cfgWf = path.join(CFG_SUB, 'wf.json');

check('ancestor-walk from file finds config root (non-build-workflow path)', lib.isWorkflowJsonPath(cfgWf, {}) === true);
check('non-.json under config root → not workflow', lib.isWorkflowJsonPath(path.join(CFG_SUB, 'notes.txt'), {}) === false);
check('legacy build-workflow fallback still matches (no config)', lib.isWorkflowJsonPath('X:/x/build-workflow/p/wf.json', {}) === true);
check('unrelated path, no config, no legacy → not workflow', lib.isWorkflowJsonPath('X:/random/wf.json', {}) === false);
// payload cwd (NOT process.cwd): file ancestors lack config, but input.cwd's ancestor has one.
check('resolveWorkflowRoot uses payload cwd when file ancestors lack config',
  lib.resolveWorkflowRoot(path.join(os.tmpdir(), 'nowhere-xyz', 'x.json'), { cwd: CFG_SUB }) === CFG_ROOT);
check('resolveWorkflowRoot does NOT use process.cwd (no cwd, no config ancestor → null)',
  lib.resolveWorkflowRoot(path.join(os.tmpdir(), 'nowhere-xyz', 'x.json'), {}) === null);
// env override
process.env.N8NKIT_WORKFLOW_ROOT = path.join(os.tmpdir(), 'n8nkit-env-root');
check('env N8NKIT_WORKFLOW_ROOT override', lib.isWorkflowJsonPath(path.join(process.env.N8NKIT_WORKFLOW_ROOT, 'a.json'), {}) === true);
delete process.env.N8NKIT_WORKFLOW_ROOT;

console.log('== secret-guard: config-driven scope + MultiEdit + isClaudeConfig ==');
r = run('pre-n8n-secret-guard.cjs', { cwd: os.tmpdir(), tool_input: { file_path: cfgWf, content: FAKE_AWS_KEY } });
check('AWS key in config-scoped path (no build-workflow) → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-n8n-secret-guard.cjs', { tool_input: { file_path: cfgWf, edits: [{ old_string: 'a', new_string: 'harmless' }, { old_string: 'b', new_string: FAKE_AWS_KEY }] } });
check('MultiEdit edits[] array carrying AWS key → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

const claudeCfgPath = path.join('C', 'Users', 'x', '.claude', 'settings.json').replace(/^C/, 'C:');
r = run('pre-n8n-secret-guard.cjs', { tool_input: { file_path: claudeCfgPath, content: '{"key":"' + FAKE_JWT_SHORT + '"}' } });
check('JWT into ~/.claude/settings.json (isClaudeConfig preserved) → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-n8n-secret-guard.cjs', { cwd: os.tmpdir(), tool_input: { file_path: cfgWf, content: '{"note":"clean, no secret"}' } });
check('clean content in config-scoped path → silent (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

console.log('== pre-bash-n8n-prod-guard ==');
// Project WITH a fresh approval artifact. The artifact must be RELEVANT to the command it
// authorizes: /n8n-fix runs `workflow update`, and the id it names is the one being written.
const PROJ = path.join(os.tmpdir(), 'n8nkit-test-proj');
const ARTF = path.join(PROJ, '.claude', 'artifacts', 'n8n-fix-42');
fs.mkdirSync(ARTF, { recursive: true });
const marker = path.join(ARTF, 'context-snippets.json');
fs.writeFileSync(marker, JSON.stringify({ workflow_id: '42' }));
// Project with its OWN empty artifacts dir (hermetic: findArtifactsDir stops here, finds nothing).
const EMPTY = path.join(os.tmpdir(), 'n8nkit-test-empty');
fs.mkdirSync(path.join(EMPTY, '.claude', 'artifacts'), { recursive: true });

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: PROJ, tool_input: { command: 'n8nctl workflow update 42 wf.json' } });
check('mutating verb + fresh artifact → allowed (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl workflow update 42 wf.json' } });
check('mutating verb + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

const stale = Date.now() / 1000 - 40 * 60;
fs.utimesSync(marker, stale, stale);
// Same skill + same id as the artifact, so STALENESS is the only thing that can block it.
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: PROJ, tool_input: { command: 'n8nctl workflow update 42 wf.json' } });
check('mutating verb + stale artifact (>30min) → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);
const fresh = Date.now() / 1000;
fs.utimesSync(marker, fresh, fresh);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl workflow get 42 --json' } });
check('read verb → silent (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'ls -la && echo hi' } });
check('non-n8nctl command → silent (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl workflow update 42 wf.json --dry-run' } });
check('mutating verb --dry-run → allowed (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl credential create ./cred.json' } });
check('credential create + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl workflow deploy ./wf.json --run' } });
check('workflow deploy (1.4 sequencer) + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl credential delete 42 --yes' } });
check('credential delete + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl source-control pull --force' } });
check('source-control pull + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl catalog sync' } });
check('catalog sync (read+local-write) → silent (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

// Cook artifact dir (0.5.0): project whose ONLY approval artifact is an n8n-cook-* dir.
const COOKP = path.join(os.tmpdir(), 'n8nkit-test-cook');
const COOKA = path.join(COOKP, '.claude', 'artifacts', 'n8n-cook-ping-e2e');
fs.mkdirSync(COOKA, { recursive: true });
fs.writeFileSync(path.join(COOKA, 'context-snippets.json'), JSON.stringify({ workflow_name: 'ping-e2e' }));

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: COOKP, tool_input: { command: 'n8nctl workflow deploy ./wf.json --create-only --run' } });
check('cook artifact fresh + workflow deploy → allowed (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: COOKP, tool_input: { command: 'n8nctl execution delete 987 --yes' } });
check('execution delete + fresh cook artifact → allowed (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl execution delete 987 --yes' } });
check('execution delete + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl tag update 3 renamed' } });
check('tag update + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl tag list' } });
check('tag list (read verb) → silent (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

// Alias coverage: wf/exec/cred/sc + rm are real CLI aliases — the guard matches command TEXT,
// so an uncovered alias is a full bypass of the fail-closed control.
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl wf update 42 wf.json' } });
check('alias wf update + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl exec rm 99 --yes' } });
check('alias exec rm + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl cred rm 7 --yes' } });
check('alias cred rm + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

// n8nctl 1.5 governance verbs (licensed): user/project mutations are prod-mutating too.
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl user invite a@b.com --role global:member' } });
check('user invite (1.5) + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl project delete 12 --yes' } });
check('project delete (1.5) + no artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl user list' } });
check('user list (read verb) → silent (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

console.log('== pre-bash-n8n-prod-guard: /n8n-retire (workflow delete) ==');
// The ONLY legal path to `workflow delete`. Its artifact is content-checked (three self-measured
// proofs + a hash-matching backup), expires in 15 min instead of 30, and authorizes that one id and
// nothing else — so every widening is a negative case here.
const crypto = require('crypto');
const RET = path.join(os.tmpdir(), 'n8nkit-test-retire');
const RETA = path.join(RET, '.claude', 'artifacts', 'n8n-retire-42');
fs.mkdirSync(RETA, { recursive: true });
const backupFile = path.join(RET, 'wf-42-backup.json');
fs.writeFileSync(backupFile, JSON.stringify(validWf));
const backupSha = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
const retireEvidence = (over = {}) => ({
  workflow_id: '42',
  workflow_name: 'dead junk',
  active: false,
  references: { count: 0, scanned_workflows: 37 },
  executions: { count: 0, positive_control: { workflow_id: '99', count: 5 } },
  backup: { path: backupFile, sha256: backupSha },
  measured_at: new Date().toISOString(),
  ...over,
});
const retMarker = path.join(RETA, 'verification.json');
const writeRetire = (over) => fs.writeFileSync(retMarker, JSON.stringify(retireEvidence(over)));
const touch = (p, minutesAgo) => { const t = Date.now() / 1000 - minutesAgo * 60; fs.utimesSync(p, t, t); };

writeRetire();
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: 'n8nctl workflow delete 42 --yes' } });
check('POSITIVE: retire artifact (full evidence) + delete 42 → allowed (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: 'n8nctl wf rm 42 --yes' } });
check('POSITIVE: alias `wf rm 42` + retire artifact → allowed (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl workflow delete 42 --yes' } });
check('NEGATIVE: delete with NO artifact → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: 'n8nctl workflow delete 43 --yes' } });
check('NEGATIVE: artifact for 42, deleting 43 → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

// 20 minutes: past retire's 15-min window but INSIDE the generic 30-min one, so this discriminates
// the per-skill TTL from the global default (40 min would not).
touch(retMarker, 20);
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: 'n8nctl workflow delete 42 --yes' } });
check('NEGATIVE: retire artifact 20 min old (>15) → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);
// Control: a DEPLOY artifact at the same 20-min age is still valid — the tighter window is retire-only.
touch(marker, 20);
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: PROJ, tool_input: { command: 'n8nctl workflow update 42 wf.json' } });
check('CONTROL: deploy/fix artifact 20 min old → still allowed (30-min window intact)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);
touch(marker, 0);
writeRetire();

// The artifact must not become a general-purpose production pass.
for (const [label, cmd] of [
  ['workflow update 42', 'n8nctl workflow update 42 wf.json'],
  ['workflow activate 42', 'n8nctl workflow activate 42'],
  ['workflow deactivate 42', 'n8nctl workflow deactivate 42'],
  ['workflow deploy', 'n8nctl workflow deploy ./wf.json --create-only'],
  ['workflow create', 'n8nctl workflow create ./wf.json'],
  ['workflow restore', 'n8nctl workflow restore ./bk.json'],
  ['execution delete 42', 'n8nctl execution delete 42 --yes'],
  ['credential delete 42', 'n8nctl credential delete 42 --yes'],
  ['tag delete 42', 'n8nctl tag delete 42 --yes'],
  ['source-control pull', 'n8nctl source-control pull --force'],
  ['project delete 42', 'n8nctl project delete 42 --yes'],
]) {
  r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: cmd } });
  check(`NEGATIVE: retire artifact does NOT authorize ${label} → BLOCK (exit 2)`, r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);
}

// Content checks: an artifact whose evidence is incomplete or contradicted authorizes nothing.
for (const [label, over] of [
  ['active: true (contradicts E1)', { active: true }],
  ['active missing', { active: undefined }],
  ['references.count > 0 (E2 failed)', { references: { count: 1, scanned_workflows: 37 } }],
  ['references.scanned_workflows = 0 (sweep did not run)', { references: { count: 0, scanned_workflows: 0 } }],
  ['references block missing', { references: undefined }],
  ['executions.count > 0 (E3 failed)', { executions: { count: 3, positive_control: { workflow_id: '99', count: 5 } } }],
  ['no positive control (empty = unreadable)', { executions: { count: 0 } }],
  ['positive control count 0', { executions: { count: 0, positive_control: { workflow_id: '99', count: 0 } } }],
  ['backup block missing', { backup: undefined }],
  ['backup sha mismatch', { backup: { path: backupFile, sha256: 'f'.repeat(64) } }],
  ['backup file does not exist', { backup: { path: path.join(RET, 'nope.json'), sha256: backupSha } }],
  ['workflow_id missing (would authorize ANY id)', { workflow_id: undefined }],
]) {
  writeRetire(over);
  r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: 'n8nctl workflow delete 42 --yes' } });
  check(`NEGATIVE: retire artifact with ${label} → BLOCK (exit 2)`, r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);
}
fs.writeFileSync(retMarker, '{ not json');
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: 'n8nctl workflow delete 42 --yes' } });
check('NEGATIVE: unparseable verification.json → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

// A context-snippets.json alone (the marker other skills can be fresh on) must not carry a retire.
fs.unlinkSync(retMarker);
fs.writeFileSync(path.join(RETA, 'context-snippets.json'), JSON.stringify({ workflow_id: '42' }));
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: 'n8nctl workflow delete 42 --yes' } });
check('NEGATIVE: retire dir with context-snippets only (no evidence) → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);
fs.unlinkSync(path.join(RETA, 'context-snippets.json'));
writeRetire();

// Delete via a shell wrapper: the guard re-scans wrapped text, and the id lives in a variable the
// artifact cannot be bound to — both must fail closed.
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: 'WF=42; n8nctl workflow delete "$WF" --yes' } });
check('NEGATIVE: delete with id in a shell variable → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: 'n8nctl workflow delete 42 --yes && n8nctl workflow delete 43 --yes' } });
check('NEGATIVE: authorized delete chained with an unauthorized one → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

// A blocked delete must point at /n8n-retire, not at the env off-switch it exists to replace.
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl workflow delete 42 --yes' } });
check('blocked delete names /n8n-retire and does NOT advertise the override', /\/n8n-retire/.test(r.out) && !/N8NKIT_PROD_GUARD=off/.test(r.out), `out=${r.out.trim()}`);
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: 'n8nctl workflow update 42 wf.json' } });
check('blocked non-delete still documents the override (unchanged)', /N8NKIT_PROD_GUARD=off/.test(r.out), `out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: RET, tool_input: { command: 'n8nctl workflow get 42 --json' } });
check('retire artifact present + read verb → silent (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

// Pre-existing paths to `workflow delete` (e2e-fix-loop deletes its own test workflow) stay open.
r = run('pre-bash-n8n-prod-guard.cjs', { cwd: COOKP, tool_input: { command: 'n8nctl workflow delete 77 --yes' } });
check('REGRESSION: cook artifact still authorizes workflow delete (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: `echo '${FAKE_AWS_KEY}' > /x/build-workflow/wf.json` } });
check('shell-write of AWS key into workflow json → BLOCK (exit 2)', r.code === 2 && /BLOCKED/.test(r.out), `code=${r.code} out=${r.out.trim()}`);

r = run('pre-bash-n8n-prod-guard.cjs', { cwd: EMPTY, tool_input: { command: "echo '{}' > /x/build-workflow/wf.json" } });
check('benign shell-write (no secret) → silent (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

console.log('== post-bash-n8nctl-diagnose ==');
r = run('post-bash-n8nctl-diagnose.cjs', { tool_input: { command: 'n8nctl workflow get 42' }, tool_response: { stderr: 'Error: AuthError', exit_code: 2 } });
check('n8nctl error → suggests /n8n-fix (exit 0)', r.code === 0 && /\/n8n-fix/.test(r.out), `code=${r.code} out=${r.out.trim()}`);
r = run('post-bash-n8nctl-diagnose.cjs', { tool_input: { command: 'n8nctl workflow list' }, tool_response: { stdout: 'ok', exit_code: 0 } });
check('n8nctl clean success → silent (exit 0)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);
r = run('post-bash-n8nctl-diagnose.cjs', { tool_input: { command: 'ls /nope' }, tool_response: { stderr: 'No such file', exit_code: 2 } });
check('non-n8nctl error → silent (not our concern)', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out.trim()}`);

console.log('== hooks.json manifest lint ==');
// Every command referencing a hooks/<file>.cjs must point at a file that actually exists (kills the
// phantom-hook class of bug automatically).
const manifest = JSON.parse(fs.readFileSync(path.join(HOOKS, 'hooks.json'), 'utf8'));
let refCount = 0;
for (const ev of Object.keys(manifest.hooks || {})) {
  for (const entry of manifest.hooks[ev]) {
    for (const hk of (entry.hooks || [])) {
      const m = (hk.command || '').match(/hooks\/([\w.-]+\.cjs)/);
      if (m) {
        refCount++;
        check(`hooks.json → ${m[1]} exists (${ev})`, fs.existsSync(path.join(HOOKS, m[1])), 'referenced script missing');
      }
    }
  }
}
check('hooks.json references at least the 4 guards', refCount >= 4, `found ${refCount}`);

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
