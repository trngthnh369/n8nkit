# n8n Review — Per-Lens Checklists

Each lens yields **PASS / WARN / FAIL** + evidence. FAIL = must fix before deploy; WARN = should fix;
PASS = clean. Cite node names as evidence.

## §Correctness

- [ ] `n8nctl workflow validate --profile ci` passes (gate zero). FAIL if not.
- [ ] Every `{{ }}` expression references a node/field that exists upstream (no `$node["X"]` for a missing X).
- [ ] Node params valid for the node's `typeVersion` — cross-check with `n8nctl node describe <type>` (live
      catalog, exact for this instance; probe `n8nctl node --help`, needs `auth login --session`) or fall
      back to `n8nctl workflow schema --node <type>` / the offline `n8n-node-configuration` catalog.
- [ ] Required fields present per operation (resource/operation cascades — Slack messageId on update, etc.).
- [ ] No orphan nodes / dead branches (nodes with no path from the trigger).
- [ ] Trigger is wired and appropriate (webhook path set, schedule cron valid).
- [ ] Code nodes: correct run mode (once-for-all vs per-item), Luxon for dates (not `new Date()`).

## §Security / credentials

- [ ] No hardcoded API keys / tokens / passwords anywhere (the secret guard blocks provider-shaped literals,
      but review catches the rest — base64 blobs, connection strings, internal URLs). FAIL on any.
- [ ] Credentials are **references** (`{id, name}`), never inline `data`.
- [ ] Webhook nodes have auth (header/basic/signature) OR are intentionally public with justification.
- [ ] No PII (names, emails, orders, phone) written to audit sheets / logs in plaintext.
- [ ] HTTPS for all external HTTP Request nodes; no admin/internal endpoints exposed in webhook responses.
- [ ] Service-account auth for Google (not personal OAuth) where the workflow-standards rule applies.

## §Error-handling

- [ ] `onError` set on fail-prone nodes (HTTP, DB, external API) — not left at implicit stop for critical paths.
- [ ] Retry config on transient-failure nodes (`retryOnFail`, `maxTries`, `waitBetweenTries`).
- [ ] An error output path exists (error branch or an errorWorkflow) — every production workflow needs one.
- [ ] Idempotency: writes are safe to retry (upsert > insert; check-before-create; dedup composite key).
- [ ] Timeouts set on HTTP nodes (no unbounded hangs).

## §Performance

- [ ] No N+1 HTTP/DB calls inside a per-item loop where a batch call exists.
- [ ] `SplitInBatches` / batch mode used for large arrays; batch size respects the API's rate limit.
- [ ] Pagination handled (cursor/offset/page) rather than fetching only page 1.
- [ ] `Wait` between batches for rate-limited APIs; honors `X-RateLimit-Remaining` when available.
- [ ] No redundant full-dataset fetches when an incremental/`since` filter is available.

## §Cost

- [ ] Estimate **external API calls per run** (sum across nodes, × loop iterations).
- [ ] × schedule frequency = calls/day. Flag if a cron interval drives an obviously expensive call volume.
- [ ] AI nodes: model + token budget appropriate (don't call a frontier model where a cheap one suffices).
- [ ] Caching/dedup avoids re-fetching unchanged data each run.

## §Maintainability

- [ ] Descriptive node names ("Get User Profile", not "HTTP Request").
- [ ] Workflow name follows `<domain>-<purpose>-v<N>`; tags `<project>:<tier>`.
- [ ] Node count fits the tier (utility ≤ 10–15; split if > 15–20).
- [ ] Sticky notes delineate sections for non-trivial workflows.
- [ ] Audit-trail logging to a sheet/DB where the workflow-standards rule expects it.
- [ ] Sub-workflows for repeated logic instead of copy-paste node clusters.

## Scoring

`review.json` shape:
```json
{
  "target": "<file-or-id>", "reviewed_at": "<iso>",
  "lenses": {
    "correctness": { "verdict": "PASS|WARN|FAIL", "findings": ["<node>: <issue>"] },
    "security": { "verdict": "...", "findings": [] },
    "error_handling": { "verdict": "...", "findings": [] },
    "performance": { "verdict": "...", "findings": [] },
    "cost": { "verdict": "...", "findings": [], "calls_per_run": 0, "calls_per_day": 0 },
    "maintainability": { "verdict": "...", "findings": [] }
  },
  "overall": "PASS|WARN|FAIL",
  "top_fixes": ["<most impactful first>"]
}
```
Overall = FAIL if any lens FAILs, else WARN if any WARN, else PASS.
