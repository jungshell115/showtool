import { useState } from 'react';
import api, { API_BASE } from '../api/client';

export default function Settings() {
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState(null);

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleBackup() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/backup`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('백업 실패');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signage-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showMsg('백업 파일이 다운로드됐습니다.');
    } catch (err) {
      showMsg('백업 실패: ' + err.message, 'error');
    }
  }

  async function handleRestore() {
    if (!restoreFile) return showMsg('복원할 파일을 선택하세요.', 'error');

    const confirm = window.confirm(
      '복원하면 현재 데이터(콘텐츠, 스케줄 등)가 백업 파일로 교체됩니다.\n계속하시겠습니까?'
    );
    if (!confirm) return;

    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append('backup', restoreFile);
      const res = await api.post('/backup/restore', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showMsg(res.data.message + ' (앱을 재시작하세요)');
    } catch (err) {
      showMsg('복원 실패: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">설정</h1>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          msg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {msg.text}
        </div>
      )}

      {/* 백업 / 복원 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">데이터 백업 / 복원</h2>
        <p className="text-sm text-gray-500 mb-5">
          콘텐츠 파일과 DB(스케줄, 플레이리스트 등)를 ZIP으로 백업하거나 복원합니다.
        </p>

        <div className="flex gap-3 mb-6">
          <button
            onClick={handleBackup}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            ⬇ 백업 다운로드
          </button>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <p className="text-sm font-medium text-gray-700 mb-2">복원</p>
          <div className="flex gap-3 items-center">
            <input
              type="file"
              accept=".zip"
              onChange={e => setRestoreFile(e.target.files[0])}
              className="text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            />
            <button
              onClick={handleRestore}
              disabled={!restoreFile || restoring}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {restoring ? '복원 중...' : '복원 실행'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            복원 후 앱을 재시작해야 DB 변경이 적용됩니다.
          </p>
        </div>
      </div>

      {/* 서버 공유 안내 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">다른 PC와 데이터 공유</h2>
        <p className="text-sm text-gray-500 mb-4">
          여러 PC에서 동일한 데이터를 관리하려면 트레이 아이콘 → <strong>⚙️ 서버 연결 설정</strong>에서 원격 서버 주소를 입력하세요.
        </p>
        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 space-y-2">
          <div className="flex gap-2">
            <span className="font-medium w-20 shrink-0">주 서버 PC</span>
            <span>로컬 서버 모드로 실행 (기본값)</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium w-20 shrink-0">보조 PC</span>
            <span>트레이 → 서버 연결 설정 → 주 서버 IP:4000 입력</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium w-20 shrink-0">TV 플레이어</span>
            <span>브라우저에서 주 서버 IP:4000/player?device=tv-a 접속</span>
          </div>
        </div>
      </div>
    </div>
  );
}
