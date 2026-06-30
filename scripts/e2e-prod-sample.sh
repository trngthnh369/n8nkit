#!/usr/bin/env bash
# n8nkit E2E proof — hardened safe sample on production.
# Proves the full kit lifecycle: build JSON -> validate gate -> node-allowlist -> create INACTIVE ->
# workflow run (/rest session) -> verify -> DELETE. Zero side-effects (Schedule->Set->NoOp only),
# never activated, deleted at the end.
# PREREQ: a valid session — run `n8nctl auth login --session --email <you> --cookie-only` first.
# Usage: bash scripts/e2e-prod-sample.sh <ping.json>
set -uo pipefail
PING="${1:?usage: e2e-prod-sample.sh <ping.json>}"
ALLOW='n8n-nodes-base.scheduleTrigger n8n-nodes-base.set n8n-nodes-base.noOp'

echo "== 1. validate gate (ci) =="
n8nctl workflow validate "$PING" || { echo "validate failed"; exit 1; }

echo "== 2. node-allowlist assertion (no HTTP/external) =="
node -e '
const wf=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
const allow=new Set(process.argv[2].split(" "));
const bad=wf.nodes.map(n=>n.type).filter(t=>!allow.has(t));
if(bad.length){console.error("ALLOWLIST FAIL:",bad.join(", "));process.exit(1)}
console.log("ALLOWLIST PASS:",wf.nodes.map(n=>n.type).join(", "));
' "$PING" "$ALLOW" || exit 1

echo "== 3. create INACTIVE on prod =="
CREATE=$(n8nctl workflow create "$PING" --json 2>&1) || { echo "create failed: $CREATE"; exit 1; }
# `workflow create --json` prints a human "✓ created ..." line before the JSON body → strip leading non-JSON.
WID=$(printf '%s' "$CREATE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s.replace(/^[^\[{]*/,""));console.log(o.id||(o.data&&o.data.id)||"")}catch(e){console.log("")}})')
# Register cleanup BEFORE any further step so a created workflow is never orphaned, even on parse failure.
WNAME=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).name)' "$PING")
cleanup() {
  if [ -n "$WID" ]; then echo "== cleanup: delete $WID =="; n8nctl workflow delete "$WID" --yes 2>&1 | head -2
  else echo "== cleanup: WID unknown — locating '$WNAME' by name =="; n8nctl workflow list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s.replace(/^[^\[{]*/,""));const list=Array.isArray(a)?a:(a.data||[]);const m=list.filter(w=>w.name===process.argv[1]);console.log(m.map(w=>w.id).join(" "))}catch(e){}})' "$WNAME" | tr " " "\n" | while read -r id; do [ -n "$id" ] && n8nctl workflow delete "$id" --yes 2>&1 | head -1; done
  fi
}
trap cleanup EXIT
if [ -z "$WID" ]; then echo "could not parse workflow id (will clean by name on exit); raw: $CREATE" | head -3; exit 1; fi
echo "created workflow id=$WID (INACTIVE)"

echo "== 4. workflow run (/rest session, headless) =="
n8nctl workflow run "$WID" --trigger "Schedule Trigger" --wait --timeout 120000; RUN_RC=$?
echo "run rc=$RUN_RC"

echo "== 5. last execution + verify =="
EXID=$(n8nctl execution list --workflow "$WID" --limit 1 --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const a=Array.isArray(o)?o:(o.data||[]);console.log(a[0]&&a[0].id||"")}catch(e){console.log("")}})')
echo "execution id=$EXID"
if [ -n "$EXID" ]; then n8nctl workflow verify "$WID" --execution "$EXID"; echo "verify rc=$?"; fi

if [ "$RUN_RC" -eq 0 ]; then echo "E2E PASS — execution succeeded headless via /rest"; else echo "E2E run non-zero (rc=$RUN_RC) — inspect above"; fi
# cleanup runs via trap
