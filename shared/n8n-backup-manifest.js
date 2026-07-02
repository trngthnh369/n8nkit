#!/usr/bin/env node
// n8n Backup Manifest Tool
// Scoped backup system with manifest.json + retention policy.
// Port pattern from ClaudeKit scoped backups.
//
// Usage:
//   node n8n-backup-manifest.js create <workflow-file.json> [--reason=deploy|rollback|manual]
//   node n8n-backup-manifest.js list <project-dir>
//   node n8n-backup-manifest.js prune <project-dir> [--keep=10]
//   node n8n-backup-manifest.js restore <project-dir> <backup-id>

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function parseWorkflow(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  return {
    content,
    name: data.name || path.basename(filePath, '.json'),
    id: data.id || null,
    nodeCount: Array.isArray(data.nodes) ? data.nodes.length : 0,
    hash: sha256(content),
  };
}

function getProjectDir(filePath) {
  // Walk up to find project dir containing `workflow/` subdir
  let dir = path.resolve(path.dirname(filePath));
  for (let i = 0; i < 5; i++) {
    const wf = path.join(dir, 'workflow');
    if (fs.existsSync(wf) && fs.statSync(wf).isDirectory()) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(filePath);
}

function ensureBackupDir(projectDir) {
  const backupDir = path.join(projectDir, '_backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function nowId() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

function cmdCreate(filePath, reason = 'manual') {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }
  const wf = parseWorkflow(filePath);
  const projectDir = getProjectDir(filePath);
  const backupDir = ensureBackupDir(projectDir);
  const backupId = `${wf.name.replace(/[^\w-]/g, '_')}_${nowId()}`;
  const snapshotPath = path.join(backupDir, `${backupId}.json`);
  const manifestPath = path.join(backupDir, `${backupId}.manifest.json`);

  fs.writeFileSync(snapshotPath, wf.content);
  const manifest = {
    backup_id: backupId,
    created_at: new Date().toISOString(),
    workflow_id: wf.id,
    workflow_name: wf.name,
    source_file: path.relative(projectDir, filePath).replace(/\\/g, '/'),
    node_count: wf.nodeCount,
    sha256: wf.hash,
    reason,
    size_bytes: wf.content.length,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`✅ Backup created: ${backupId}`);
  console.log(`   Snapshot: ${snapshotPath}`);
  console.log(`   Manifest: ${manifestPath}`);
  console.log(`   Reason: ${reason}, Nodes: ${wf.nodeCount}, Hash: ${wf.hash}`);
}

function cmdList(projectDir) {
  const backupDir = path.join(projectDir, '_backups');
  if (!fs.existsSync(backupDir)) {
    console.log('No _backups/ directory found.');
    return;
  }
  const manifests = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.manifest.json'))
    .map(f => {
      const full = path.join(backupDir, f);
      try {
        return { file: f, ...JSON.parse(fs.readFileSync(full, 'utf8')) };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  if (manifests.length === 0) {
    console.log('No manifests found. Legacy backups (no manifest) not tracked.');
    return;
  }

  console.log(`Backups in ${projectDir}/_backups/:\n`);
  console.log('ID                                          | Created            | Nodes | Reason   | Hash');
  console.log('-'.repeat(110));
  manifests.forEach(m => {
    const id = (m.backup_id || m.file.replace('.manifest.json', '')).padEnd(44);
    const created = m.created_at.slice(0, 19).padEnd(19);
    const nodes = String(m.node_count || '?').padStart(5);
    const reason = (m.reason || 'unknown').padEnd(9);
    const hash = m.sha256 || '?';
    console.log(`${id}| ${created}| ${nodes} | ${reason}| ${hash}`);
  });
  console.log(`\nTotal: ${manifests.length} backup(s)`);
}

function cmdPrune(projectDir, keep = 10) {
  const backupDir = path.join(projectDir, '_backups');
  if (!fs.existsSync(backupDir)) {
    console.log('No _backups/ directory.');
    return;
  }
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.manifest.json'))
    .map(f => {
      const full = path.join(backupDir, f);
      try {
        const m = JSON.parse(fs.readFileSync(full, 'utf8'));
        return { manifest: f, created_at: m.created_at, backup_id: m.backup_id };
      } catch (_) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  if (files.length <= keep) {
    console.log(`Only ${files.length} backup(s). Keep=${keep}. Nothing to prune.`);
    return;
  }

  const toDelete = files.slice(keep);
  console.log(`Pruning ${toDelete.length} backup(s) (keeping newest ${keep}):`);
  toDelete.forEach(f => {
    const snap = path.join(backupDir, `${f.backup_id}.json`);
    const man = path.join(backupDir, f.manifest);
    [snap, man].forEach(p => {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log(`  Deleted: ${path.basename(p)}`);
      }
    });
  });
}

function cmdRestore(projectDir, backupId) {
  const backupDir = path.join(projectDir, '_backups');
  const manifestPath = path.join(backupDir, `${backupId}.manifest.json`);
  const snapshotPath = path.join(backupDir, `${backupId}.json`);
  if (!fs.existsSync(manifestPath) || !fs.existsSync(snapshotPath)) {
    console.error(`ERROR: backup ${backupId} not found in ${backupDir}`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const targetPath = path.join(projectDir, manifest.source_file);

  // Verify hash before restore
  const content = fs.readFileSync(snapshotPath, 'utf8');
  const hash = sha256(content);
  if (hash !== manifest.sha256) {
    console.error(`WARNING: snapshot hash mismatch (expected ${manifest.sha256}, got ${hash}). Proceed anyway? Exiting.`);
    process.exit(1);
  }

  // Create a pre-restore backup of current state
  if (fs.existsSync(targetPath)) {
    console.log('Creating safety backup of current state before restore...');
    cmdCreate(targetPath, 'pre-restore');
  }

  fs.copyFileSync(snapshotPath, targetPath);
  console.log(`✅ Restored ${backupId} → ${manifest.source_file}`);
  console.log(`   Nodes: ${manifest.node_count}, Original reason: ${manifest.reason}`);
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'create': {
      const file = args[0];
      if (!file) { console.error('Usage: create <file> [--reason=X]'); process.exit(1); }
      const reasonArg = args.find(a => a.startsWith('--reason='));
      const reason = reasonArg ? reasonArg.split('=')[1] : 'manual';
      cmdCreate(file, reason);
      break;
    }
    case 'list': {
      const dir = args[0] || process.cwd();
      cmdList(dir);
      break;
    }
    case 'prune': {
      const dir = args[0] || process.cwd();
      const keepArg = args.find(a => a.startsWith('--keep='));
      const keep = keepArg ? parseInt(keepArg.split('=')[1], 10) : 10;
      cmdPrune(dir, keep);
      break;
    }
    case 'restore': {
      const [dir, id] = args;
      if (!dir || !id) { console.error('Usage: restore <project-dir> <backup-id>'); process.exit(1); }
      cmdRestore(dir, id);
      break;
    }
    default:
      console.log(`n8n-backup-manifest — scoped backup system

Commands:
  create <file.json> [--reason=deploy|rollback|manual|pre-restore]
      Create backup with manifest. Writes to <project>/_backups/.
  list <project-dir>
      List all manifests sorted by date (newest first).
  prune <project-dir> [--keep=10]
      Delete oldest backups beyond keep threshold.
  restore <project-dir> <backup-id>
      Restore snapshot. Creates pre-restore backup first.`);
      if (cmd) process.exit(1);
  }
}

main();
