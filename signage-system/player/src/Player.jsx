import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;
const FADE_MS = 500;
const POLL_INTERVAL = 30000;

function useDeviceId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('device') || 'tv-a';
}

// One of two rendering slots. Keeps its DOM node alive so videos buffer in background.
function MediaSlot({ item, active, onEnded }) {
  const videoRef = useRef(null);
  const timerRef = useRef(null);

  // Image display timer — only runs when this slot is active
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!item || item.type !== 'image' || !active) return;
    timerRef.current = setTimeout(onEnded, (item.display_duration || 5) * 1000);
    return () => clearTimeout(timerRef.current);
  }, [active, item?.id, item?.display_duration, onEnded]);

  // Video play/pause — when inactive, video pauses but stays buffered in DOM
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !item || item.type !== 'video') return;
    if (active) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active, item?.filename]);

  if (!item) return null;
  const src = `${API_BASE}/uploads/${item.filename}`;

  if (item.type === 'image') {
    return (
      <img
        src={src}
        alt=""
        className="w-full h-full object-contain"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      src={src}
      preload="auto"
      muted
      playsInline
      className="w-full h-full object-contain"
      onEnded={active ? onEnded : undefined}
      style={{ userSelect: 'none', pointerEvents: 'none' }}
    />
  );
}

export default function Player() {
  const deviceId = useDeviceId();
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState('연결 중...');

  // Double-buffer: two slots alternate between current and preloading-next
  const [slotData, setSlotData] = useState([null, null]);
  const [slotActive, setSlotActive] = useState([false, false]);
  const [slotOpacity, setSlotOpacity] = useState([0, 0]);

  const [emergency, setEmergency] = useState(null);
  const [emergencyFade, setEmergencyFade] = useState(false);

  const socketRef = useRef(null);
  const heartbeatRef = useRef(null);
  const transitionRef = useRef(false);
  const curSlotRef = useRef(0);
  const itemsRef = useRef([]);
  const currentIndexRef = useRef(0);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const sendHeartbeat = useCallback((name) => {
    fetch(`${API_BASE}/api/devices/${deviceId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_content: name }),
    }).catch(() => {});
  }, [deviceId]);

  function startPlayback(newItems) {
    if (!newItems?.length) {
      setStatus('콘텐츠 없음');
      setItems([]);
      setSlotData([null, null]);
      setSlotActive([false, false]);
      setSlotOpacity([0, 0]);
      return;
    }

    itemsRef.current = newItems;
    currentIndexRef.current = 0;
    curSlotRef.current = 0;
    transitionRef.current = false;

    setItems(newItems);
    setCurrentIndex(0);
    setStatus('재생 중');
    // Slot 0 = item[0], Slot 1 = item[1] pre-buffered (ready for instant switch)
    setSlotData([newItems[0], newItems.length > 1 ? newItems[1] : newItems[0]]);
    setSlotActive([false, false]);
    setSlotOpacity([0, 0]);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      setSlotActive([true, false]);
      setSlotOpacity([1, 0]);
    }));
  }

  async function fetchSchedule() {
    try {
      const res = await fetch(`${API_BASE}/api/schedules/current/${deviceId}`);
      const data = await res.json();
      startPlayback(data.items);
    } catch {
      setStatus('서버 연결 오류');
    }
  }

  useEffect(() => {
    fetchSchedule();
    const poll = setInterval(fetchSchedule, POLL_INTERVAL);

    const socket = io(API_BASE, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('register', { deviceId }));
    socket.on('schedule-update', ({ deviceId: d }) => {
      if (d === deviceId) fetchSchedule();
    });
    socket.on('emergency', (notice) => {
      setEmergencyFade(false);
      setTimeout(() => { setEmergency(notice); setEmergencyFade(true); }, 50);
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

    return () => { clearInterval(poll); socket.disconnect(); };
  }, [deviceId]);

  useEffect(() => {
    if (!items.length) return;
    const item = items[currentIndex];
    if (!item) return;
    sendHeartbeat(item.name);
    socketRef.current?.emit('now-playing', { deviceId, contentName: item.name });
    clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => sendHeartbeat(item.name), 15000);
    return () => clearInterval(heartbeatRef.current);
  }, [currentIndex, items, deviceId, sendHeartbeat]);

  const handleEnded = useCallback(() => {
    if (transitionRef.current) return;
    const its = itemsRef.current;
    if (!its.length) return;
    transitionRef.current = true;

    const curIdx = currentIndexRef.current;
    const nextIdx = (curIdx + 1) % its.length;
    const afterNextIdx = (nextIdx + 1) % its.length;
    const curSlot = curSlotRef.current;
    const nextSlot = 1 - curSlot;

    // Activate next slot immediately (video starts playing / image timer starts)
    const newActive = [false, false];
    newActive[nextSlot] = true;
    setSlotActive(newActive);

    // Crossfade: current out, next in
    const newOpacity = [0, 0];
    newOpacity[nextSlot] = 1;
    setSlotOpacity(newOpacity);

    setTimeout(() => {
      curSlotRef.current = nextSlot;
      currentIndexRef.current = nextIdx;
      setCurrentIndex(nextIdx);
      // Load after-next item into the now-idle old slot so it buffers silently
      setSlotData(prev => {
        const d = [...prev];
        d[curSlot] = its[afterNextIdx];
        return d;
      });
      transitionRef.current = false;
    }, FADE_MS);
  }, []);

  return (
    <div className="relative bg-black overflow-hidden" style={{ width: '100vw', height: '100vh' }}>

      {items.length > 0 ? (
        [0, 1].map(slot => (
          <div
            key={slot}
            className="absolute inset-0"
            style={{
              opacity: slotOpacity[slot],
              transition: `opacity ${FADE_MS}ms ease-in-out`,
              zIndex: slotActive[slot] ? 1 : 0,
            }}
          >
            {slotData[slot] && (
              <MediaSlot
                item={slotData[slot]}
                active={slotActive[slot]}
                onEnded={handleEnded}
              />
            )}
          </div>
        ))
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-white text-6xl mb-4">📺</div>
          <p className="text-white text-xl opacity-70">{status}</p>
          <p className="text-gray-500 text-sm mt-2">{deviceId}</p>
        </div>
      )}

      {emergency && (
        <div
          className="absolute inset-0 z-50"
          style={{ opacity: emergencyFade ? 1 : 0, transition: 'opacity 500ms ease-in-out' }}
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

      {import.meta.env.DEV && (
        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
          {deviceId} · {items.length > 0 ? `${currentIndex + 1}/${items.length}` : '대기'} · {status}
        </div>
      )}
    </div>
  );
}
