import { useState, useEffect } from 'react';
import api from '../api/client';

const DAYS = [
  { key: 'MON', label: '월' },
  { key: 'TUE', label: '화' },
  { key: 'WED', label: '수' },
  { key: 'THU', label: '목' },
  { key: 'FRI', label: '금' },
  { key: 'SAT', label: '토' },
  { key: 'SUN', label: '일' },
];

const REPEAT_TYPES = [
  { value: 'daily', label: '매일' },
  { value: 'weekdays', label: '평일(월~금)' },
  { value: 'weekends', label: '주말(토~일)' },
  { value: 'custom', label: '사용자 지정' },
];

const defaultForm = {
  device_id: 'tv-a',
  playlist_id: '',
  start_time: '09:00',
  end_time: '18:00',
  repeat_type: 'daily',
  repeat_days: [],
  date_from: '',
  date_to: '',
};

function ScheduleRow({ schedule, onToggle, onDelete }) {
  const repeatLabel = REPEAT_TYPES.find(r => r.value === schedule.repeat_type)?.label || '';
  let repeatDetail = '';
  if (schedule.repeat_type === 'custom' && schedule.repeat_days) {
    try {
      const days = JSON.parse(schedule.repeat_days);
      repeatDetail = days.map(d => DAYS.find(x => x.key === d)?.label).join(', ');
    } catch {}
  }

  return (
    <tr className={`border-b border-gray-100 ${!schedule.is_active ? 'opacity-50' : ''}`}>
      <td className="py-3 px-4">
        <span className="text-sm font-medium text-gray-700">{schedule.device_name}</span>
      </td>
      <td className="py-3 px-4">
        <span className="text-sm text-gray-600">{schedule.playlist_name}</span>
      </td>
      <td className="py-3 px-4">
        <span className="font-mono text-sm text-gray-700">{schedule.start_time} ~ {schedule.end_time}</span>
      </td>
      <td className="py-3 px-4">
        <div className="text-sm text-gray-600">
          {repeatLabel}
          {repeatDetail && <span className="ml-1 text-xs text-gray-400">({repeatDetail})</span>}
          {schedule.date_from && <div className="text-xs text-gray-400">{schedule.date_from} ~ {schedule.date_to || '∞'}</div>}
        </div>
      </td>
      <td className="py-3 px-4">
        <button
          onClick={() => onToggle(schedule)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            schedule.is_active ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
            schedule.is_active ? 'translate-x-5' : 'translate-x-1'
          }`} />
        </button>
      </td>
      <td className="py-3 px-4">
        <button
          onClick={() => onDelete(schedule)}
          className="text-red-400 hover:text-red-600 text-sm"
        >
          삭제
        </button>
      </td>
    </tr>
  );
}

export default function Schedule() {
  const [schedules, setSchedules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [filterDevice, setFilterDevice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [schRes, devRes, plRes] = await Promise.all([
      api.get('/schedules'),
      api.get('/devices'),
      api.get('/contents/playlists'),
    ]);
    setSchedules(schRes.data);
    setDevices(devRes.data);
    setPlaylists(plRes.data);
  }

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function toggleDay(day) {
    setForm(prev => ({
      ...prev,
      repeat_days: prev.repeat_days.includes(day)
        ? prev.repeat_days.filter(d => d !== day)
        : [...prev.repeat_days, day]
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.playlist_id) return alert('플레이리스트를 선택하세요');

    setSaving(true);
    try {
      await api.post('/schedules', {
        ...form,
        playlist_id: parseInt(form.playlist_id),
        repeat_days: form.repeat_type === 'custom' ? form.repeat_days : undefined,
        date_from: form.date_from || undefined,
        date_to: form.date_to || undefined,
      });
      await loadAll();
      setShowForm(false);
      setForm(defaultForm);
    } catch (err) {
      alert('저장 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(schedule) {
    await api.put(`/schedules/${schedule.id}`, { is_active: !schedule.is_active });
    await loadAll();
  }

  async function handleDelete(schedule) {
    if (!confirm('이 스케줄을 삭제하시겠습니까?')) return;
    await api.delete(`/schedules/${schedule.id}`);
    await loadAll();
  }

  const filtered = filterDevice
    ? schedules.filter(s => s.device_id === filterDevice)
    : schedules;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">스케줄 관리</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          + 스케줄 추가
        </button>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilterDevice('')}
          className={`px-3 py-1.5 rounded-lg text-sm ${!filterDevice ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
        >
          전체
        </button>
        {devices.map(d => (
          <button
            key={d.id}
            onClick={() => setFilterDevice(d.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filterDevice === d.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
          >
            {d.name}
          </button>
        ))}
      </div>

      {/* 스케줄 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-3">📅</div>
            <p>등록된 스케줄이 없습니다</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">디바이스</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">플레이리스트</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">시간</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">반복</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">활성</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <ScheduleRow key={s.id} schedule={s} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 스케줄 추가 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-4">스케줄 추가</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">디바이스</label>
                <select
                  value={form.device_id}
                  onChange={e => setField('device_id', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">플레이리스트</label>
                <select
                  value={form.playlist_id}
                  onChange={e => setField('playlist_id', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">플레이리스트 선택...</option>
                  {playlists.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">시작 시간</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={e => setField('start_time', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">종료 시간</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={e => setField('end_time', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">반복 설정</label>
                <select
                  value={form.repeat_type}
                  onChange={e => setField('repeat_type', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {REPEAT_TYPES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {form.repeat_type === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">요일 선택</label>
                  <div className="flex gap-2 flex-wrap">
                    {DAYS.map(d => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleDay(d.key)}
                        className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                          form.repeat_days.includes(d.key)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">시작 날짜 (선택)</label>
                  <input
                    type="date"
                    value={form.date_from}
                    onChange={e => setField('date_from', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">종료 날짜 (선택)</label>
                  <input
                    type="date"
                    value={form.date_to}
                    onChange={e => setField('date_to', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg text-sm font-medium"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
