import { io } from 'socket.io-client';

const getBackendUrl = () => {
  const cached = localStorage.getItem('custom_backend_url');
  if (cached) {
    return cached;
  }
  
  const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor;
  const isLocal = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL as string;
  }

  // If running on a native device (Capacitor) or in production, default to Render URL
  if (isCapacitor || !isLocal) {
    return 'https://app2-w7h9.onrender.com';
  }

  return 'http://localhost:3000';
};

const BACKEND_URL = getBackendUrl();

export const socket = io(BACKEND_URL, {
  autoConnect: false, // Connected once user establishes profile
});

export const getUploadUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
};

export { BACKEND_URL };
