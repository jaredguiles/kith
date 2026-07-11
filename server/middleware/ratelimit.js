'use strict';

// Lightweight in-memory sliding-window rate limiter (audit L4). No deps.
//
// Per-IP request timestamps in a rolling 60s window. Applied to /api with a
// generous default; auth endpoints get a stricter budget (login brute-force
// is additionally covered by the per-username throttle in middleware/auth.js).
//
// Config: RATE_LIMIT_PER_MIN (default 600; 0 disables the limiter entirely),
// RATE_LIMIT_AUTH_PER_MIN (default 30). Single-process app → in-memory is fine.

const WINDOW_MS = 60 * 1000;
const SWEEP_MS = 5 * 60 * 1000; // drop idle IP buckets periodically

/**
 * Create an Express middleware limiting each IP to `max` requests per minute.
 * `max` <= 0 returns a pass-through (disabled).
 */
function rateLimiter(max) {
  if (!Number.isFinite(max) || max <= 0) return (req, res, next) => next();

  const hits = new Map(); // ip → number[] (timestamps within window)

  const sweep = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [ip, stamps] of hits) {
      if (!stamps.length || stamps[stamps.length - 1] < cutoff) hits.delete(ip);
    }
  }, SWEEP_MS);
  sweep.unref(); // never keep the process alive

  return (req, res, next) => {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    let stamps = hits.get(req.ip);
    if (!stamps) { stamps = []; hits.set(req.ip, stamps); }
    // drop expired entries (stamps are appended in order → shift from front)
    while (stamps.length && stamps[0] < cutoff) stamps.shift();
    if (stamps.length >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((stamps[0] + WINDOW_MS - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Too many requests — slow down' });
    }
    stamps.push(now);
    next();
  };
}

module.exports = { rateLimiter };
