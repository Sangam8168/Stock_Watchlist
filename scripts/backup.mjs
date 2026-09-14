#!/usr/bin/env node
/**
 * Point-in-time backup of the collections that cannot be rebuilt.
 *
 * Deliberately partial. Snapshots and events are derived data: the poll
 * regenerates them, and both carry TTLs, so backing them up would multiply the
 * archive size for information that expires anyway. What is irreplaceable is a
 * user's own work — their theses, levels, lists, and how far they've read.
 *
 *   node scripts/backup.mjs [outDir]      # default ./backups
 *
 * Restore with scripts/restore.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

/** Irreplaceable if lost — user-authored or user-specific state. */
const COLLECTIONS = ['watchlists', 'seenstates', 'user', 'account'];

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

const main = async () => {
  const cfg = env();
  const uri = cfg.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  const outDir = path.resolve(process.argv[2] || 'backups');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(outDir, stamp);
  fs.mkdirSync(dest, { recursive: true });

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const manifest = { takenAt: new Date().toISOString(), collections: {} };
  for (const name of COLLECTIONS) {
    const file = path.join(dest, `${name}.jsonl`);
    const stream = fs.createWriteStream(file);
    let n = 0;
    // Cursor, not toArray: a backup must not need to fit the database in RAM.
    for await (const doc of db.collection(name).find({}).batchSize(1000)) {
      stream.write(JSON.stringify(doc) + '\n');
      n++;
    }
    await new Promise((r) => stream.end(r));
    manifest.collections[name] = n;
    console.log(`  ${name.padEnd(12)} ${n} documents`);
  }

  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await mongoose.disconnect();
  console.log(`\nBackup written to ${dest}`);
  console.log('Note: snapshots and events are intentionally excluded — they are derived and TTL-bounded.');
};

main().catch((e) => {
  console.error('Backup failed:', e.message);
  process.exit(1);
});
