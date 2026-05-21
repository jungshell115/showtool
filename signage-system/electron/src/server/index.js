require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initDb, getDb } = require('./db/database');
const authRouter = require('./routes/auth');
const contentsRouter = require('./routes/contents');
const { router: schedulesRouter } = require('./routes/schedules');
const devicesRouter = require('./routes/devices');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// 경로 설정 (Electron에서 환경변수로 주입 가능)
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');
const CLIENT_DIST = process.env.CLIENT_DIST;
const PLAYER_DIST = process.env.PLAYER_DIST;

// uploads 디렉터리 보장
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 업로드 정적 파일
app.use('/uploads', express.static(UPLOADS_DIR));

// API 라우터
app.use('/api/auth', authRouter);
app.use('/api/contents', contentsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/devices', devicesRouter);

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io 연결 관리
const connectedDevices = new Map();

io.on('connection', (socket) => {
  socket.on('register', ({ deviceId }) => {
    socket.deviceId = deviceId;
    socket.join(`device:${deviceId}`);
    connectedDevices.set(deviceId, socket.id);

    // 접속 즉시 활성 긴급 공지 전송
    const db = getDb();
    const notices = db.prepare(`
      SELECT en.*, c.name as content_name, c.type as content_type, c.filename
      FROM emergency_notices en
      JOIN contents c ON c.id = en.content_id
      WHERE en.is_active = 1
    `).all();

    notices.forEach(notice => {
      let isTarget = notice.target_devices === 'all';
      if (!isTarget) {
        try { isTarget = JSON.parse(notice.target_devices).includes(deviceId); } catch {}
      }
      if (isTarget) socket.emit('emergency', notice);
    });
  });

  socket.on('register-admin', () => {
    socket.join('admins');
  });

  socket.on('now-playing', ({ deviceId, contentName }) => {
    io.to('admins').emit('device-status', {
      deviceId,
      contentName,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    if (socket.deviceId) {
      connectedDevices.delete(socket.deviceId);
      io.to('admins').emit('device-offline', { deviceId: socket.deviceId });
    }
  });
});

// 긴급 공지 푸시/해제 헬퍼
function pushEmergency(notice, targetDevices) {
  if (targetDevices === 'all') {
    io.emit('emergency', notice);
  } else {
    const targets = Array.isArray(targetDevices) ? targetDevices : JSON.parse(targetDevices);
    targets.forEach(id => io.to(`device:${id}`).emit('emergency', notice));
  }
  io.to('admins').emit('emergency-pushed', notice);
}

function pushEmergencyCancel(noticeId) {
  io.emit('emergency-cancel', { id: noticeId });
  io.to('admins').emit('emergency-cancelled', { id: noticeId });
}

// 긴급 공지 즉시 푸시 (Socket.io 포함)
app.post('/api/devices/emergency-push', require('./middleware/auth').authenticateToken, (req, res) => {
  const { content_id, target_devices } = req.body;
  if (!content_id || !target_devices) {
    return res.status(400).json({ error: '콘텐츠와 대상 디바이스를 선택하세요' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO emergency_notices (content_id, target_devices)
    VALUES (?, ?)
  `).run(content_id, Array.isArray(target_devices) ? JSON.stringify(target_devices) : target_devices);

  const notice = db.prepare(`
    SELECT en.*, c.name as content_name, c.type as content_type, c.filename
    FROM emergency_notices en
    JOIN contents c ON c.id = en.content_id
    WHERE en.id = ?
  `).get(result.lastInsertRowid);

  pushEmergency(notice, target_devices);
  res.status(201).json(notice);
});

app.delete('/api/devices/emergency-cancel/:id', require('./middleware/auth').authenticateToken, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE emergency_notices SET is_active = 0 WHERE id = ?').run(req.params.id);
  pushEmergencyCancel(parseInt(req.params.id));
  res.json({ message: '긴급 공지가 해제되었습니다' });
});

// ─── 정적 파일 서빙 (Electron/Production용) ───────────────────
// 플레이어 앱 서빙 (/player/*)
if (PLAYER_DIST && fs.existsSync(PLAYER_DIST)) {
  app.use('/player', express.static(PLAYER_DIST));
  app.get('/player*', (req, res) => {
    res.sendFile(path.join(PLAYER_DIST, 'index.html'));
  });
  console.log(`플레이어 정적 파일: ${PLAYER_DIST}`);
}

// 관리자 클라이언트 서빙 (/* 나머지)
if (CLIENT_DIST && fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
  console.log(`클라이언트 정적 파일: ${CLIENT_DIST}`);
}

// ─── DB 초기화 및 서버 시작 ───────────────────────────────────
initDb();

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});

module.exports = { app, io };
