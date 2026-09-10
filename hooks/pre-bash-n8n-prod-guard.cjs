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
  'workflow:delete': ['deploy', 'cook'],
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
const ARTIFACT_DIR_RE = /^n8n-(deploy|fix|promote|credentials|rollback|cook)-/;

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
    const ids = new Set();
    let fresh = false;
    for (const marker of ['context-snippets.json', 'verification.json']) {
      const p = path.join(artifactsDir, name, marker);
      try {
        if (now - fs.statSync(p).mtimeMs > ARTIFACT_MAX_AGE_MS) continue;
        fresh = true;
        const json = JSON.parse(fs.readFileSync(p, 'utf8'));
        for (const k of ['workflow_id', 'workflowId']) {
          if (json && json[k] !== undefined && json[k] !== null) ids.add(String(json[k]));
        }
      } catch (_) { /* marker absent, or present-but-unparseable: freshness already recorded */ }
    }
    if (fresh) out.push({ skill: dm[1], ids: [...ids] });
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
          'with context-snippets.json / verification.json (valid 30 min). An artifact from a DIFFERENT skill\n' +
          'or a DIFFERENT workflow does not authorize this write — that is the point of the gate.\n' +
          '(Emergency override, not a daily workflow: N8NKIT_PROD_GUARD=off.)\n'
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
module.exports = { main, freshApprovalArtifacts, findArtifactsDir, findMutatingInvocations, authorizes, MUTATING_VERBS, VERB_SKILLS };
