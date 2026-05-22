const { app, BrowserWindow, Tray, Menu, shell, clipboard, nativeImage, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');
const { execSync, exec } = require('child_process');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;
let settings = {};

// ─── 설정 파일 관리 ────────────────────────────────────────────
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'signage-settings.json');
}

function loadSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch { settings = {}; }
  return settings;
}

function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

// ─── Windows 방화벽 규칙 자동 등록 ─────────────────────────────
function ensureFirewallRule() {
  if (process.platform !== 'win32') return;
  try {
    const check = execSync(
      'netsh advfirewall firewall show rule name="사이니지 서버"',
      { encoding: 'utf8', stdio: 'pipe' }
    );
    if (check.includes('규칙 없음') || check.includes('No rules match')) throw new Error('no rule');
  } catch {
    try {
      execSync(
        'netsh advfirewall firewall add rule name="사이니지 서버" dir=in action=allow protocol=TCP localport=4000',
        { stdio: 'pipe' }
      );
      console.log('방화벽 규칙 등록 완료 (포트 4000)');
    } catch (err) {
      console.warn('방화벽 규칙 등록 실패 (관리자 권한 필요):', err.message);
    }
  }
}

// ─── 자동 업데이트 ─────────────────────────────────────────────
function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.autoDownload = false;
  autoUpdater.logger = console;

  autoUpdater.on('update-available', info => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '업데이트 가능',
      message: `새 버전 ${info.version}이 있습니다. 다운로드하시겠습니까?`,
      buttons: ['다운로드', '나중에'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '업데이트 준비 완료',
      message: '업데이트가 다운로드됐습니다. 지금 재시작하시겠습니까?',
      buttons: ['재시작', '나중에'],
    }).then(({ response }) => {
      if (response === 0) { app.isQuitting = true; autoUpdater.quitAndInstall(); }
    });
  });

  autoUpdater.on('error', err => console.warn('자동 업데이트 오류:', err.message));

  // 앱 시작 후 1분 뒤 업데이트 확인
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 60000);
}

// ─── 네트워크 IP 목록 ────────────────────────────────────────────
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  Object.values(interfaces).forEach(iface => {
    iface.forEach(alias => {
      if (alias.family === 'IPv4' && !alias.internal) ips.push(alias.address);
    });
  });
  return ips;
}

// ─── 서버 시작 ──────────────────────────────────────────────────
function startServer() {
  const userData = app.getPath('userData');
  const uploadsDir = path.join(userData, 'uploads');

  const clientDist = isDev
    ? path.join(__dirname, '../client/dist')
    : path.join(process.resourcesPath, 'client-dist');

  const playerDist = isDev
    ? path.join(__dirname, '../player/dist')
    : path.join(process.resourcesPath, 'player-dist');

  // DB 복원 파일이 있으면 교체
  const dbPath = path.join(userData, 'signage.db');
  const dbRestorePath = dbPath + '.restore';
  if (fs.existsSync(dbRestorePath)) {
    try {
      fs.copyFileSync(dbRestorePath, dbPath);
      fs.unlinkSync(dbRestorePath);
      console.log('DB 복원 완료');
    } catch (err) {
      console.error('DB 복원 실패:', err.message);
    }
  }

  Object.assign(process.env, {
    PORT: '4000',
    DB_PATH: dbPath,
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
    dialog.showErrorBox('서버 시작 오류', `서버를 시작할 수 없습니다.\n\n${err.message}`);
  }
}

async function waitForServer(url, maxWait = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`${url}/api/health`, res => { res.resume(); resolve(); });
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
    color: white; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100vh; font-family: -apple-system, 'Malgun Gothic', sans-serif;
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
  <div class="subtitle">연결하는 중...</div>
  <div class="bar-bg"><div class="bar"></div></div>
</body>
</html>`;
}

// ─── 원격 서버 설정 다이얼로그 ──────────────────────────────────
async function showServerConfigDialog() {
  const current = settings.remoteServerUrl || '';
  const mode = settings.serverMode || 'local';

  const result = await dialog.showMessageBox(mainWindow || app, {
    type: 'question',
    title: '서버 연결 설정',
    message: '서버 모드를 선택하세요',
    detail: mode === 'remote'
      ? `현재: 원격 서버 (${current})`
      : '현재: 이 PC를 서버로 사용',
    buttons: ['이 PC를 서버로 사용', '다른 PC 서버에 연결', '취소'],
    defaultId: mode === 'remote' ? 1 : 0,
  });

  if (result.response === 2) return;

  if (result.response === 0) {
    saveSettings({ serverMode: 'local', remoteServerUrl: '' });
    dialog.showMessageBox({ type: 'info', message: '로컬 서버 모드로 변경됐습니다.\n앱을 재시작하세요.', buttons: ['확인'] });
  } else {
    // 원격 서버 URL 입력
    const { BrowserWindow: BW } = require('electron');
    const inputWin = new BW({
      width: 460, height: 200, resizable: false, modal: true,
      parent: mainWindow || undefined,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
      title: '원격 서버 URL 입력',
    });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>body{font-family:'Malgun Gothic',sans-serif;padding:24px;background:#1a1a2e;color:#fff}
    input{width:100%;padding:10px;margin:12px 0;border:1px solid #444;border-radius:6px;background:#2d2d44;color:#fff;font-size:14px;box-sizing:border-box}
    button{padding:10px 24px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px}
    p{font-size:13px;opacity:.7;margin-bottom:4px}</style></head>
    <body>
    <p>다른 PC의 서버 주소를 입력하세요 (예: http://192.168.1.10:4000)</p>
    <input id="url" type="text" value="${current}" placeholder="http://192.168.x.x:4000" />
    <button onclick="
      const v=document.getElementById('url').value.trim();
      if(!v){alert('URL을 입력하세요');return;}
      require('electron').ipcRenderer.send('set-remote-url', v);
    ">저장</button>
    </body></html>`;

    inputWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    ipcMain.once('set-remote-url', (e, url) => {
      inputWin.close();
      saveSettings({ serverMode: 'remote', remoteServerUrl: url });
      dialog.showMessageBox({ type: 'info', message: `원격 서버로 변경됐습니다.\n(${url})\n앱을 재시작하세요.`, buttons: ['확인'] });
    });
  }
}

// ─── 메인 윈도우 생성 ─────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    title: '사이니지 관리 시스템',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getLoadingHTML())}`);
  mainWindow.show();

  const serverUrl = settings.serverMode === 'remote' && settings.remoteServerUrl
    ? settings.remoteServerUrl
    : 'http://localhost:4000';

  waitForServer(serverUrl).then(ready => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(serverUrl);
    if (!ready) console.warn('서버 준비 시간 초과, 강제 로드');
  });

  mainWindow.on('close', e => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
}

// ─── 트레이 ──────────────────────────────────────────────────
function createTray() {
  const iconBase64 =
    'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAA' +
    'SUlEQVQ4jWNgGAWjAAj+//9nYGBg+E8GJqsGBgYGJqoNIIYpNYBimFIDiGFKDSCGKTWAGKbU' +
    'AGKY0gCIYUoNIIYpNQAApZsGDSMzLaQAAAAASUVORK5CYII=';

  const icon = nativeImage.createFromDataURL(iconBase64).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const localIPs = getLocalIPs();
  const isRemote = settings.serverMode === 'remote' && settings.remoteServerUrl;
  const serverBase = isRemote ? settings.remoteServerUrl : `http://${localIPs[0] || 'localhost'}:4000`;

  function buildPlayerMenu() {
    if (isRemote) {
      return [
        { label: `TV-A:    ${serverBase}/player?device=tv-a`,    click: () => clipboard.writeText(`${serverBase}/player?device=tv-a`) },
        { label: `TV-B:    ${serverBase}/player?device=tv-b`,    click: () => clipboard.writeText(`${serverBase}/player?device=tv-b`) },
        { label: `키오스크: ${serverBase}/player?device=kiosk`, click: () => clipboard.writeText(`${serverBase}/player?device=kiosk`) },
      ];
    }
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
    { label: '🌐 브라우저에서 열기', click: () => shell.openExternal(serverBase) },
    { type: 'separator' },
    { label: '📋 플레이어 URL 복사 (클릭하면 복사)', submenu: buildPlayerMenu() },
    { label: `🖧 서버: ${isRemote ? `원격 (${settings.remoteServerUrl})` : (localIPs[0] ? `http://${localIPs[0]}:4000` : 'localhost:4000')}`, enabled: false },
    { type: 'separator' },
    { label: '⚙️ 서버 연결 설정', click: () => showServerConfigDialog() },
    { label: '❌ 종료', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip('사이니지 관리 시스템');
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── IPC 핸들러 ─────────────────────────────────────────────
ipcMain.handle('get-settings', () => settings);
ipcMain.handle('save-settings', (e, newSettings) => { saveSettings(newSettings); return settings; });
ipcMain.handle('restart-app', () => { app.isQuitting = true; app.relaunch(); app.quit(); });

// ─── 앱 시작 ────────────────────────────────────────────────
app.whenReady().then(() => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); return; }

  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });

  loadSettings();
  ensureFirewallRule();

  const isRemote = settings.serverMode === 'remote' && settings.remoteServerUrl;
  if (!isRemote) startServer();

  createWindow();
  createTray();
  setupAutoUpdater();
});

app.on('before-quit', () => { app.isQuitting = true; });
app.on('window-all-closed', () => { /* 트레이에서 계속 실행 */ });
app.on('activate', () => { mainWindow?.show(); });
