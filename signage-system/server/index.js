require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initDb, getDb } = require('./db/database');
const authRouter = require('./routes/auth');
const contentsRouter = require('./routes/contents');
const { router: schedulesRouter } = require('./routes/schedules');
const devicesRouter = require('./routes/devices');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 서빙
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/thumbnails', express.static(path.join(__dirname, 'uploads/thumbnails')));

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
  console.log(`소켓 연결: ${socket.id}`);

  // 플레이어 등록
  socket.on('register', ({ deviceId }) => {
    socket.deviceId = deviceId;
    socket.join(`device:${deviceId}`);
    connectedDevices.set(deviceId, socket.id);
    console.log(`디바이스 등록: ${deviceId}`);

    // 활성 긴급 공지 전송
    const db = getDb();
    const notices = db.prepare(`
      SELECT en.*, c.name as content_name, c.type as content_type, c.filename
      FROM emergency_notices en
      JOIN contents c ON c.id = en.content_id
      WHERE en.is_active = 1
    `).all();

    notices.forEach(notice => {
      let targets = notice.target_devices;
      let isTarget = targets === 'all';
      if (!isTarget) {
        try {
          isTarget = JSON.parse(targets).includes(deviceId);
        } catch {}
      }
      if (isTarget) {
        socket.emit('emergency', notice);
      }
    });
  });

  // 관리자 등록
  socket.on('register-admin', () => {
    socket.join('admins');
    console.log('관리자 연결');
  });

  // 콘텐츠 재생 현황 업데이트
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
    console.log(`소켓 해제: ${socket.id}`);
  });
});

// 긴급 공지 푸시 (내부 함수)
function pushEmergency(notice, targetDevices) {
  if (targetDevices === 'all') {
    io.emit('emergency', notice);
  } else {
    const targets = Array.isArray(targetDevices) ? targetDevices : JSON.parse(targetDevices);
    targets.forEach(deviceId => {
      io.to(`device:${deviceId}`).emit('emergency', notice);
    });
  }
  io.to('admins').emit('emergency-pushed', notice);
}

// 긴급 공지 해제 브로드캐스트
function pushEmergencyCancel(noticeId) {
  io.emit('emergency-cancel', { id: noticeId });
  io.to('admins').emit('emergency-cancelled', { id: noticeId });
}

// 라우터에 io 주입
app.set('io', io);
app.set('pushEmergency', pushEmergency);
app.set('pushEmergencyCancel', pushEmergencyCancel);

// 긴급 공지 라우터에 소켓 이벤트 추가
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

// DB 초기화 및 서버 시작
initDb();

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});

module.exports = { app, io };
