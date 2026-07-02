# n8n Monitor — jq Aggregation Recipes

All operate on `n8nctl ... --json` output. n8nctl also supports `--jq <expr>` inline (preferred — no extra
pipe). Adjust field names if your n8n version differs; verify against one raw `--json` dump first.

## Per-workflow error rate (from an execution list)

```bash
n8nctl execution list --limit 200 --json --jq '
  group_by(.workflowId) | map({
    workflowId: .[0].workflowId,
    total: length,
    errors: (map(select(.status=="error")) | length)
  }) | map(. + {errorRate: (if .total>0 then (.errors/.total) else 0 end)})
  | sort_by(-.errorRate)'
```

## p95 duration per workflow

```bash
n8nctl execution list --limit 200 --json --jq '
  map(select(.stoppedAt and .startedAt) | . + {
    ms: (( (.stoppedAt|fromdate) - (.startedAt|fromdate) ) * 1000)
  })
  | group_by(.workflowId) | map({
    workflowId: .[0].workflowId,
    p95ms: (sort_by(.ms) | .[ (length*0.95 | floor) ].ms)
  })'
```

## Last successful run per workflow

```bash
n8nctl execution list --status success --limit 200 --json --jq '
  group_by(.workflowId) | map({
    workflowId: .[0].workflowId,
    lastSuccess: (max_by(.startedAt) | .startedAt)
  })'
```

## Error clustering (group identical error messages)

```bash
n8nctl execution list --status error --limit 100 --json --jq '
  group_by(.lastError // "unknown")
  | map({ error: .[0].lastError, count: length, workflows: (map(.workflowId) | unique) })
  | sort_by(-.count)'
```

## Active workflows with zero recent executions (candidate abandoned)

```bash
# Cross-reference: active list vs workflowIds seen in the recent execution window.
n8nctl workflow list --active --json --jq 'map({id, name})'
# then diff against the executed set; or use `n8nctl audit --categories instance` which reports abandoned.
```

## calls/day estimate for a scheduled workflow (cost lens input)

```
callsPerRun  = (count of external HTTP/API nodes) × (avg loop iterations)
runsPerDay   = derived from the Schedule Trigger cron/interval
callsPerDay  = callsPerRun × runsPerDay
```

> If a field (`status`, `stoppedAt`, `lastError`, `workflowId`) is absent in your n8n version's execution
> payload, dump one execution with `n8nctl execution get <id> --json` and adjust the jq path.
