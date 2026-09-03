#!/usr/bin/env node

/**
 * Safe Firestore Database Audit Tool
 *
 * Defaults to CHEAP aggregation queries (`count()`), costing only 1 read per 1,000
 * index entries (e.g. ~45 reads total for an entire 45K document database).
 *
 * Never performs full per-document reads unless explicitly requested with `--full` / `--scan`,
 * and requires `--confirm` if estimated document reads exceed the safety cap (default 5,000 reads).
 *
 * Usage:
 *   node scripts/firestore-db-audit.mjs
 *   node scripts/firestore-db-audit.mjs --collections=users,ratings
 *   node scripts/firestore-db-audit.mjs --full --sample=10
 *   node scripts/firestore-db-audit.mjs --full --confirm
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// 1. Resolve Firebase Admin SDK
let admin;
try {
  const localFunctionsAdmin = path.resolve(process.cwd(), 'functions/node_modules/firebase-admin');
  if (fs.existsSync(localFunctionsAdmin)) {
    admin = require(localFunctionsAdmin);
  } else {
    admin = require('firebase-admin');
  }
} catch (err) {
  console.error('[Error] Unable to load firebase-admin. Make sure functions/node_modules is installed.');
  console.error(err);
  process.exit(1);
}

// 2. Resolve Google Application Default Credentials if not already set
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const home = os.homedir();
  const standardAdc = path.join(home, '.config/gcloud/application_default_credentials.json');
  const legacyAdcDir = path.join(home, '.config/gcloud/legacy_credentials');

  if (fs.existsSync(standardAdc)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = standardAdc;
  } else if (fs.existsSync(legacyAdcDir)) {
    const subdirs = fs.readdirSync(legacyAdcDir);
    for (const subdir of subdirs) {
      const candidate = path.join(legacyAdcDir, subdir, 'adc.json');
      if (fs.existsSync(candidate)) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = candidate;
        break;
      }
    }
  }
}

// 3. Parse Command Line Arguments
const args = process.argv.slice(2);
const options = {
  full: false,
  confirm: false,
  sample: null,
  maxReads: 5000,
  projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'showseek-app-2025',
  collections: null,
  help: false,
};

for (const arg of args) {
  if (arg === '--full' || arg === '--scan') {
    options.full = true;
  } else if (arg === '--confirm') {
    options.confirm = true;
  } else if (arg === '--help' || arg === '-h') {
    options.help = true;
  } else if (arg.startsWith('--sample=')) {
    options.sample = parseInt(arg.split('=')[1], 10) || 5;
    options.full = true;
  } else if (arg.startsWith('--max-reads=')) {
    options.maxReads = parseInt(arg.split('=')[1], 10) || 5000;
  } else if (arg.startsWith('--project=')) {
    options.projectId = arg.split('=')[1];
  } else if (arg.startsWith('--collections=')) {
    options.collections = arg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
  }
}

if (options.help) {
  console.log(`
Safe Firestore Database Audit Tool
==================================
Default behavior: Uses Firestore count() aggregations only (1 read per 1,000 documents).
Total read cost for whole database is typically < 50 reads total.

Options:
  --collections=a,b   Comma-separated list of target collections to inspect
  --full, --scan      Enable document data inspection (capped at sample size or requires --confirm)
  --sample=N          When inspecting data, read only N sample documents per collection (default: 5)
  --confirm           Confirm full scan if total estimated reads exceed safety threshold
  --max-reads=N       Safety cap for maximum allowed reads without --confirm (default: 5000)
  --project=ID        Google Cloud Project ID (default: showseek-app-2025)
  --help, -h          Show this help message
`);
  process.exit(0);
}

// 4. Known Collections & Subcollection Groups in ShowSeek
const KNOWN_COLLECTIONS = [
  { name: 'users', type: 'collection', label: 'users (root)' },
  { name: 'revenuecatWebhookEvents', type: 'collection', label: 'revenuecatWebhookEvents (root)' },
  { name: 'tempmediaStorage', type: 'collection', label: 'tempmediaStorage (root)' },
  { name: 'ratings', type: 'group', label: 'ratings (subcollection group)' },
  { name: 'episode_tracking', type: 'group', label: 'episode_tracking (subcollection group)' },
  { name: 'lists', type: 'group', label: 'lists (subcollection group)' },
  { name: 'watches', type: 'group', label: 'watches (subcollection group)' },
  { name: 'collection_tracking', type: 'group', label: 'collection_tracking (subcollection group)' },
  { name: 'reminders', type: 'group', label: 'reminders (subcollection group)' },
  { name: 'favorite_persons', type: 'group', label: 'favorite_persons (subcollection group)' },
  { name: 'notes', type: 'group', label: 'notes (subcollection group)' },
];

async function main() {
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: options.projectId });
  }
  const db = admin.firestore();

  const targets = options.collections
    ? options.collections.map(c => {
        const known = KNOWN_COLLECTIONS.find(k => k.name === c);
        return known || { name: c, type: 'group', label: `${c} (custom)` };
      })
    : KNOWN_COLLECTIONS;

  console.log('================================================================');
  console.log(` Firestore Safe Database Audit [Project: ${options.projectId}]`);
  console.log(` Mode: ${options.full ? 'DOCUMENT SCAN' : 'CHEAP AGGREGATION (count() only)'}`);
  console.log('================================================================\n');

  console.log('Step 1: Running cheap count() aggregation queries (1 read / 1,000 index entries)...\n');

  const results = [];
  let totalDocs = 0;
  let totalAggregationReads = 0;

  for (const target of targets) {
    try {
      const ref = target.type === 'collection' ? db.collection(target.name) : db.collectionGroup(target.name);
      const countSnapshot = await ref.count().get();
      const count = countSnapshot.data().count;
      // Firestore charges 1 document read per 1,000 index entries matched (minimum 1 read per query)
      const chargedReads = Math.max(1, Math.ceil(count / 1000));

      totalDocs += count;
      totalAggregationReads += chargedReads;

      results.push({
        name: target.name,
        label: target.label,
        count,
        chargedReads,
        ref,
      });
    } catch (err) {
      results.push({
        name: target.name,
        label: target.label,
        count: 'ERROR',
        chargedReads: 0,
        error: err.message,
      });
    }
  }

  // Format table output
  console.log(
    `${'Collection / Group'.padEnd(42)} | ${'Doc Count'.padStart(10)} | ${'Count Reads'.padStart(11)} | ${'Est Scan Cost'.padStart(15)}`
  );
  console.log('-'.repeat(85));

  for (const r of results) {
    if (r.error) {
      console.log(
        `${r.label.padEnd(42)} | ${'ERROR'.padStart(10)} | ${'0'.padStart(11)} | ${r.error.slice(0, 15).padStart(15)}`
      );
    } else {
      console.log(
        `${r.label.padEnd(42)} | ${r.count.toLocaleString().padStart(10)} | ${r.chargedReads.toLocaleString().padStart(11)} | ${(r.count.toLocaleString() + ' reads').padStart(15)}`
      );
    }
  }

  console.log('-'.repeat(85));
  console.log(`Total Documents:        ${totalDocs.toLocaleString()}`);
  console.log(`Actual Reads Used:      ${totalAggregationReads} reads (~${((totalAggregationReads / 50000) * 100).toFixed(2)}% of 50K daily quota)`);
  console.log(`Full Scan Potential:    ${totalDocs.toLocaleString()} reads (~${((totalDocs / 50000) * 100).toFixed(1)}% of 50K daily quota)\n`);

  // Step 2: Handle Full / Scan requests with Hard Safety Cap
  if (!options.full) {
    console.log('[Info] Audit complete. Zero document contents were fetched (only cheap aggregation counts).');
    console.log('       To inspect document contents safely, run with --sample=5 (e.g. 5 docs per collection).');
    return;
  }

  console.log('Step 2: Processing Document Scan Request...');

  if (options.sample) {
    let totalPlannedSampleReads = 0;
    for (const r of results) {
      if (!r.ref || typeof r.count !== 'number' || r.count === 0) continue;
      totalPlannedSampleReads += Math.min(options.sample, r.count);
    }

    if (totalPlannedSampleReads > options.maxReads && !options.confirm) {
      console.error('\n' + '!'.repeat(70));
      console.error(`[SAFETY ABORT] Sample scan would perform ${totalPlannedSampleReads.toLocaleString()} document reads!`);
      console.error(`This exceeds the safety threshold of ${options.maxReads.toLocaleString()} reads.`);
      console.error('To proceed with this sample scan, you must explicitly pass --confirm.');
      console.error(`Example: node scripts/firestore-db-audit.mjs --full --sample=${options.sample} --confirm`);
      console.error('!'.repeat(70) + '\n');
      process.exit(1);
    }

    console.log(`[Safety Guard] Sample mode active: Reading max ${options.sample} docs per collection (safe limit).\n`);
    for (const r of results) {
      if (!r.ref || typeof r.count !== 'number' || r.count === 0) continue;
      const snap = await r.ref.limit(options.sample).get();
      console.log(`--- Sample from ${r.label} (${snap.size} docs fetched) ---`);
      snap.docs.forEach((doc, idx) => {
        const preview = JSON.stringify(doc.data()).slice(0, 100);
        console.log(`  [${idx + 1}] ID: ${doc.id} | Path: ${doc.ref.path} | Data: ${preview}...`);
      });
      console.log('');
    }
    return;
  }

  // If full scan requested without sample: enforce Hard Safety Cap
  if (totalDocs > options.maxReads && !options.confirm) {
    console.error('\n' + '!'.repeat(70));
    console.error(`[SAFETY ABORT] Full scan would perform ${totalDocs.toLocaleString()} document reads!`);
    console.error(`This exceeds the safety threshold of ${options.maxReads.toLocaleString()} reads`);
    console.error(`and would consume ~${((totalDocs / 50000) * 100).toFixed(1)}% of your daily 50,000 free quota.`);
    console.error('To proceed with this full scan, you must explicitly pass --confirm.');
    console.error('Example: node scripts/firestore-db-audit.mjs --full --confirm');
    console.error('Or use sampling: node scripts/firestore-db-audit.mjs --sample=10');
    console.error('!'.repeat(70) + '\n');
    process.exit(1);
  }

  console.log(`[Confirmed] Proceeding with full scan of ${totalDocs.toLocaleString()} documents...`);
  let totalScanned = 0;
  for (const r of results) {
    if (!r.ref || typeof r.count !== 'number' || r.count === 0) continue;
    const snap = await r.ref.get();
    totalScanned += snap.size;
    console.log(`  Scanned ${r.label}: ${snap.size} documents read.`);
  }
  console.log(`\nScan finished. Total documents read: ${totalScanned.toLocaleString()}`);
}

main().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
