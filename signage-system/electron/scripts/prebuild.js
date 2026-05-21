#!/usr/bin/env node
/**
 * 빌드 전 준비 스크립트:
 * 1. client 빌드 (React → dist)
 * 2. player 빌드 (React → dist)
 * (서버 소스는 extraResources로 ../server 에서 직접 복사되므로 별도 작업 불필요)
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function buildApp(name, dir) {
  const step = name === 'client' ? '1' : '2';
  console.log(`\n[${step}/2] ${name} 빌드 중...`);
  execSync('npm run build', {
    cwd: path.join(ROOT, dir),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  console.log(`   ✅ ${name} 빌드 완료`);
}

try {
  console.log('====================================');
  console.log(' 사이니지 시스템 빌드 준비 시작');
  console.log('====================================');

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
