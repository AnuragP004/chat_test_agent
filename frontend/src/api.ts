import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
});

// Simple local token store for test purposes
let currentToken = localStorage.getItem('token') || '';

if (currentToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${currentToken}`;
}

export const setToken = (token: string) => {
  currentToken = token;
  localStorage.setItem('token', token);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const clearToken = () => {
  currentToken = '';
  localStorage.removeItem('token');
  delete api.defaults.headers.common['Authorization'];
};

export default api;
