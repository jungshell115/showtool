import { NavLink, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/', label: '대시보드', icon: '📊' },
  { to: '/contents', label: '콘텐츠', icon: '🖼️' },
  { to: '/playlists', label: '플레이리스트', icon: '▶️' },
  { to: '/schedule', label: '스케줄', icon: '📅' },
];

export default function Layout({ children }) {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem('token');
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* 사이드바 */}
      <aside className="w-60 bg-gray-900 text-white flex flex-col fixed h-full z-10">
        <div className="p-5 border-b border-gray-700">
          <div className="text-lg font-bold flex items-center gap-2">
            <span className="text-2xl">📺</span>
            <span>사이니지 시스템</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <span>🚪</span>
            로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="ml-60 flex-1 p-6 min-h-screen">
        {children}
      </main>
    </div>
  );
}
