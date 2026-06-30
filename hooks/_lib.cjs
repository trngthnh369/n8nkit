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

module.exports = { safeHook, readInput, logError, LOG_DIR, LOG_FILE };
