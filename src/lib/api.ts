import axios from 'axios';

const api = axios.create({
  baseURL: '/api', // same-origin Next.js API routes — no separate backend needed
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export default api;
