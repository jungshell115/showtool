import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export { API_BASE };
export default api;
