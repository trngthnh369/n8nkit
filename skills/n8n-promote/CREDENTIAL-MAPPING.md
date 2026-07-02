# n8n Promote — Credential Mapping

When a workflow moves between instances, its credential references (by ID on the source) must resolve to
credentials that already exist on the **target**. n8nkit never creates target credentials — that's
`/n8n-credentials`.

## The mapping report (from the dry-run)

`n8nctl workflow promote <id> --to <target> --out-dir <dir>` writes a mapping report classifying each
source credential:

| Status | Meaning | Action |
|---|---|---|
| `matched` | A target credential with the same type+name exists | auto-mapped, nothing to do |
| `ambiguous` | Multiple target credentials match type+name | MUST provide an explicit `--map` entry |
| `missing` | No target credential matches | create it first (`/n8n-credentials`), or `--allow-unmapped` (risky) |

## The `--map` file

JSON array. Each entry pins a source credential to a target credential ID:

```json
[
  { "type": "httpHeaderAuth", "name": "Haravan API",  "targetId": "42" },
  { "sourceId": "17",                                   "targetId": "9" }
]
```

- Match by `type` + `name`, or directly by `sourceId`.
- `targetId` is the credential ID on the **target** instance (`n8nctl --profile <target> credential list`).

## Rules

- **`ambiguous` is never auto-resolved** — always requires an explicit `--map` entry.
- **`--allow-unmapped` only forgives `missing`** (keeps the source reference, which will likely fail at
  runtime on the target). It does NOT cover `ambiguous`. Use it only when the user explicitly accepts that
  the workflow will need its credentials wired up on the target afterwards.
- Never embed credential **values** in a map file — only IDs/type/name.
