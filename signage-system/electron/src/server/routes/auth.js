const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

// 로그인
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '사용자명과 비밀번호를 입력하세요' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '사용자명 또는 비밀번호가 올바르지 않습니다' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, username: user.username });
});

// 토큰 검증
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// 비밀번호 변경
router.put('/password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력하세요' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

  res.json({ message: '비밀번호가 변경되었습니다' });
});

module.exports = router;
