const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../db/signage.db');

const uploadBackup = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// 백업 다운로드
router.get('/', authenticateToken, (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="signage-backup-${date}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
  archive.pipe(res);

  if (fs.existsSync(DB_PATH)) archive.file(DB_PATH, { name: 'signage.db' });
  if (fs.existsSync(UPLOADS_DIR)) archive.directory(UPLOADS_DIR, 'uploads');

  archive.finalize();
});

// 복원 (zip 업로드 → 파일 교체 후 앱 재시작 필요)
router.post('/restore', authenticateToken, uploadBackup.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '백업 파일을 선택하세요' });

  try {
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();

    let restoredDb = false;
    let restoredFiles = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      if (entry.entryName === 'signage.db') {
        // DB 파일 복원 (임시 파일로 저장 후 앱 재시작 시 교체)
        const tempDbPath = DB_PATH + '.restore';
        fs.writeFileSync(tempDbPath, entry.getData());
        restoredDb = true;
      } else if (entry.entryName.startsWith('uploads/')) {
        const relativePath = entry.entryName.replace('uploads/', '');
        if (!relativePath) continue;
        const destPath = path.join(UPLOADS_DIR, relativePath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, entry.getData());
        restoredFiles++;
      }
    }

    res.json({
      message: '복원 완료. 앱을 재시작하면 DB가 적용됩니다.',
      restoredDb,
      restoredFiles,
    });
  } catch (err) {
    res.status(500).json({ error: '복원 실패: ' + err.message });
  }
});

module.exports = router;
