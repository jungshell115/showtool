import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Contents from './pages/Contents';
import Playlists from './pages/Playlists';
import Schedule from './pages/Schedule';
import Settings from './pages/Settings';
import Layout from './components/Layout';

function RequireAuth({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AdminApp() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/contents" element={<Contents />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <RequireAuth>
            <AdminApp />
          </RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  );
}
