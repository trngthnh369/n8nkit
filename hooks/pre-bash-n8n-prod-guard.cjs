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
//   1. Mutating n8nctl verbs require a FRESH and RELEVANT approval artifact: produced by a skill
//      that actually performs that verb, and naming the workflow being written. Presence alone is
//      not authorization — a /n8n-credentials artifact does not authorize activating workflow 42.
//      `workflow delete` is the strictest case: only a /n8n-retire artifact (15-min window) whose
//      verification.json carries the three self-measured proofs and a hash-matching backup lets it
//      through, and it authorizes that one id and nothing else.
//      Only a real invocation counts: `n8nctl` must sit at a command position, not inside a quoted
//      argument, so echo/grep/commit-message mentions are no longer blocked. Otherwise → exit 2.
//   2. Shell-writes of a provider secret into a workflow JSON path → exit 2 (covers the write path
//      the Write|Edit secret guard can't see: Set-Content / redirection / fs.writeFile).
//
// Read-only verbs (get/list/validate/diff/backup/export/schema/...) never match → zero friction.
// Escape hatch: env N8NKIT_PROD_GUARD=off (documented, for emergencies). Default ON.
//
// ⚠️ SCOPE — this gate stops ACCIDENTS, not INTENT. It inspects the artifact's CONTENT (right skill,
// right workflow id), never its PROVENANCE: an artifact is just JSON under .claude/artifacts/, so
// anyone — a model taking a shortcut included — can hand-write a matching one and walk straight
// through. Closing that needs an artifact only a skill can produce (signature / transcript-anchored
// session id / a confirm outside the agent's reach). Open debt, see docs/NOTES-followups.md.
const fs = require('fs');
const path = require('path');
const { safeHook, readInput, resolveWorkflowRoot } = require('./_lib.cjs');

const ARTIFACT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
// Per-skill override. /n8n-retire authorizes an IRREVERSIBLE delete on evidence it measured itself
// (active=false, zero references, zero executions) — evidence that goes stale faster than a deploy
// plan does, so its window is tighter.
const SKILL_MAX_AGE_MS = { retire: 15 * 60 * 1000 };
// Keep in sync with n8nctl's mutating surface (1.5.0). Covers the CLI's aliases (wf/exec/cred/sc,
// delete|rm). Read verbs (list/get/status/backup/validate/normalize/schema/diff/scaffold/export-all/
// watch/verify) are deliberately absent — zero friction, see the header. `run`/`trigger-webhook`
// execute a workflow but change neither its definition nor its active state, and they ARE the
// /n8n-test verification loop, so they stay ungated (documented residual risk).
const MUTATING_VERBS = {
  workflow: /^(?:create|update|deploy|activate|deactivate|refresh|restore|import|rollback|tag|promote|transfer|delete|rm)$/,
  credential: /^(?:create|delete|rm|transfer)$/,
  execution: /^(?:delete|rm)$/,
  tag: /^(?:update|delete|rm)$/,
  'source-control': /^pull$/,
  user: /^(?:invite|delete|rm|role)$/,
  project: /^(?:create|update|delete|rm|add-user|remove-user)$/,
};
// RELEVANCE, not mere presence. <resource>:<verb> → the skills whose SKILL.md actually runs it, so
// an artifact only authorizes what its own skill does (e.g. /n8n-credentials legitimately runs
// `workflow update` for rotation — skills/n8n-credentials/SKILL.md:81 — but never activate/delete).
// A key absent here is a governance/bulk verb no skill owns (tag, source-control, user, project):
// those keep the previous "any fresh approval artifact" behaviour rather than becoming unusable.
const VERB_SKILLS = {
  'workflow:create': ['deploy', 'cook'],
  'workflow:update': ['deploy', 'fix', 'credentials', 'cook'],
  'workflow:deploy': ['deploy', 'cook'],
  'workflow:activate': ['deploy', 'cook'],
  'workflow:deactivate': ['deploy', 'fix', 'cook'],
  'workflow:refresh': ['deploy', 'fix', 'cook'],
  'workflow:restore': ['deploy', 'rollback', 'cook'],
  'workflow:rollback': ['fix', 'rollback', 'cook'],
  'workflow:import': ['deploy', 'cook'],
  'workflow:tag': ['deploy', 'cook'],
  'workflow:delete': ['deploy', 'cook', 'retire'],
  'workflow:promote': ['promote', 'cook'],
  'workflow:transfer': ['promote', 'cook'],
  'credential:create': ['credentials', 'cook'],
  'credential:delete': ['credentials', 'cook'],
  'credential:transfer': ['credentials', 'cook'],
  'execution:delete': ['deploy', 'fix', 'cook'],
};
// Verbs taking <id> as first positional — the workflow the artifact must be bound to.
const ID_POSITIONAL = /^(?:update|activate|deactivate|refresh|rollback|promote|transfer|tag|delete|rm)$/;
const ALIASES = { wf: 'workflow', cred: 'credential', exec: 'execution', sc: 'source-control', rm: 'delete' };
// n8nctl at a COMMAND position (line start, or after a separator) — NOT inside a string argument.
// This is what stops `echo "... n8nctl workflow update ..."` / `--task "..."` from being blocked.
// The prefix alternation covers what may legitimately sit between a separator and the real command:
// shell keywords (`if true; then n8nctl ...` — a live bypass without them), launchers, and env
// assignments. A bare word like `echo` is NOT in it, so `echo n8nctl workflow update` stays allowed.
const N8NCTL_AT_CMD_POS = /(?:^|[;&|(){}\n`])\s*(?:(?:then|else|elif|do|time|nohup|exec|command|env|sudo|npx|-y|\w+=[^\s;|&]*)\s+)*(?:[^\s;|&"']*[\\/])?n8nctl(?:\.cmd|\.exe)?\s+/g;
const N8NCTL_ANYWHERE = /n8nctl(?:\.cmd|\.exe)?\s+/g;
// Constructs that would EXECUTE text we just blanked out of quotes/heredocs — re-scan and fail closed.
const SHELL_WRAPPER_RE = /\b(?:bash|sh|zsh|pwsh|powershell)\b[^\n;&|]*\s-{1,2}(?:c|Command)\b|\bcmd(?:\.exe)?\s+\/[cCkK]\b|\beval\b|\bxargs\b|\bssh\b|Invoke-Expression|\biex\b|\bnode\s+-e\b|\|\s*(?:bash|sh|zsh|pwsh|powershell)\b/;
const WRITE_OP_RE = /(?:>>?|\bSet-Content\b|\bOut-File\b|\bAdd-Content\b|\btee\b|fs\.(?:appendFile|writeFile)(?:Sync)?)/;
const ARTIFACT_DIR_RE = /^n8n-(deploy|fix|promote|credentials|rollback|cook|retire)-/;

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

// /n8n-retire deletes a workflow for good, so its artifact is the only one whose CONTENT is checked,
// not just its name and freshness: the three pieces of evidence the skill had to measure itself, plus
// a backup that actually exists on disk and hashes to what the artifact claims. Anything missing,
// malformed, or contradicting ("active": true) → the artifact authorizes nothing. Fail-closed: a
// retire artifact that does not pass here degrades to "no artifact", which is a BLOCK.
const MAX_BACKUP_BYTES = 20 * 1024 * 1024; // hook budget is 5s — refuse to hash anything bigger
function retireEvidenceOk(ev) {
  if (!ev || typeof ev !== 'object') return false;
  if (ev.active !== false) return false;
  const refs = ev.references, ex = ev.executions, bk = ev.backup;
  if (!refs || refs.count !== 0 || !(refs.scanned_workflows > 0)) return false;
  // An empty execution list only means "no executions" when the same query shape returned rows for
  // some OTHER workflow in the same sweep — otherwise empty means "could not read".
  if (!ex || ex.count !== 0 || !ex.positive_control || !(ex.positive_control.count > 0)) return false;
  if (!bk || typeof bk.path !== 'string' || !/^[0-9a-f]{64}$/.test(String(bk.sha256 || ''))) return false;
  try {
    const st = fs.statSync(bk.path);
    if (!st.isFile() || st.size === 0 || st.size > MAX_BACKUP_BYTES) return false;
    const sha = require('crypto').createHash('sha256').update(fs.readFileSync(bk.path)).digest('hex');
    if (sha !== bk.sha256) return false;
  } catch (_) { return false; }
  return true;
}

// Fresh skill approval artifacts as {skill, ids}. `ids` are the workflow ids the artifact NAMES
// (marker `workflow_id`); empty means the artifact binds to no specific workflow.
function freshApprovalArtifacts(cwd) {
  const artifactsDir = findArtifactsDir(cwd || process.cwd());
  if (!artifactsDir) return [];
  let entries;
  try { entries = fs.readdirSync(artifactsDir); } catch (_) { return []; }
  const now = Date.now();
  const out = [];
  for (const name of entries) {
    const dm = ARTIFACT_DIR_RE.exec(name);
    if (!dm) continue;
    const skill = dm[1];
    const maxAge = SKILL_MAX_AGE_MS[skill] || ARTIFACT_MAX_AGE_MS;
    const ids = new Set();
    let fresh = false;
    let verification = null;
    for (const marker of ['context-snippets.json', 'verification.json']) {
      const p = path.join(artifactsDir, name, marker);
      try {
        if (now - fs.statSync(p).mtimeMs > maxAge) continue;
        fresh = true;
        const json = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (marker === 'verification.json') verification = json;
        for (const k of ['workflow_id', 'workflowId']) {
          if (json && json[k] !== undefined && json[k] !== null) ids.add(String(json[k]));
        }
      } catch (_) { /* marker absent, or present-but-unparseable: freshness already recorded */ }
    }
    if (skill === 'retire' && !retireEvidenceOk(verification)) continue;
    if (fresh) out.push({ skill, ids: [...ids] });
  }
  return out;
}

// Blank out quoted literals and heredoc bodies: text in there is DATA the shell passes along,
// not a command it runs. Without this the guard blocks echo/grep/commit-message/--task arguments.
// Blanking is LENGTH-PRESERVING (newlines kept) so offsets into the result still index the raw
// command — token VALUES are then read back from the raw text, keeping quoted ids like "42" intact.
function stripInertText(cmd) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return cmd
    .replace(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1[\s\S]*?^\s*\2\s*$/gm, blank)
    .replace(/'[^']*'/g, blank)
    .replace(/"(?:[^"\\]|\\.)*"/g, blank);
}

const unquote = (s) => s.replace(/^["']+|["']+$/g, '');

// Parse mutating n8nctl invocations: positions come from `scanText`, values from `rawText`.
function scanInvocations(scanText, rawText, posRe) {
  const found = [];
  let m;
  posRe.lastIndex = 0;
  while ((m = posRe.exec(scanText)) !== null) {
    const start = m.index + m[0].length;
    const segLen = scanText.slice(start).split(/[;&|\n)]/)[0].length;
    const seg = rawText.slice(start, start + segLen);
    const tok = seg.trim().split(/\s+/).filter(Boolean).map(unquote);
    if (tok.length < 2) continue;
    const resource = ALIASES[tok[0]] || tok[0];
    const verbRe = MUTATING_VERBS[resource];
    if (!verbRe || !verbRe.test(tok[1])) continue;
    const verb = ALIASES[tok[1]] || tok[1];
    let id = null;
    const idFlag = seg.match(/--id[=\s]+(\S+)/);
    if (idFlag) id = unquote(idFlag[1]);
    else if (ID_POSITIONAL.test(verb)) id = tok.slice(2).find((t) => !t.startsWith('-')) || null;
    found.push({ resource, verb, id, key: `${resource}:${verb}` });
  }
  return found;
}

// What this command would ACTUALLY run. Quoted mentions are ignored — EXCEPT when a shell wrapper
// would execute them, and then the raw scan is UNIONED in (not used as a fallback), so a command
// mixing an authorized invocation with a wrapped one still gets every invocation checked.
function findMutatingInvocations(cmd) {
  const found = scanInvocations(stripInertText(cmd), cmd, N8NCTL_AT_CMD_POS);
  if (SHELL_WRAPPER_RE.test(cmd)) found.push(...scanInvocations(cmd, cmd, N8NCTL_ANYWHERE));
  return found;
}

// An artifact authorizes an invocation only when it belongs to a skill that runs this verb AND,
// when it names workflow ids, the workflow being written is one of them.
function authorizes(artifact, inv) {
  // /n8n-retire is allowlisted, not merely relevance-checked: it authorizes exactly ONE delete of
  // exactly the id it measured. The generic rules below fall THROUGH for keys absent from
  // VERB_SKILLS (tag/source-control/user/project) and skip the id check when either side is
  // unbound — both are fine for a deploy plan, neither is acceptable for an irreversible delete.
  if (artifact.skill === 'retire') {
    if (inv.key !== 'workflow:delete') return false;
    if (!inv.id || !artifact.ids.length) return false;
    return artifact.ids.includes(String(inv.id));
  }
  const allowed = VERB_SKILLS[inv.key];
  if (allowed && !allowed.includes(artifact.skill)) return false;
  if (inv.resource === 'workflow' && inv.id && artifact.ids.length && !artifact.ids.includes(String(inv.id))) return false;
  return true;
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
    const invocations = isDryOrHelp ? [] : findMutatingInvocations(cmd);
    if (invocations.length) {
      const artifacts = freshApprovalArtifacts(data.cwd);
      const blocked = invocations.find((inv) => !artifacts.some((a) => authorizes(a, inv)));
      if (blocked) {
        const skills = VERB_SKILLS[blocked.key] || ['deploy', 'fix', 'promote', 'credentials', 'rollback', 'cook'];
        process.stderr.write(
          `BLOCKED: \`n8nctl ${blocked.resource} ${blocked.verb}\` needs a fresh approval artifact from a skill that\n` +
          `actually performs it. Authorized here: ${skills.map((s) => '/n8n-' + s).join(', ')}.\n` +
          (blocked.id ? `Target workflow: ${blocked.id} — the artifact must name this id as "workflow_id".\n` : '') +
          'HOW TO PROCEED: run that skill; after you confirm, it writes .claude/artifacts/n8n-<skill>-<id>/\n' +
          'with context-snippets.json / verification.json (valid 30 min; /n8n-retire: 15 min). An artifact\n' +
          'from a DIFFERENT skill or a DIFFERENT workflow does not authorize this write — that is the point\n' +
          'of the gate.\n' +
          (blocked.key === 'workflow:delete'
            ? 'For a delete, /n8n-retire is the intended path: its verification.json must carry the three\n' +
              'self-measured proofs (active=false, references.count=0 over a non-empty scan, executions.count=0\n' +
              'with a positive control) plus a backup whose sha256 matches the file on disk. Incomplete or\n' +
              'contradicted evidence does not authorize the delete.\n'
            : '') +
          // Deliberately NOT advertising the env override on a delete: reaching for the off switch
          // because there was no legal path is exactly what /n8n-retire exists to replace, and the
          // switch disables the gate for every other verb too.
          (blocked.key === 'workflow:delete' ? '' : '(Emergency override, not a daily workflow: N8NKIT_PROD_GUARD=off.)\n')
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
module.exports = { main, freshApprovalArtifacts, findArtifactsDir, findMutatingInvocations, authorizes, retireEvidenceOk, MUTATING_VERBS, VERB_SKILLS, SKILL_MAX_AGE_MS };
