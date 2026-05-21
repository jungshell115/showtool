import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api, { API_BASE } from '../api/client';

function SortableItem({ item, onRemove, onDurationChange }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3"
    >
      <button {...attributes} {...listeners} className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
        ⠿
      </button>

      {item.thumbnail ? (
        <img
          src={`${API_BASE}/uploads/thumbnails/${item.thumbnail}`}
          alt={item.name}
          className="w-16 h-9 object-cover rounded"
        />
      ) : (
        <div className="w-16 h-9 bg-gray-100 rounded flex items-center justify-center text-lg">
          {item.type === 'video' ? '🎥' : '🖼️'}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-500">{item.type === 'video' ? '동영상 (자동)' : '이미지'}</p>
      </div>

      {item.type === 'image' && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={item.display_duration}
            onChange={e => onDurationChange(item.id, parseInt(e.target.value) || 5)}
            min="1"
            max="300"
            className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-center"
          />
          <span className="text-xs text-gray-500">초</span>
        </div>
      )}

      <button onClick={() => onRemove(item.id)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
    </div>
  );
}

export default function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const [contents, setContents] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [newName, setNewName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [plRes, cRes] = await Promise.all([
      api.get('/contents/playlists'),
      api.get('/contents'),
    ]);
    setPlaylists(plRes.data);
    setContents(cRes.data);
  }

  function selectPlaylist(pl) {
    setSelectedPlaylist(pl);
    setEditItems(pl.items.map((item, idx) => ({ ...item, id: item.id || idx })));
    setDirty(false);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setEditItems(items => {
        const oldIdx = items.findIndex(i => i.id === active.id);
        const newIdx = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIdx, newIdx);
      });
      setDirty(true);
    }
  }

  function addContent(content) {
    const newItem = {
      id: Date.now(),
      content_id: content.id,
      name: content.name,
      type: content.type,
      filename: content.filename,
      thumbnail: content.thumbnail,
      duration: content.duration,
      display_duration: 5,
      order_index: editItems.length,
    };
    setEditItems(prev => [...prev, newItem]);
    setDirty(true);
  }

  function removeItem(id) {
    setEditItems(prev => prev.filter(i => i.id !== id));
    setDirty(true);
  }

  function changeDuration(id, value) {
    setEditItems(prev => prev.map(i => i.id === id ? { ...i, display_duration: value } : i));
    setDirty(true);
  }

  async function savePlaylist() {
    if (!selectedPlaylist) return;
    setSaving(true);
    try {
      await api.put(`/contents/playlists/${selectedPlaylist.id}`, {
        items: editItems.map(i => ({
          content_id: i.content_id,
          display_duration: i.display_duration || 5,
        }))
      });
      await loadAll();
      setDirty(false);
    } catch (err) {
      alert('저장 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  }

  async function createPlaylist() {
    if (!newName.trim()) return;
    const res = await api.post('/contents/playlists', { name: newName.trim() });
    await loadAll();
    setNewName('');
    setShowNewForm(false);
    selectPlaylist(res.data);
  }

  async function deletePlaylist(pl) {
    if (!confirm(`"${pl.name}" 플레이리스트를 삭제하시겠습니까?`)) return;
    await api.delete(`/contents/playlists/${pl.id}`);
    if (selectedPlaylist?.id === pl.id) {
      setSelectedPlaylist(null);
      setEditItems([]);
    }
    await loadAll();
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-6rem)]">
      {/* 왼쪽: 플레이리스트 목록 */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">플레이리스트</h2>
          <button
            onClick={() => setShowNewForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-sm"
          >
            + 새로 만들기
          </button>
        </div>

        {showNewForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPlaylist()}
              placeholder="플레이리스트 이름"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setShowNewForm(false)} className="flex-1 text-sm text-gray-500 border border-gray-300 rounded py-1">취소</button>
              <button onClick={createPlaylist} className="flex-1 text-sm bg-blue-600 text-white rounded py-1">생성</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2">
          {playlists.map(pl => (
            <div
              key={pl.id}
              onClick={() => selectPlaylist(pl)}
              className={`cursor-pointer rounded-xl border p-3 group transition-colors ${
                selectedPlaylist?.id === pl.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm text-gray-800">{pl.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{pl.items?.length || 0}개 항목</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deletePlaylist(pl); }}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 오른쪽: 편집 영역 */}
      {selectedPlaylist ? (
        <div className="flex-1 flex gap-6 min-w-0 overflow-hidden">
          {/* 플레이리스트 항목 */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800">{selectedPlaylist.name}</h2>
              <button
                onClick={savePlaylist}
                disabled={!dirty || saving}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
              >
                {saving ? '저장 중...' : dirty ? '저장' : '저장됨'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {editItems.length === 0 ? (
                <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8 text-center text-gray-500">
                  <p>오른쪽에서 콘텐츠를 추가하세요</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={editItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {editItems.map(item => (
                        <SortableItem
                          key={item.id}
                          item={item}
                          onRemove={removeItem}
                          onDurationChange={changeDuration}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* 콘텐츠 선택 패널 */}
          <div className="w-64 flex-shrink-0 flex flex-col">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">콘텐츠 추가</h3>
            <div className="flex-1 overflow-y-auto space-y-2">
              {contents.map(c => (
                <button
                  key={c.id}
                  onClick={() => addContent(c)}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg p-2 hover:border-blue-400 transition-colors flex items-center gap-2"
                >
                  {c.thumbnail ? (
                    <img
                      src={`${API_BASE}/uploads/thumbnails/${c.thumbnail}`}
                      alt={c.name}
                      className="w-12 h-7 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-7 bg-gray-100 rounded flex items-center justify-center text-sm">
                      {c.type === 'video' ? '🎥' : '🖼️'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.type === 'video' ? '동영상' : '이미지'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-5xl mb-3">▶️</div>
            <p>플레이리스트를 선택하거나 새로 만드세요</p>
          </div>
        </div>
      )}
    </div>
  );
}
