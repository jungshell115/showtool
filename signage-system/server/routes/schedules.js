const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

let _io = null;
function setIo(io) { _io = io; }

function notifyDevice(deviceId) {
  if (_io) _io.to(`device:${deviceId}`).emit('schedule-update', { deviceId });
}

function getCurrentSchedule(deviceId) {
  const db = getDb();
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM
  const currentDay = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()];
  const currentDate = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const schedules = db.prepare(`
    SELECT s.*, p.name as playlist_name
    FROM schedules s
    JOIN playlists p ON p.id = s.playlist_id
    WHERE s.device_id = ? AND s.is_active = 1
    ORDER BY s.start_time
  `).all(deviceId);

  for (const schedule of schedules) {
    // 날짜 범위 체크
    if (schedule.date_from && currentDate < schedule.date_from) continue;
    if (schedule.date_to && currentDate > schedule.date_to) continue;

    // 시간 체크
    if (currentTime < schedule.start_time || currentTime >= schedule.end_time) continue;

    // 반복 요일 체크
    if (schedule.repeat_type === 'weekdays') {
      if (['SAT', 'SUN'].includes(currentDay)) continue;
    } else if (schedule.repeat_type === 'weekends') {
      if (!['SAT', 'SUN'].includes(currentDay)) continue;
    } else if (schedule.repeat_type === 'custom') {
      const days = JSON.parse(schedule.repeat_days || '[]');
      if (!days.includes(currentDay)) continue;
    }

    // 해당 스케줄의 플레이리스트 아이템 로드
    const items = db.prepare(`
      SELECT pi.*, c.name, c.type, c.filename, c.thumbnail, c.duration
      FROM playlist_items pi
      JOIN contents c ON c.id = pi.content_id
      WHERE pi.playlist_id = ?
      ORDER BY pi.order_index
    `).all(schedule.playlist_id);

    return { schedule, items };
  }

  // 스케줄 없으면 기본 플레이리스트
  const defaultPlaylist = db.prepare("SELECT * FROM playlists WHERE name = '기본 플레이리스트'").get();
  if (defaultPlaylist) {
    const items = db.prepare(`
      SELECT pi.*, c.name, c.type, c.filename, c.thumbnail, c.duration
      FROM playlist_items pi
      JOIN contents c ON c.id = pi.content_id
      WHERE pi.playlist_id = ?
      ORDER BY pi.order_index
    `).all(defaultPlaylist.id);
    return { schedule: { playlist_name: '기본 플레이리스트', playlist_id: defaultPlaylist.id }, items };
  }

  return { schedule: null, items: [] };
}

// 스케줄 목록
router.get('/', authenticateToken, (req, res) => {
  const { device_id } = req.query;
  const db = getDb();

  let query = `
    SELECT s.*, p.name as playlist_name, d.name as device_name
    FROM schedules s
    JOIN playlists p ON p.id = s.playlist_id
    JOIN devices d ON d.id = s.device_id
  `;
  const params = [];

  if (device_id) {
    query += ' WHERE s.device_id = ?';
    params.push(device_id);
  }

  query += ' ORDER BY s.device_id, s.start_time';

  const schedules = db.prepare(query).all(...params);
  res.json(schedules);
});

// 스케줄 생성
router.post('/', authenticateToken, (req, res) => {
  const { device_id, playlist_id, start_time, end_time, repeat_type, repeat_days, date_from, date_to } = req.body;

  if (!device_id || !playlist_id || !start_time || !end_time) {
    return res.status(400).json({ error: '필수 항목을 입력하세요' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO schedules (device_id, playlist_id, start_time, end_time, repeat_type, repeat_days, date_from, date_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    device_id, playlist_id, start_time, end_time,
    repeat_type || 'daily',
    repeat_days ? JSON.stringify(repeat_days) : null,
    date_from || null,
    date_to || null
  );

  const schedule = db.prepare(`
    SELECT s.*, p.name as playlist_name, d.name as device_name
    FROM schedules s
    JOIN playlists p ON p.id = s.playlist_id
    JOIN devices d ON d.id = s.device_id
    WHERE s.id = ?
  `).get(result.lastInsertRowid);

  notifyDevice(schedule.device_id);
  res.status(201).json(schedule);
});

// 스케줄 수정
router.put('/:id', authenticateToken, (req, res) => {
  const { device_id, playlist_id, start_time, end_time, repeat_type, repeat_days, date_from, date_to, is_active } = req.body;
  const db = getDb();

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: '스케줄을 찾을 수 없습니다' });

  db.prepare(`
    UPDATE schedules SET
      device_id = COALESCE(?, device_id),
      playlist_id = COALESCE(?, playlist_id),
      start_time = COALESCE(?, start_time),
      end_time = COALESCE(?, end_time),
      repeat_type = COALESCE(?, repeat_type),
      repeat_days = ?,
      date_from = ?,
      date_to = ?,
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(
    device_id, playlist_id, start_time, end_time, repeat_type,
    repeat_days ? JSON.stringify(repeat_days) : schedule.repeat_days,
    date_from !== undefined ? date_from : schedule.date_from,
    date_to !== undefined ? date_to : schedule.date_to,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    req.params.id
  );

  const updated = db.prepare(`
    SELECT s.*, p.name as playlist_name, d.name as device_name
    FROM schedules s
    JOIN playlists p ON p.id = s.playlist_id
    JOIN devices d ON d.id = s.device_id
    WHERE s.id = ?
  `).get(req.params.id);

  notifyDevice(updated.device_id);
  res.json(updated);
});

// 스케줄 삭제
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: '스케줄을 찾을 수 없습니다' });

  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  notifyDevice(schedule.device_id);
  res.json({ message: '스케줄이 삭제되었습니다' });
});

// 현재 스케줄 조회 (플레이어용)
router.get('/current/:deviceId', (req, res) => {
  const result = getCurrentSchedule(req.params.deviceId);
  res.json(result);
});

module.exports = { router, getCurrentSchedule, setIo };
