const { app, BrowserWindow, Tray, Menu, shell, clipboard, nativeImage, dialog } = require('electron');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');

const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  Object.values(interfaces).forEach(iface => {
    iface.forEach(alias => {
      if (alias.family === 'IPv4' && !alias.internal) {
        ips.push(alias.address);
      }
    });
  });
  return ips;
}

function startServer() {
  const userData = app.getPath('userData');
  const uploadsDir = path.join(userData, 'uploads');

  const clientDist = isDev
    ? path.join(__dirname, '../client/dist')
    : path.join(process.resourcesPath, 'client-dist');

  const playerDist = isDev
    ? path.join(__dirname, '../player/dist')
    : path.join(process.resourcesPath, 'player-dist');

  Object.assign(process.env, {
    PORT: '4000',
    DB_PATH: path.join(userData, 'signage.db'),
    UPLOADS_DIR: uploadsDir,
    CLIENT_DIST: clientDist,
    PLAYER_DIST: playerDist,
    JWT_SECRET: `signage-${os.hostname()}-${app.getVersion()}`,
    NODE_ENV: isDev ? 'development' : 'production',
  });

  const serverEntry = isDev
    ? path.join(__dirname, '../server/index.js')
    : path.join(__dirname, 'server', 'index.js');

  try {
    require(serverEntry);
    console.log('서버 모듈 로드 완료:', serverEntry);
  } catch (err) {
    console.error('서버 시작 실패:', err);
    dialog.showErrorBox(
      '서버 시작 오류',
      `서버를 시작할 수 없습니다.\n\n${err.message}`
    );
  }
}

async function waitForServer(maxWait = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:4000/api/health', res => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(800, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return false;
}

function getLoadingHTML() {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: linear-gradient(135deg, #1e3a5f 0%, #1a1a2e 100%);
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-family: -apple-system, 'Malgun Gothic', sans-serif;
  }
  .icon { font-size: 72px; margin-bottom: 24px; animation: pulse 2s infinite; }
  .title { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
  .subtitle { font-size: 14px; opacity: 0.6; margin-bottom: 32px; }
  .bar-bg { width: 240px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; }
  .bar { height: 4px; background: #3b82f6; border-radius: 2px; animation: loading 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
  @keyframes loading { 0%{width:0%} 50%{width:70%} 100%{width:100%} }
</style></head>
<body>
  <div class="icon">📺</div>
  <div class="title">사이니지 관리 시스템</div>
  <div class="subtitle">서버를 시작하는 중입니다...</div>
  <div class="bar-bg"><div class="bar"></div></div>
</body>
</html>`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: '사이니지 관리 시스템',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(getLoadingHTML())}`
  );
  mainWindow.show();

  waitForServer().then(ready => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL('http://localhost:4000');
    if (!ready) console.warn('서버 준비 시간 초과, 강제 로드');
  });

  mainWindow.on('close', e => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconBase64 =
    'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAA' +
    'SUlEQVQ4jWNgGAWjAAj+//9nYGBg+E8GJqsGBgYGJqoNIIYpNYBimFIDiGFKDSCGKTWAGKbU' +
    'AGKY0gCIYUoNIIYpNQAApZsGDSMzLaQAAAAASUVORK5CYII=';

  const icon = nativeImage.createFromDataURL(iconBase64).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const localIPs = getLocalIPs();

  function buildPlayerMenu() {
    if (localIPs.length === 0) return [{ label: 'IP 주소를 찾을 수 없음', enabled: false }];
    const ip = localIPs[0];
    return [
      { label: `TV-A:    http://${ip}:4000/player?device=tv-a`,    click: () => clipboard.writeText(`http://${ip}:4000/player?device=tv-a`) },
      { label: `TV-B:    http://${ip}:4000/player?device=tv-b`,    click: () => clipboard.writeText(`http://${ip}:4000/player?device=tv-b`) },
      { label: `키오스크: http://${ip}:4000/player?device=kiosk`, click: () => clipboard.writeText(`http://${ip}:4000/player?device=kiosk`) },
    ];
  }

  const menu = Menu.buildFromTemplate([
    { label: '📺 관리자 화면 열기', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: '🌐 브라우저에서 열기', click: () => shell.openExternal('http://localhost:4000') },
    { type: 'separator' },
    { label: '📋 플레이어 URL 복사 (클릭하면 복사)', submenu: buildPlayerMenu() },
    { label: `🖧 서버: ${localIPs[0] ? `http://${localIPs[0]}:4000` : 'localhost:4000'}`, enabled: false },
    { type: 'separator' },
    { label: '❌ 종료', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip('사이니지 관리 시스템');
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

app.whenReady().then(() => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); return; }

  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });

  startServer();
  createWindow();
  createTray();
});

app.on('before-quit', () => { app.isQuitting = true; });
app.on('window-all-closed', () => { /* 트레이에서 계속 실행 */ });
app.on('activate', () => { mainWindow?.show(); });
