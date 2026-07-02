// ~/.claude/hooks/_lib.cjs
// Shared utilities for hook scripts — crash handler + input parser
// Port pattern from ClaudeKit to prevent hook errors from breaking sessions.

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.claude', 'hooks', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'errors.log');

function logError(hookName, err) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const entry = [
      `[${new Date().toISOString()}] ${hookName}`,
      err.stack || err.message || String(err),
      '---',
    ].join('\n') + '\n';
    fs.appendFileSync(LOG_FILE, entry);
  } catch (_) {
    // Last resort: write to stderr but don't fail
    try { process.stderr.write(`[hook:${hookName}] ERROR (also failed to log): ${err.message}\n`); } catch (_) {}
  }
}

// safeHook wraps hook logic.
// - If hook logic throws, log error and exit 0 (don't block session).
// - Intentional blocks must call process.exit(2) inside fn (process.exit doesn't throw).
// - Warnings written via process.stderr don't affect exit code.
function safeHook(hookName, fn) {
  try {
    fn();
  } catch (err) {
    logError(hookName, err);
    process.exit(0);
  }
}

// Read tool-use JSON from stdin
function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

// --- workflow-root resolution (decouples guards from the literal "build-workflow" path segment) ---

function readConfigWorkflowRoot(dir) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.n8nkit', 'config.json'), 'utf8'));
    if (cfg && typeof cfg.workflowRoot === 'string' && cfg.workflowRoot.trim()) return cfg.workflowRoot;
  } catch (_) { /* no config here */ }
  return null;
}

// Walk up at most 10 ancestor dirs looking for a .n8nkit/config.json with a workflowRoot.
function walkUpForRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10 && dir; i++) {
    const root = readConfigWorkflowRoot(dir);
    if (root) return root;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

// Resolution order (cwd-INDEPENDENT — Claude sessions often run from a subdirectory):
//   1. env N8NKIT_WORKFLOW_ROOT
//   2. walk up from the TARGET FILE's directory
//   3. walk up from the hook-payload cwd (input.cwd — NOT process.cwd())
//   4. null (callers fall back to the legacy "build-workflow" segment match)
function resolveWorkflowRoot(filePath, input) {
  if (process.env.N8NKIT_WORKFLOW_ROOT) return process.env.N8NKIT_WORKFLOW_ROOT;
  if (filePath) {
    const fromFile = walkUpForRoot(path.dirname(path.resolve(filePath)));
    if (fromFile) return fromFile;
  }
  const cwd = input && input.cwd;
  if (cwd) {
    const fromCwd = walkUpForRoot(path.resolve(cwd));
    if (fromCwd) return fromCwd;
  }
  return null;
}

function normPath(p) { return String(p).replace(/\\/g, '/').toLowerCase(); }

// True if filePath is a workflow JSON: under the resolved workflowRoot, OR (fallback) matches
// the legacy build-workflow segment so existing layouts keep working with zero regression.
function isWorkflowJsonPath(filePath, input) {
  if (!filePath || !/\.json$/i.test(filePath)) return false;
  const root = resolveWorkflowRoot(filePath, input);
  if (root) {
    const r = normPath(path.resolve(root));
    const rPrefix = r.endsWith('/') ? r : r + '/';
    if (normPath(path.resolve(filePath)).startsWith(rPrefix)) return true;
  }
  return /build-workflow[\\/].*\.json$/i.test(filePath);
}

// Extract all written text from a tool_input, covering Write (content), Edit (new_string),
// MultiEdit (edits[].new_string — an ARRAY that was silently unscanned before), and
// NotebookEdit (new_source). Joins with newlines for a single scan pass.
function extractWriteContent(toolInput) {
  if (!toolInput) return '';
  const parts = [];
  if (typeof toolInput.content === 'string') parts.push(toolInput.content);
  if (typeof toolInput.new_string === 'string') parts.push(toolInput.new_string);
  if (typeof toolInput.new_source === 'string') parts.push(toolInput.new_source);
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) {
      if (e && typeof e.new_string === 'string') parts.push(e.new_string);
    }
  }
  return parts.join('\n');
}

module.exports = {
  safeHook, readInput, logError, LOG_DIR, LOG_FILE,
  resolveWorkflowRoot, isWorkflowJsonPath, extractWriteContent,
};
