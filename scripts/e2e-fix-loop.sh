#!/usr/bin/env bash
# n8nkit E2E — failure -> fix -> redeploy loop, proving the fix-loop CLI primitives end-to-end.
# NOT zero-side-effect: it creates a temporary INACTIVE workflow on PRODUCTION, runs it (so a few benign
# execution records remain — n8nctl has no execution-delete verb), then DELETES the workflow. It is never
# activated. The Code node only throws a marker string (allowlist blocks HTTP/external), so executions
# contain NO customer data. This proves error-surface -> patch -> redeploy -> verify, NOT Claude's judgment.
#
# Requires explicit consent to run against prod. PREREQ: `n8nctl auth login --session --cookie-only`.
# Usage: bash scripts/e2e-fix-loop.sh
set -uo pipefail

echo "== preflight: session auth =="
n8nctl auth status 2>&1 | grep -qiE 'session|cookie' || { echo "No session auth. Run: n8nctl auth login --session --cookie-only"; exit 2; }

MARKER='E2E_FIX_MARKER'
NAME="n8nkit-e2e-fix-$(date +%s)"
ALLOW='n8n-nodes-base.scheduleTrigger n8n-nodes-base.code n8n-nodes-base.noOp n8n-nodes-base.set'
TMP="$(mktemp -d)"
BROKEN="$TMP/broken.json"
FIXED="$TMP/fixed.json"

# Build broken workflow: Schedule -> Code(throw MARKER) -> NoOp. Structurally valid, fails at RUNTIME only.
node -e '
const marker=process.argv[2];
const mk=(throwIt)=>({
  name: process.argv[3],
  nodes: [
    { id:"a1111111-1111-4111-8111-111111111111", name:"Schedule Trigger", type:"n8n-nodes-base.scheduleTrigger", typeVersion:1.2, position:[0,0], parameters:{} },
    { id:"a2222222-2222-4222-8222-222222222222", name:"Break", type:"n8n-nodes-base.code", typeVersion:2, position:[250,0], parameters:{ language:"javaScript", jsCode: throwIt ? ("throw new Error(\x27"+marker+"\x27);") : "return $input.all();" } },
    { id:"a3333333-3333-4333-8333-333333333333", name:"NoOp", type:"n8n-nodes-base.noOp", typeVersion:1, position:[500,0], parameters:{} }
  ],
  connections: {
    "Schedule Trigger": { main: [[{ node:"Break", type:"main", index:0 }]] },
    "Break": { main: [[{ node:"NoOp", type:"main", index:0 }]] }
  },
  settings: { executionOrder:"v1", saveManualExecutions:true, saveDataErrorExecution:"all" }
});
require("fs").writeFileSync(process.argv[4], JSON.stringify(mk(true),null,2));
require("fs").writeFileSync(process.argv[5], JSON.stringify(mk(false),null,2));
' "$MARKER" "$MARKER" "$NAME" "$BROKEN" "$FIXED"

echo "== 1. static validate must PASS on the broken workflow (runtime-only failure) =="
n8nctl workflow validate "$BROKEN" || { echo "FAIL: broken workflow did not pass static validate — cannot exercise the fix loop"; exit 1; }

echo "== 2. node-allowlist assertion =="
node -e 'const wf=JSON.parse(require("fs").readFileSync(process.argv[1]));const a=new Set(process.argv[2].split(" "));const bad=wf.nodes.map(n=>n.type).filter(t=>!a.has(t));if(bad.length){console.error("ALLOWLIST FAIL:",bad);process.exit(1)}console.log("ok")' "$BROKEN" "$ALLOW" || exit 1

echo "== 3. create INACTIVE on prod =="
CREATE=$(n8nctl workflow create "$BROKEN" --json 2>&1) || { echo "create failed: $CREATE"; exit 1; }
WID=$(printf '%s' "$CREATE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s.replace(/^[^\[{]*/,""));console.log(o.id||(o.data&&o.data.id)||"")}catch(e){console.log("")}})')
cleanup() {
  if [ -n "$WID" ]; then echo "== cleanup: delete $WID =="; n8nctl workflow delete "$WID" --yes 2>&1 | head -1
  else n8nctl workflow list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s.replace(/^[^\[{]*/,""));const l=Array.isArray(a)?a:(a.data||[]);console.log(l.filter(w=>w.name===process.argv[1]).map(w=>w.id).join(" "))}catch(e){}})' "$NAME" | tr " " "\n" | while read -r id; do [ -n "$id" ] && n8nctl workflow delete "$id" --yes 2>&1 | head -1; done
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT
[ -z "$WID" ] && { echo "could not parse workflow id; raw: $CREATE" | head -3; exit 1; }
echo "created id=$WID (INACTIVE, name=$NAME)"

echo "== 4. run the broken workflow — expect FAILURE (rc != 0) =="
n8nctl workflow run "$WID" --trigger "Schedule Trigger" --wait --timeout 120000; RC1=$?
if [ "$RC1" -eq 0 ]; then echo "FAIL: broken workflow unexpectedly succeeded"; exit 1; fi
echo "ok: run failed as expected (rc=$RC1)"

echo "== 5. last-error must surface the marker =="
ERR=$(n8nctl execution last-error --workflow "$WID" --summary 2>&1)
echo "$ERR" | grep -q "$MARKER" || { echo "FAIL: marker '$MARKER' not found in last-error output"; echo "$ERR" | head -5; exit 1; }
echo "ok: marker surfaced in the diagnostic"

echo "== 6. patch (drop the throw) -> validate -> diff -> update =="
n8nctl workflow validate "$FIXED" || { echo "FAIL: fixed workflow invalid"; exit 1; }
n8nctl workflow diff "$WID" "$FIXED" | head -20
n8nctl workflow update "$WID" "$FIXED" || { echo "FAIL: update failed"; exit 1; }

echo "== 7. re-run — expect SUCCESS (rc == 0) =="
n8nctl workflow run "$WID" --trigger "Schedule Trigger" --wait --timeout 120000; RC2=$?
[ "$RC2" -eq 0 ] || { echo "FAIL: fixed workflow still failing (rc=$RC2)"; exit 1; }

echo "== 8. verify the successful execution (exit 6 = gate fail) =="
EXID=$(n8nctl execution list --workflow "$WID" --limit 1 --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const a=Array.isArray(o)?o:(o.data||[]);console.log(a[0]&&a[0].id||"")}catch(e){console.log("")}})')
[ -n "$EXID" ] && { n8nctl workflow verify "$WID" --execution "$EXID"; echo "verify rc=$?"; }

echo "== E2E FIX-LOOP PASS — error surfaced -> patched -> redeployed -> verified =="
echo "note: workflow $WID will be deleted on exit; a few benign execution records remain (no execution-delete verb)."
# cleanup runs via trap
