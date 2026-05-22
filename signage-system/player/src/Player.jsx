import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// 프로덕션: window.location.origin → TV가 192.168.x.x:4000으로 접속해도 자동 인식
const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;
const POLL_INTERVAL = 30000;

function useDeviceId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('device') || 'tv-a';
}

function MediaItem({ item, onEnded, isActive }) {
  const videoRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isActive) return;

    if (item.type === 'image') {
      const duration = (item.display_duration || 5) * 1000;
      timerRef.current = setTimeout(onEnded, duration);
      return () => clearTimeout(timerRef.current);
    }

    if (item.type === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [isActive, item]);

  const src = `${API_BASE}/uploads/${item.filename}`;

  if (item.type === 'image') {
    return (
      <img
        src={src}
        alt={item.name}
        className="w-full h-full object-contain"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      src={src}
      className="w-full h-full object-contain"
      muted
      playsInline
      onEnded={onEnded}
      style={{ userSelect: 'none', pointerEvents: 'none' }}
    />
  );
}

const FADE_MS = 600;

export default function Player() {
  const deviceId = useDeviceId();
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState(false);
  const [emergency, setEmergency] = useState(null);
  const [emergencyFade, setEmergencyFade] = useState(false);
  const [status, setStatus] = useState('연결 중...');
  const socketRef = useRef(null);
  const heartbeatRef = useRef(null);

  const sendHeartbeat = useCallback((contentName) => {
    fetch(`${API_BASE}/api/devices/${deviceId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_content: contentName }),
    }).catch(() => {});
  }, [deviceId]);

  async function fetchSchedule() {
    try {
      const res = await fetch(`${API_BASE}/api/schedules/current/${deviceId}`);
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        setItems(data.items);
        setStatus('재생 중');
        setFade(true);
      } else {
        setStatus('콘텐츠 없음');
      }
    } catch {
      setStatus('서버 연결 오류');
    }
  }

  useEffect(() => {
    fetchSchedule();

    const pollTimer = setInterval(fetchSchedule, POLL_INTERVAL);

    // Socket.io 연결
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('register', { deviceId });
    });

    socket.on('emergency', (notice) => {
      setEmergencyFade(false);
      setTimeout(() => {
        setEmergency(notice);
        setEmergencyFade(true);
      }, 50);
    });

    socket.on('emergency-cancel', ({ id }) => {
      setEmergency(prev => {
        if (prev?.id === id) {
          setEmergencyFade(false);
          setTimeout(() => setEmergency(null), 500);
        }
        return prev;
      });
    });

    return () => {
      clearInterval(pollTimer);
      socket.disconnect();
    };
  }, [deviceId]);

  // 현재 항목 추적 및 heartbeat
  useEffect(() => {
    if (items.length === 0) return;
    const current = items[currentIndex];
    if (!current) return;

    sendHeartbeat(current.name);

    if (socketRef.current) {
      socketRef.current.emit('now-playing', {
        deviceId,
        contentName: current.name,
      });
    }

    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      sendHeartbeat(current.name);
    }, 15000);

    return () => clearInterval(heartbeatRef.current);
  }, [currentIndex, items, deviceId, sendHeartbeat]);

  function handleEnded() {
    if (items.length === 0) return;
    setFade(false);
    setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % items.length);
      requestAnimationFrame(() => requestAnimationFrame(() => setFade(true)));
    }, FADE_MS);
  }

  const current = items[currentIndex];

  return (
    <div
      className="relative bg-black overflow-hidden"
      style={{ width: '100vw', height: '100vh' }}
    >
      {/* 메인 플레이어 */}
      {current ? (
        <div
          className="absolute inset-0"
          style={{
            opacity: fade ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease-in-out`,
          }}
        >
          <MediaItem
            key={`${current.id}-${currentIndex}`}
            item={current}
            onEnded={handleEnded}
            isActive={fade}
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-white text-6xl mb-4">📺</div>
          <p className="text-white text-xl opacity-70">{status}</p>
          <p className="text-gray-500 text-sm mt-2">{deviceId}</p>
        </div>
      )}

      {/* 긴급 공지 오버레이 */}
      {emergency && (
        <div
          className="absolute inset-0 z-50 transition-opacity duration-500"
          style={{ opacity: emergencyFade ? 1 : 0 }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-0 flex items-center justify-center">
            {emergency.content_type === 'image' ? (
              <img
                src={`${API_BASE}/uploads/${emergency.filename}`}
                alt={emergency.content_name}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <video
                src={`${API_BASE}/uploads/${emergency.filename}`}
                className="max-w-full max-h-full object-contain"
                autoPlay
                muted
                loop
                playsInline
              />
            )}
          </div>

          <div className="absolute top-4 left-4 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg">
            <span className="animate-pulse">🚨</span>
            긴급 공지
          </div>
        </div>
      )}

      {/* 디바이스 정보 (개발용) */}
      {import.meta.env.DEV && (
        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
          {deviceId} · {items.length > 0 ? `${currentIndex + 1}/${items.length}` : '대기'} · {status}
        </div>
      )}
    </div>
  );
}
