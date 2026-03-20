import axios from 'axios';

const API_URL = 'http://localhost:3002/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor: attach token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('erp_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor: handle 401
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Don't auto-logout on login endpoint failures
            const url = error.config?.url || '';
            if (!url.includes('/auth/login')) {
                localStorage.removeItem('erp_token');
                window.location.reload();
            }
        }
        return Promise.reject(error);
    }
);

export default api;
