const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { getDb } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// Electron 환경에서는 UPLOADS_DIR 환경변수로 userData 경로 주입
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('JPG, PNG, GIF, MP4 파일만 업로드 가능합니다'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

async function generateImageThumbnail(filename) {
  const srcPath = path.join(UPLOADS_DIR, filename);
  const thumbName = 'thumb_' + filename.replace(/\.[^.]+$/, '.jpg');
  const thumbPath = path.join(THUMBNAILS_DIR, thumbName);

  await sharp(srcPath)
    .resize(320, 180, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toFile(thumbPath);

  return thumbName;
}

async function generateVideoThumbnail(filename) {
  // ffmpeg를 사용한 비디오 썸네일 - ffmpeg 없는 환경을 위한 fallback
  try {
    const ffmpeg = require('fluent-ffmpeg');
    const srcPath = path.join(UPLOADS_DIR, filename);
    const thumbName = 'thumb_' + filename.replace(/\.[^.]+$/, '.jpg');
    const thumbPath = path.join(THUMBNAILS_DIR, thumbName);

    await new Promise((resolve, reject) => {
      ffmpeg(srcPath)
        .on('end', resolve)
        .on('error', reject)
        .screenshots({
          count: 1,
          timemarks: ['1'],
          filename: thumbName,
          folder: THUMBNAILS_DIR,
          size: '320x180'
        });
    });

    return thumbName;
  } catch (err) {
    console.warn('ffmpeg 썸네일 생성 실패, 기본 썸네일 사용:', err.message);
    return null;
  }
}

// 콘텐츠 목록
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const contents = db.prepare('SELECT * FROM contents ORDER BY created_at DESC').all();
  res.json(contents);
});

// 콘텐츠 업로드
router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일을 선택해주세요' });
    }

    const { name } = req.body;
    const filename = req.file.filename;
    const fileSize = req.file.size;
    const mimeType = req.file.mimetype;
    const contentType = mimeType.startsWith('image/') ? 'image' : 'video';

    let thumbnail = null;
    let duration = null;

    if (contentType === 'image') {
      try {
        thumbnail = await generateImageThumbnail(filename);
      } catch (e) {
        console.warn('이미지 썸네일 생성 실패:', e.message);
      }
    } else {
      try {
        thumbnail = await generateVideoThumbnail(filename);
      } catch (e) {
        console.warn('비디오 썸네일 생성 실패:', e.message);
      }
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO contents (name, type, filename, thumbnail, duration, file_size)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name || req.file.originalname, contentType, filename, thumbnail, duration, fileSize);

    const content = db.prepare('SELECT * FROM contents WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(content);
  } catch (err) {
    if (req.file) {
      fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
    }
    res.status(500).json({ error: err.message });
  }
});

// 콘텐츠 삭제
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const content = db.prepare('SELECT * FROM contents WHERE id = ?').get(req.params.id);

  if (!content) {
    return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다' });
  }

  // 파일 삭제
  const filePath = path.join(UPLOADS_DIR, content.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  if (content.thumbnail) {
    const thumbPath = path.join(THUMBNAILS_DIR, content.thumbnail);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }

  db.prepare('DELETE FROM contents WHERE id = ?').run(req.params.id);
  res.json({ message: '콘텐츠가 삭제되었습니다' });
});

// 플레이리스트 목록
router.get('/playlists', authenticateToken, (req, res) => {
  const db = getDb();
  const playlists = db.prepare('SELECT * FROM playlists ORDER BY created_at DESC').all();

  const result = playlists.map(pl => {
    const items = db.prepare(`
      SELECT pi.*, c.name, c.type, c.filename, c.thumbnail, c.duration
      FROM playlist_items pi
      JOIN contents c ON c.id = pi.content_id
      WHERE pi.playlist_id = ?
      ORDER BY pi.order_index
    `).all(pl.id);
    return { ...pl, items };
  });

  res.json(result);
});

// 플레이리스트 생성
router.post('/playlists', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '플레이리스트 이름을 입력하세요' });

  const db = getDb();
  const result = db.prepare('INSERT INTO playlists (name) VALUES (?)').run(name);
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...playlist, items: [] });
});

// 플레이리스트 수정
router.put('/playlists/:id', authenticateToken, (req, res) => {
  const { name, items } = req.body;
  const db = getDb();

  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: '플레이리스트를 찾을 수 없습니다' });

  const update = db.transaction(() => {
    if (name) {
      db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, req.params.id);
    }

    if (items !== undefined) {
      db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(req.params.id);
      const insert = db.prepare(`
        INSERT INTO playlist_items (playlist_id, content_id, order_index, display_duration)
        VALUES (?, ?, ?, ?)
      `);
      items.forEach((item, idx) => {
        insert.run(req.params.id, item.content_id, idx, item.display_duration || 5);
      });
    }
  });

  update();

  const updated = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  const updatedItems = db.prepare(`
    SELECT pi.*, c.name, c.type, c.filename, c.thumbnail, c.duration
    FROM playlist_items pi
    JOIN contents c ON c.id = pi.content_id
    WHERE pi.playlist_id = ?
    ORDER BY pi.order_index
  `).all(req.params.id);

  res.json({ ...updated, items: updatedItems });
});

// 플레이리스트 삭제
router.delete('/playlists/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: '플레이리스트를 찾을 수 없습니다' });

  db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
  res.json({ message: '플레이리스트가 삭제되었습니다' });
});

module.exports = router;
