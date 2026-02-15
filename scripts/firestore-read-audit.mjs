#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['src', 'app'];
const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);
const EXCLUDED_FILES = new Set(['src/services/firestoreReadAudit.ts']);

const OP_PATTERNS = [
  { op: 'onSnapshot', regex: /\bonSnapshot\s*\(/g, weight: 12 },
  { op: 'auditedOnSnapshot', regex: /\bauditedOnSnapshot\s*\(/g, weight: 12 },
  { op: 'getDocs', regex: /\bgetDocs\s*\(/g, weight: 6 },
  { op: 'auditedGetDocs', regex: /\bauditedGetDocs\s*\(/g, weight: 6 },
  { op: 'getDoc', regex: /\bgetDoc\s*\(/g, weight: 2 },
  { op: 'auditedGetDoc', regex: /\bauditedGetDoc\s*\(/g, weight: 2 },
];

function collectFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath);
}

function getLineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

const findings = [];

for (const targetDir of TARGET_DIRS) {
  const absoluteDir = path.join(ROOT, targetDir);
  if (!fs.existsSync(absoluteDir)) {
    continue;
  }

  for (const filePath of collectFiles(absoluteDir)) {
    const relativePath = toRelative(filePath);
    if (EXCLUDED_FILES.has(relativePath)) {
      continue;
    }

    const source = fs.readFileSync(filePath, 'utf8');

    for (const pattern of OP_PATTERNS) {
      for (const match of source.matchAll(pattern.regex)) {
        const line = getLineNumber(source, match.index || 0);
        findings.push({
          op: pattern.op,
          file: relativePath,
          line,
          weight: pattern.weight,
        });
      }
    }
  }
}

const byOperation = findings.reduce((acc, finding) => {
  acc[finding.op] = (acc[finding.op] || 0) + 1;
  return acc;
}, {});

const byFileScore = findings.reduce((acc, finding) => {
  const key = finding.file;
  if (!acc[key]) {
    acc[key] = { file: key, score: 0, ops: {} };
  }
  acc[key].score += finding.weight;
  acc[key].ops[finding.op] = (acc[key].ops[finding.op] || 0) + 1;
  return acc;
}, {});

const topFiles = Object.values(byFileScore)
  .sort((a, b) => b.score - a.score)
  .slice(0, 15);

const summary = {
  scannedAt: new Date().toISOString(),
  totalCallsites: findings.length,
  byOperation,
  topFiles,
  top5LikelyHeavyPaths: topFiles.slice(0, 5),
};

console.log(JSON.stringify(summary, null, 2));
