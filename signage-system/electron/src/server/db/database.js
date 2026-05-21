const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'signage.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      thumbnail TEXT,
      duration INTEGER,
      file_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
      content_id INTEGER REFERENCES contents(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      display_duration INTEGER DEFAULT 5
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      last_seen DATETIME,
      current_content TEXT
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT REFERENCES devices(id),
      playlist_id INTEGER REFERENCES playlists(id),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      repeat_type TEXT DEFAULT 'daily',
      repeat_days TEXT,
      date_from DATE,
      date_to DATE,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emergency_notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER REFERENCES contents(id),
      target_devices TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 기본 디바이스 등록
  const insertDevice = db.prepare(`
    INSERT OR IGNORE INTO devices (id, name, aspect_ratio) VALUES (?, ?, ?)
  `);
  insertDevice.run('tv-a', 'TV-A (1층 좌측)', '16:9');
  insertDevice.run('tv-b', 'TV-B (1층 우측)', '16:9');
  insertDevice.run('kiosk', '키오스크', '9:16');

  // 기본 관리자 계정 생성
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin1234', 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
    console.log('기본 관리자 계정 생성: admin / admin1234');
  }

  // 기본 플레이리스트 생성
  const defaultPlaylist = db.prepare("SELECT id FROM playlists WHERE name = '기본 플레이리스트'").get();
  if (!defaultPlaylist) {
    db.prepare("INSERT INTO playlists (name) VALUES ('기본 플레이리스트')").run();
  }

  console.log('DB 초기화 완료');
}

module.exports = { getDb, initDb };
