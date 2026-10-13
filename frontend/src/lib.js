export const API = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';
export const STATION = import.meta.env.VITE_STATION_CODE || 'LOCAL-01';

export const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };

// ---- Super admin session (kept per browser tab; closing the tab logs out) ----
const TOKEN_KEY = 'admin_token';
export const getAdminToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};
export const setAdminToken = (t) => {
  try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

// fetch() with the admin bearer token attached.
export const adminFetch = (path, opts = {}) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { Accept: 'application/json', ...(opts.headers || {}), Authorization: `Bearer ${getAdminToken()}` },
  });
