---
name: n8n-retire
description: 'Retire (delete) a dead n8n workflow on PRODUCTION after self-measuring three mandatory proofs — inactive, referenced by nobody, zero executions — plus a full backup. Auto-triggers ONLY when the user explicitly says retire/delete/xoá/dọn/gỡ a workflow WITH a specific workflow ID. Production-touching and IRREVERSIBLE. Fail-closed: any proof missing, unmeasurable, or contradicted → refuse, do not ask again. Never auto-executes on ambiguous cleanup/dọn dẹp/tắt phrasing. Also invokable manually as `/n8n-retire <workflowId...>`.'
argument-hint: <workflowId...>
allowed-tools: Read, Write, Bash, Glob
---

# n8n Retire — Evidence-Gated Workflow Deletion

> This skill exists because `n8nctl workflow delete` had **no legitimate path** through
> `pre-bash-n8n-prod-guard`: only `/n8n-deploy` and `/n8n-cook` produce an authorizing artifact, and
> neither is what you run to clean up junk. The practical consequence was people reaching for
> `N8NKIT_PROD_GUARD=off`, which disables the whole gate for every verb. A narrow, evidence-heavy
> legal path is safer than an off switch.

> `<workflowRoot>` = the n8n projects root, read from `.n8nkit/config.json` (`workflowRoot` key);
> default `D:/Projects/work/build-workflow`.

## ⚠️ MANDATORY PRE-INVOCATION CHECK (read before any procedure step)

1. **Explicit retire intent**: the user used a clear verb — `retire`/`delete`/`remove`/`xoá`/`gỡ`/
   `dọn workflow`. `cleanup`/`dọn dẹp`/`tắt`/`disable`/`archive` ALONE are AMBIGUOUS (deactivating is
   not deleting). On ambiguous phrasing, STOP and ask:
   > "Bạn muốn XOÁ HẲN workflow `<id>` khỏi production `$N8N_HOST` (không khôi phục được qua UI), hay chỉ deactivate?"
2. **Specific workflow ID(s) provided**. No id → STOP and ask. Never resolve "the junk ones" yourself
   from a name, a tag, or a monitor report — the user names the ids.
3. **Irreversibility**: deletion removes the workflow AND its execution history from n8n. The only
   recovery is `n8nctl workflow create <backup.json>`, which produces a NEW id — inbound webhook URLs
   and any `executeWorkflow` reference by id do NOT survive.
4. **One id at a time**: multiple ids are processed strictly sequentially, each with its own full
   evidence round, its own artifact and its own confirmation. Never batch-measure and batch-delete.

**If ANY check fails → STOP, ask the user, do not proceed.**

---

## ⚠️ EVIDENCE CONTRACT (fail-closed — this is the whole point of the skill)

Three proofs, **measured by you in this session**, per workflow. The user's assurance is not evidence,
and neither is an earlier session's report.

| # | Proof | Passes when |
|---|-------|-------------|
| E1 | Inactive | `active` is literally `false` |
| E2 | Nobody calls it | the id appears in **0** other workflows, scanning the FULL JSON of EVERY workflow on the instance |
| E3 | No executions | the execution list for this id is empty **and** a positive control proves the filter works |

**Missing, unreadable, or contradicted ⇒ REFUSE.** Do not ask the user to override, do not offer
`N8NKIT_PROD_GUARD=off`, do not "proceed anyway". Report which proof failed and stop. An E2/E3 failure
is information the user wants, not an obstacle to route around.

Why E3 needs a positive control: an empty list is ambiguous between "no executions" and "the filter
returned nothing because it did not work" (wrong flag name, pruned history, auth scope). Proving the
same query shape returns rows for a DIFFERENT workflow in the same sweep removes that ambiguity. No
positive control available (the whole instance has zero executions) ⇒ E3 is unmeasurable ⇒ refuse.

---

## Procedure (repeat in full, per workflow id)

### Step 0 — Preflight
```bash
n8nctl doctor
```
Any failure → STOP. You cannot measure evidence against an instance you cannot reach, and an
unreachable instance must never read as "no references, no executions".

### Step 1 — E1: the workflow is inactive
```bash
n8nctl workflow get <id> --json
```
Read `.active` and `.name` from the output.
- `active: true` → **REFUSE**. Tell the user to deactivate and re-run; do not deactivate it yourself
  (that is a separate production write, with its own gate and its own decision).
- Command fails / no such workflow → STOP and report. Nothing to retire.

### Step 2 — E2: nobody references it
```bash
n8nctl workflow list --all --json > <scratch>/all-workflows.json
```
`workflow list --all --json` returns the FULL definition of every workflow (nodes, parameters,
connections) in one auto-paginated array — that is what makes a whole-JSON scan possible, and why this
does not need `workflow export-all`. The command has no `-o` flag (verified against n8nctl 1.5.0);
redirect stdout. Do NOT pass `--redact` — it scrubs exactly the fields a reference can hide in.

Then, over that file:
1. **Prove the scan is complete**: count the array entries; that count is `scanned_workflows`. Zero
   or one entry (the target alone) → the sweep did not work → **REFUSE**.
2. **Search for the literal id as a plain substring in each workflow's serialized JSON**, excluding the
   target's own entry (`.id === <id>`, which trivially contains itself). Plain substring over the whole
   JSON — not a lookup of a `workflowId` field. n8n stores sub-workflow targets in several shapes
   (`workflowId` as a string, as `{__rl, value}`, inside an expression, in a Code node literal, in an
   HTTP URL), and only a full-text scan catches all of them.
3. Any hit → **REFUSE**, and name the referencing workflows (id + name) so the user can unhook them
   first.

When the user asked to retire several ids and A references B, B fails E2. Refuse B, say why, and let
the user decide the order — do not special-case "A is going away anyway".

### Step 3 — E3: no executions, with a positive control
```bash
n8nctl execution list --workflow <id> --limit 100 --json    # must be []
n8nctl execution list --limit 50 --json                     # the positive control sweep
```
1. Target list non-empty → **REFUSE** (the workflow ran; it is not dead junk).
2. From the global sweep, pick any execution whose `workflowId` differs from the target, then re-query
   with the SAME flag shape:
   ```bash
   n8nctl execution list --workflow <other-id> --limit 100 --json
   ```
   Non-empty → the filter demonstrably works → E3 passes with
   `positive_control = { workflow_id: <other-id>, count: <n> }`.
3. Global sweep empty, or the control re-query also returns `[]` → the measurement is not trustworthy
   → **REFUSE** ("không đọc được", per the evidence contract).

### Step 4 — Full backup before anything is written
```bash
n8nctl workflow backup <id> -o <workflowRoot>/_retired/
```
The file carries nodes, connections and settings — enough for `n8nctl workflow create` to rebuild it.
Then compute the hash (the hook re-computes it and refuses on a mismatch):
```bash
sha256sum "<backup-file>"      # PowerShell: Get-FileHash -Algorithm SHA256 "<backup-file>"
```
Backup missing, empty, or unhashable → **REFUSE**. There is no delete without a restorable copy.

### Step 5 — Show the evidence and confirm (MANDATORY — never skip)
Present, in one block: workflow id + name, E1/E2/E3 each with the measured number
(`scanned_workflows`, reference hits, execution count, the positive-control id and its count), the
backup path, its sha256, and the restore command. State plainly that the id will not survive the
restore.

Require an explicit `yes`/`có`. "ok", "ừ", silence, or a thumbs-up is NOT consent for an irreversible
production delete.

### Step 6 — Write the approval artifact (after confirmation, immediately before the delete)

`.claude/artifacts/n8n-retire-<workflowId>/verification.json` — the hook parses this file and checks
every field below. The schema is fixed; a field that is absent, renamed, or contradicted means the
artifact authorizes nothing.

```json
{
  "workflow_id": "<id>",
  "workflow_name": "<name>",
  "active": false,
  "references": { "count": 0, "scanned_workflows": 37 },
  "executions": {
    "count": 0,
    "positive_control": { "workflow_id": "<other-id>", "count": 5 }
  },
  "backup": { "path": "<absolute path from Step 4>", "sha256": "<64 hex chars>" },
  "measured_at": "<ISO 8601, Asia/Ho_Chi_Minh offset>"
}
```

Hard rules:
- Write the file **only after** Step 5's confirmation, and only with numbers you actually measured.
  Writing it from expected values to unblock the command is forging the gate.
- The artifact is valid for **15 minutes** (tighter than the 30 minutes other skills get — retirement
  evidence goes stale faster than a deploy plan). Expired → re-measure Steps 1-3 from scratch. Do not
  touch the file's mtime to refresh it.
- One artifact authorizes exactly one `workflow delete` of exactly this id. It authorizes no other
  verb: not `update`, not `deactivate`, not `execution delete`, not `tag delete`.

### Step 7 — Delete
```bash
n8nctl workflow delete <id> --yes
```
Write the **literal id**, in its own Bash call. Not a shell variable (the guard reads the id from the
raw command text, so `$WF_ID` never matches the artifact and gets blocked), and not wrapped in
`bash -c` / `eval` / a pipe (the guard re-scans wrapped text and fails closed).

Exit ≠ 0 → the workflow was NOT deleted. Report the error verbatim; do not retry with the guard off.

### Step 8 — Report, per workflow
- Deleted: `<id>` — `<name>`
- Evidence: E1 inactive · E2 0 refs / `<n>` workflows scanned · E3 0 executions (control `<other-id>`: `<n>`)
- Backup: `<path>` (sha256 `<hash>`)
- Restore: `n8nctl workflow create "<path>"` — **new id**, webhook URLs and by-id references do not survive
- Artifact: `.claude/artifacts/n8n-retire-<id>/verification.json`

Then move to the next id, starting again at Step 1. A refusal on one id does not stop the others.

## Rules
- Never delete without all three proofs measured in this session, a hash-verified backup, and an
  explicit confirmation.
- Never suggest, set, or work around `N8NKIT_PROD_GUARD=off`. If the guard blocks you, the evidence is
  incomplete — that is the control working.
- Never widen the blast radius: no `--all`, no tag-based sweeps, no "and the other dead ones too".
- Never deactivate, update, or archive a workflow to make it pass E1. The user decides that.
- Never write the artifact before Step 5, and never edit one to match a command.
