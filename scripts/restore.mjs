#!/usr/bin/env node
/**
 * Restore from a backup directory produced by scripts/backup.mjs.
 *
 *   node scripts/restore.mjs backups/2026-09-15T10-00-00-000Z [--wipe]
 *
 * Upserts by _id so a restore is idempotent and can be re-run. --wipe empties
 * each collection first, which is what you want after data loss and emphatically
 * not what you want against a live database, so it is never the default.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import mongoose from 'mongoose';

function env() {
  const out = {};
  try {
    for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
      if (!line.includes('=') || line.trim().startsWith('#')) continue;
      const i = line.indexOf('=');
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* fall back to process env */ }
  return { ...out, ...process.env };
}

const revive = (doc) => {
  // JSON has no Date type; anything that looks like one on a known field is.
  for (const [k, v] of Object.entries(doc)) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v)) doc[k] = new Date(v);
  }
  return doc;
};

const main = async () => {
  const dir = process.argv[2];
  const wipe = process.argv.includes('--wipe');
  if (!dir) {
    console.error('Usage: node scripts/restore.mjs <backupDir> [--wipe]');
    process.exit(1);
  }
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`No manifest.json in ${dir} — is that a backup directory?`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`Backup taken ${manifest.takenAt}`);
  if (wipe) console.log('--wipe: existing documents in these collections will be DELETED first.\n');

  const cfg = env();
  await mongoose.connect(cfg.MONGODB_URI);
  const db = mongoose.connection.db;

  for (const name of Object.keys(manifest.collections)) {
    const file = path.join(dir, `${name}.jsonl`);
    if (!fs.existsSync(file)) { console.log(`  ${name}: file missing, skipped`); continue; }
    if (wipe) await db.collection(name).deleteMany({});

    let ops = [];
    let n = 0;
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const doc = revive(JSON.parse(line));
      ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
      if (ops.length >= 500) { await db.collection(name).bulkWrite(ops, { ordered: false }); n += ops.length; ops = []; }
    }
    if (ops.length) { await db.collection(name).bulkWrite(ops, { ordered: false }); n += ops.length; }
    console.log(`  ${name.padEnd(12)} ${n} documents restored`);
  }

  await mongoose.disconnect();
  console.log('\nRestore complete. Run the poll (or press Refresh) to rebuild snapshots.');
};

main().catch((e) => {
  console.error('Restore failed:', e.message);
  process.exit(1);
});
