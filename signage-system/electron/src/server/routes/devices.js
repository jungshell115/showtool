const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// 디바이스 목록
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const devices = db.prepare('SELECT * FROM devices ORDER BY id').all();
  res.json(devices);
});

// 디바이스 상태 업데이트 (플레이어용)
router.post('/:id/heartbeat', (req, res) => {
  const { current_content } = req.body;
  const db = getDb();

  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!device) return res.status(404).json({ error: '디바이스를 찾을 수 없습니다' });

  db.prepare(`
    UPDATE devices SET last_seen = CURRENT_TIMESTAMP, current_content = ? WHERE id = ?
  `).run(current_content || null, req.params.id);

  res.json({ ok: true });
});

// 긴급 공지 목록
router.get('/emergency', authenticateToken, (req, res) => {
  const db = getDb();
  const notices = db.prepare(`
    SELECT en.*, c.name as content_name, c.type as content_type, c.filename
    FROM emergency_notices en
    JOIN contents c ON c.id = en.content_id
    WHERE en.is_active = 1
    ORDER BY en.created_at DESC
  `).all();
  res.json(notices);
});

// 긴급 공지 생성
router.post('/emergency', authenticateToken, (req, res) => {
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

  res.status(201).json(notice);
});

// 긴급 공지 해제
router.delete('/emergency/:id', authenticateToken, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE emergency_notices SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: '긴급 공지가 해제되었습니다' });
});

// 활성 긴급 공지 조회 (플레이어용)
router.get('/emergency/active/:deviceId', (req, res) => {
  const db = getDb();
  const deviceId = req.params.deviceId;

  const notices = db.prepare(`
    SELECT en.*, c.name as content_name, c.type as content_type, c.filename
    FROM emergency_notices en
    JOIN contents c ON c.id = en.content_id
    WHERE en.is_active = 1
  `).all();

  const applicable = notices.find(n => {
    if (n.target_devices === 'all') return true;
    try {
      const targets = JSON.parse(n.target_devices);
      return targets.includes(deviceId);
    } catch {
      return false;
    }
  });

  res.json(applicable || null);
});

module.exports = router;
