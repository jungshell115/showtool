import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import api, { API_BASE } from '../api/client';

const SOCKET_URL = API_BASE;

function DeviceCard({ device, onlineStatus, nowPlaying }) {
  const isOnline = onlineStatus[device.id];
  const playing = nowPlaying[device.id];

  const aspectLabel = device.aspect_ratio === '16:9' ? '가로형' : '세로형';

  return (
    <div className={`bg-white rounded-xl border-2 p-5 transition-all ${isOnline ? 'border-green-400' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-800">{device.name}</h3>
          <span className="text-xs text-gray-500">{device.id} · {aspectLabel}</span>
        </div>
        <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
          isOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          {isOnline ? '온라인' : '오프라인'}
        </span>
      </div>

      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs text-gray-500 mb-1">현재 재생 중</p>
        <p className="text-sm font-medium text-gray-700 truncate">
          {playing || (isOnline ? '대기 중' : '—')}
        </p>
      </div>

      {device.last_seen && (
        <p className="text-xs text-gray-400 mt-2">
          마지막 접속: {new Date(device.last_seen).toLocaleString('ko-KR')}
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [devices, setDevices] = useState([]);
  const [contents, setContents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [onlineStatus, setOnlineStatus] = useState({});
  const [nowPlaying, setNowPlaying] = useState({});
  const [showEmergencyForm, setShowEmergencyForm] = useState(false);
  const [emergencyForm, setEmergencyForm] = useState({ content_id: '', target_devices: 'all' });
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    loadData();

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.emit('register-admin');

    socket.on('device-status', ({ deviceId, contentName }) => {
      setOnlineStatus(prev => ({ ...prev, [deviceId]: true }));
      setNowPlaying(prev => ({ ...prev, [deviceId]: contentName }));
    });

    socket.on('device-offline', ({ deviceId }) => {
      setOnlineStatus(prev => ({ ...prev, [deviceId]: false }));
    });

    socket.on('emergency-pushed', () => {
      loadNotices();
    });

    socket.on('emergency-cancelled', () => {
      loadNotices();
    });

    return () => socket.disconnect();
  }, []);

  async function loadData() {
    const [devRes, contRes] = await Promise.all([
      api.get('/devices'),
      api.get('/contents'),
    ]);
    setDevices(devRes.data);
    setContents(contRes.data);
    await loadNotices();
  }

  async function loadNotices() {
    const res = await api.get('/devices/emergency');
    setNotices(res.data);
  }

  async function pushEmergency() {
    if (!emergencyForm.content_id) return;
    setLoading(true);
    try {
      const payload = {
        content_id: parseInt(emergencyForm.content_id),
        target_devices: emergencyForm.target_devices === 'all'
          ? 'all'
          : emergencyForm.target_devices.split(',').filter(Boolean)
      };
      await api.post('/devices/emergency-push', payload);
      setShowEmergencyForm(false);
      setEmergencyForm({ content_id: '', target_devices: 'all' });
      await loadNotices();
    } catch (err) {
      alert(err.response?.data?.error || '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  async function cancelNotice(id) {
    await api.delete(`/devices/emergency-cancel/${id}`);
    await loadNotices();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">실시간 모니터링</h1>
        <button
          onClick={() => setShowEmergencyForm(true)}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          <span>🚨</span> 긴급 공지 푸시
        </button>
      </div>

      {/* 디바이스 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {devices.map(device => (
          <DeviceCard
            key={device.id}
            device={device}
            onlineStatus={onlineStatus}
            nowPlaying={nowPlaying}
          />
        ))}
      </div>

      {/* 활성 긴급 공지 */}
      {notices.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">활성 긴급 공지</h2>
          <div className="space-y-2">
            {notices.map(notice => (
              <div key={notice.id} className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🚨</span>
                  <div>
                    <p className="font-medium text-red-800">{notice.content_name}</p>
                    <p className="text-sm text-red-600">
                      대상: {notice.target_devices === 'all' ? '전체 디바이스' : notice.target_devices} · {' '}
                      {new Date(notice.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => cancelNotice(notice.id)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm"
                >
                  해제
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 긴급 공지 폼 모달 */}
      {showEmergencyForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span>🚨</span> 긴급 공지 설정
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">콘텐츠 선택</label>
                <select
                  value={emergencyForm.content_id}
                  onChange={e => setEmergencyForm(prev => ({ ...prev, content_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">콘텐츠 선택...</option>
                  {contents.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">대상 디바이스</label>
                <div className="space-y-2">
                  {[
                    { value: 'all', label: '전체 디바이스' },
                    ...devices.map(d => ({ value: d.id, label: d.name }))
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="target"
                        value={opt.value}
                        checked={emergencyForm.target_devices === opt.value}
                        onChange={e => setEmergencyForm(prev => ({ ...prev, target_devices: e.target.value }))}
                        className="text-red-600"
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEmergencyForm(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={pushEmergency}
                disabled={!emergencyForm.content_id || loading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white py-2 rounded-lg text-sm font-medium"
              >
                {loading ? '전송 중...' : '즉시 푸시'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
