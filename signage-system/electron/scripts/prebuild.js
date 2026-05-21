#!/usr/bin/env node
/**
 * 빌드 전 준비 스크립트:
 * 1. server/ 소스 파일을 electron/src/server/에 복사
 * 2. client 빌드 (React → dist)
 * 3. player 빌드 (React → dist)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const ELECTRON_DIR = path.resolve(__dirname, '..');
const SERVER_SRC = path.resolve(ROOT, 'server');
const DEST_SERVER = path.join(ELECTRON_DIR, 'src/server');

// ─── 서버 소스 복사 ───────────────────────────────────────────
function copyServer() {
  console.log('\n[1/3] 서버 소스 파일 복사 중...');

  if (fs.existsSync(DEST_SERVER)) {
    fs.rmSync(DEST_SERVER, { recursive: true, force: true });
  }

  const SKIP = new Set(['node_modules', 'uploads', '.env']);

  function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      if (/\.(db|db-shm|db-wal)$/.test(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  copyDir(SERVER_SRC, DEST_SERVER);
  console.log('   ✅ 서버 소스 복사 완료');
}

// ─── React 앱 빌드 ────────────────────────────────────────────
function buildApp(name, dir) {
  console.log(`\n[${name === 'client' ? '2' : '3'}/3] ${name} 빌드 중...`);
  execSync('npm run build', {
    cwd: path.join(ROOT, dir),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  console.log(`   ✅ ${name} 빌드 완료`);
}

// ─── 실행 ──────────────────────────────────────────────────────
try {
  console.log('====================================');
  console.log(' 사이니지 시스템 빌드 준비 시작');
  console.log('====================================');

  copyServer();
  buildApp('client', 'client');
  buildApp('player', 'player');

  console.log('\n====================================');
  console.log(' ✅ 사전 빌드 완료!');
  console.log(' electron-builder 패키징 시작...');
  console.log('====================================\n');
} catch (err) {
  console.error('\n❌ 빌드 실패:', err.message);
  process.exit(1);
}
