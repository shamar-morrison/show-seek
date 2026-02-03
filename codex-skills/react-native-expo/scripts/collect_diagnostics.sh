#!/usr/bin/env bash
set -euo pipefail

OUT_FILE="${1:-rn-diagnostics.txt}"

{
  echo "== React Native / Expo diagnostics =="
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo

  echo "-- cwd --"
  pwd
  echo

  echo "-- versions --"
  command -v node >/dev/null 2>&1 && echo "node: $(node -v)" || echo "node: (missing)"
  command -v pnpm >/dev/null 2>&1 && echo "pnpm: $(pnpm -v)" || echo "pnpm: (missing)"
  command -v npm >/dev/null 2>&1 && echo "npm: $(npm -v)" || echo "npm: (missing)"
  command -v yarn >/dev/null 2>&1 && echo "yarn: $(yarn -v)" || echo "yarn: (missing)"
  command -v npx >/dev/null 2>&1 && echo "npx: (present)" || echo "npx: (missing)"
  command -v git >/dev/null 2>&1 && echo "git: $(git --version)" || echo "git: (missing)"
  echo

  echo "-- expo/eas --"
  command -v expo >/dev/null 2>&1 && echo "expo: $(expo --version 2>/dev/null || true)" || echo "expo: (missing)"
  command -v eas >/dev/null 2>&1 && echo "eas: $(eas --version 2>/dev/null || true)" || echo "eas: (missing)"
  if command -v npx >/dev/null 2>&1; then
    echo "npx expo --version: $(npx --yes expo --version 2>/dev/null || echo "(failed)")"
  fi
  echo

  echo "-- java --"
  command -v java >/dev/null 2>&1 && (java -version 2>&1 | head -n 3) || echo "java: (missing)"
  echo

  echo "-- os --"
  uname -a || true
  echo

  echo "-- git status --"
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git status --porcelain=v1 || true
  else
    echo "(not a git repo)"
  fi
  echo

  echo "-- package.json (if present) --"
  if [ -f package.json ]; then
    node -e "const p=require('./package.json'); console.log(JSON.stringify({name:p.name, version:p.version, packageManager:p.packageManager, dependencies:{expo:p.dependencies?.expo, 'react-native':p.dependencies?.['react-native'], react:p.dependencies?.react, 'expo-router':p.dependencies?.['expo-router']}, scripts:p.scripts}, null, 2));" 2>/dev/null || cat package.json
  else
    echo "(missing package.json)"
  fi
} > "$OUT_FILE"

echo "Wrote $OUT_FILE"

