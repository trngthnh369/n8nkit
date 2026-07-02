---
name: n8n-validation-expert
description: Interpret validation errors and guide fixing them. Use when encountering validation errors, validation warnings, false positives, operator structure issues, or need help understanding validation results. Also use when asking about validation profiles, error types, or the validation loop process.
---

# n8n Validation Expert

> **⚠️ IMPORTANT:** `n8n-mcp` is NOT installed — any `validate_node`/`n8n_create_workflow`/`n8n_update_partial_workflow` MCP refs are **LEGACY, do not use**. Validate via **`n8nctl workflow validate <file> --strict`** (wraps `@trngthnh369/n8n-workflow-validator`, the source of truth). The local **7-layer** validator (structural, node-sanity, referential, expression-balance, secrets [~18 patterns], param-types via 36-node catalog, settings-hygiene) is also runnable as `node <workflowRoot>/_pipeline/validate.js <file>` (a thin shim over the same package).

## Validation Philosophy

**Iterative, not one-shot.** Expect 2-3 validate → fix cycles. Read errors carefully, don't fix what you don't understand.

## Severity Levels

| Level | Blocks? | Types |
|-------|---------|-------|
| **Error** | ✅ YES — must fix | `missing_required`, `invalid_value`, `type_mismatch`, `invalid_reference`, `invalid_expression` |
| **Warning** | ❌ No (but should fix) | `best_practice`, `deprecated`, `performance` |
| **Suggestion** | ❌ No (optional) | `optimization`, `alternative` |

## Validation Loop

```
Configure node → validate.js → Read errors → Fix → validate.js → (repeat)
                                  ↑                                     │
                                  └─────────────────────────────────────┘
                                  Usually 2-3 iterations to valid
```

## Validation Profiles

n8nctl exposes three profiles (matches the gating used everywhere else in the kit):

| Profile | Use when | Gates on |
|---------|----------|----------|
| `dev` | Quick check mid-edit | CRITICAL only |
| `ci` (default) | Before deploy / hooks | CRITICAL + HIGH |
| `strict` | Production readiness | CRITICAL + HIGH + MEDIUM |

## Top Error Categories

### 1. `missing_required`
Required field missing. Fix: provide the field with valid value.
```
Error: "channel" is required for slack.post
Fix: Add "channel": "#general"
```

### 2. `type_mismatch` (most common in ECC)
Wrong data type. Often: string instead of object, string instead of boolean/number.
```
Error: "headerParameters" must be object, got string
Fix: Use { parameters: [{name: "X", value: "Y"}] } format
```
→ See `n8n-node-configuration` inline catalog for types.

### 3. `invalid_value`
Value doesn't match allowed enum.
```
Error: "method": "Get" not in [GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS]
Fix: Uppercase → "GET"
```

### 4. `invalid_expression`
Expression syntax broken (unbalanced braces, wrong `$json` access).
```
Error: Unbalanced {{ }} in "url"
Fix: Count `{{` must match `}}`
```
→ See `n8n-expression-syntax` skill.

### 5. `invalid_reference`
Referenced node doesn't exist (typo in `$node["..."]`, deleted upstream node).
Fix: Check node name exactly matches upstream node's display name.

## False Positives (ignore these)

Auto-sanitization fixes some issues on save. Don't manually fix:

- **IF/Switch `singleValue` missing** — Auto-added when using unary operator
- **Operator structure metadata** — Added on workflow save
- **typeVersion inferred** — Some nodes accept missing typeVersion

→ See [FALSE_POSITIVES.md](FALSE_POSITIVES.md) for complete list.

## Detailed References

- **[ERROR_CATALOG.md](ERROR_CATALOG.md)** — Full error code catalog với fix suggestions
- **[FALSE_POSITIVES.md](FALSE_POSITIVES.md)** — Known false-positive errors (ignore safely)

## 7-Layer Local Validator (`@trngthnh369/n8n-workflow-validator`)

Source of truth = the npm package; `_pipeline/validate.js` is a thin shim over it. Layers (verified):

| Layer | Checks | Sample codes |
|-------|--------|--------------|
| 1 Structural | JSON shape: nodes array, connections object, name (CRITICAL short-circuits) | E001–E004 |
| 2 Node sanity | node shape, missing/dup id, id-not-UUID (fixable), name, type, typeVersion, position, params | E009–E018, E071 |
| 3 Referential | connection source/target integrity, shapes, orphan nodes | E020–E030 |
| 4 Expression | unbalanced `{{ }}` across all string values | E040 |
| 5 Secrets | ~18 hardcoded-secret patterns (provider keys + 1 generic) | E050 (CRITICAL) |
| 6 Param types | typeVersion-in-catalog, required/optional present+typed, enum, conditionalRequired (needs 36-node catalog; skips `=`-expressions) | E060–E066, E072 |
| 7 Settings hygiene | missing `saveDataErrorExecution`/`saveManualExecutions` (fixable) | E070 |

Profiles: `dev` (CRITICAL only) · `ci` (CRITICAL+HIGH, default) · `strict` (+MEDIUM). Fixable codes
(E070, E071) auto-repair via `n8nctl workflow normalize`.

Run: `n8nctl workflow validate <workflow.json> --strict` (preferred) — or
`node <workflowRoot>/_pipeline/validate.js <workflow.json>` (`workflowRoot` per `.n8nkit/config.json`).

## Workflow with Errors

Fix priority:
1. **CRITICAL errors first** (syntax, type) — block execution
2. **Reference errors** — cascade failures
3. **Required field errors** — after structure valid
4. **Warnings** — iterate during refinement

Don't fix all warnings upfront; address them when they block further progress.

## Related Skills

- **`n8n-node-configuration`** — Type catalog for Layer 6 errors
- **`n8n-expression-syntax`** — Fix `invalid_expression` errors
- **`n8nctl`** — Deploy validated workflows
- **`n8n-fix`** command — Self-healing loop calling validate + fix + retry
