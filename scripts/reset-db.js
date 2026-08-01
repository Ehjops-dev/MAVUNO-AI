#!/usr/bin/env node
/**
 * Wipes the SQLite database (and its WAL sidecars) so the next server start
 * re-seeds a clean demo: exactly 3 farmers, 10 harvests, 1 loan, 1 scan.
 *
 * Run this the morning of a demo — clicking around during rehearsal leaves
 * extra loans and harvests behind, and a duplicated profile in the switcher
 * is the first thing an audience notices.
 *
 *   npm run db:reset            # wipe, keeping a timestamped backup
 *   npm run db:reset -- --force # wipe without the backup
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const dbPath = process.env.MAVUNO_DB || path.join(__dirname, '..', 'mavuno.db');
const files = [dbPath, dbPath + '-wal', dbPath + '-shm'];
const keepBackup = !process.argv.includes('--force');

if (!fs.existsSync(dbPath)) {
  console.log(`No database at ${dbPath} — nothing to reset. It will be created on the next start.`);
  process.exit(0);
}

if (keepBackup) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `${path.basename(dbPath)}.${stamp}.bak`);
  fs.copyFileSync(dbPath, backup);
  console.log(`Backup written to ${backup}`);
}

let removed = 0;
for (const f of files) {
  if (fs.existsSync(f)) { fs.unlinkSync(f); removed++; }
}

console.log(`Removed ${removed} file(s). Start the server to re-seed a clean demo database.`);
