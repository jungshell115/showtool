import { useState, useEffect, useRef } from 'react';
import api, { API_BASE } from '../api/client';

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ContentCard({ content, onDelete }) {
  const thumbUrl = content.thumbnail
    ? `${API_BASE}/uploads/thumbnails/${content.thumbnail}`
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
      <div className="relative bg-gray-100 aspect-video">
        {thumbUrl ? (
          <img src={thumbUrl} alt={content.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            {content.type === 'video' ? '🎥' : '🖼️'}
          </div>
        )}
        <div className="absolute top-2 right-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            content.type === 'video'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {content.type === 'video' ? '동영상' : '이미지'}
          </span>
        </div>
      </div>

      <div className="p-3">
        <p className="font-medium text-gray-800 text-sm truncate mb-1">{content.name}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">{formatSize(content.file_size)}</span>
          <div className="flex gap-2">
            <a
              href={`${API_BASE}/uploads/${content.filename}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:text-blue-800 text-xs"
            >
              미리보기
            </a>
            <button
              onClick={() => onDelete(content)}
              className="text-red-500 hover:text-red-700 text-xs"
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Contents() {
  const [contents, setContents] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadContents();
  }, []);

  async function loadContents() {
    const res = await api.get('/contents');
    setContents(res.data);
  }

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name.replace(/\.[^.]+$/, ''));

    setUploading(true);
    setUploadProgress(0);

    try {
      await api.post('/contents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => {
          setUploadProgress(Math.round((e.loaded * 100) / e.total));
        }
      });
      await loadContents();
    } catch (err) {
      alert(err.response?.data?.error || '업로드 실패');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function handleFiles(files) {
    Array.from(files).forEach(uploadFile);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  async function handleDelete(content) {
    if (!confirm(`"${content.name}"을(를) 삭제하시겠습니까?`)) return;
    await api.delete(`/contents/${content.id}`);
    await loadContents();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">콘텐츠 관리</h1>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          <span>⬆️</span> 파일 업로드
        </button>
      </div>

      {/* 드래그 앤 드롭 영역 */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer mb-6 transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
      >
        {uploading ? (
          <div>
            <p className="text-gray-600 mb-3">업로드 중... {uploadProgress}%</p>
            <div className="w-full bg-gray-200 rounded-full h-2 max-w-xs mx-auto">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-2">📁</div>
            <p className="text-gray-600">파일을 드래그하거나 클릭하여 업로드</p>
            <p className="text-sm text-gray-400 mt-1">JPG, PNG, GIF, MP4 · 최대 500MB</p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.gif,.mp4"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      {/* 콘텐츠 그리드 */}
      {contents.length === 0 ? (
        <div className="text-center text-gray-500 py-16">
          <div className="text-5xl mb-3">📭</div>
          <p>업로드된 콘텐츠가 없습니다</p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-500 mb-3">총 {contents.length}개</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {contents.map(c => (
              <ContentCard key={c.id} content={c} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
