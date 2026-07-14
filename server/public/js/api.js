// API client — fetch wrappers. Auth via httpOnly cookie (set by the server);
// a Bearer token fallback is kept in memory only.

let memToken = null;

const RELOAD_FLAG = 'kith_401_reloaded';

export function setToken(t) { memToken = t; }

async function request(method, url, body) {
  const headers = {};
  if (memToken) headers['Authorization'] = `Bearer ${memToken}`;
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) data = await res.json().catch(() => null);

  if (res.ok) {
    // Any successful request proves the session is valid again — reset the
    // one-shot reload guard so a future expiry can trigger a fresh reload.
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* storage unavailable */ }
  } else if (res.status === 401 && !url.startsWith('/api/auth') && !url.startsWith('/api/preferences/spicy-pin')) {
    // Session expired mid-app (tokens invalidated server-side, cookie gone…).
    // Clear client auth state and force a reboot: boot() routes to the login
    // screen on 401. A sessionStorage flag prevents reload loops; /api/auth/*
    // is excluded so the login page's own failures never reload, and the
    // spicy-pin verify endpoint is excluded because it 401s on a wrong PIN.
    memToken = null;
    let alreadyReloaded;
    try {
      alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
      if (!alreadyReloaded) sessionStorage.setItem(RELOAD_FLAG, '1');
    } catch { alreadyReloaded = true; /* no storage → don't risk a loop */ }
    if (!alreadyReloaded) location.reload();
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url, body) => request('DELETE', url, body),
};

export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
