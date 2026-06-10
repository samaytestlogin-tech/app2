import { io } from 'socket.io-client';

const BACKEND_URL = 
  (import.meta.env.VITE_BACKEND_URL as string) ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin);

export const socket = io(BACKEND_URL, {
  autoConnect: false, // Connected once user establishes profile
});

export const getUploadUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
};

export { BACKEND_URL };
