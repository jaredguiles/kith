'use strict';

// Web Push (VAPID) subscription management + test send. Mounted at /api/push.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth } = require('../middleware/auth');
const { getVapidKeys, sendPushToUser } = require('../lib/notify');

const router = express.Router();
router.use(requireAuth);

// GET /api/push/key → { publicKey }
router.get('/key', async (req, res, next) => {
  try {
    const { publicKey } = await getVapidKeys();
    res.json({ publicKey });
  } catch (err) { next(err); }
});

// POST /api/push/subscribe { subscription:{endpoint,keys:{p256dh,auth}}, user_agent? }
router.post('/subscribe', async (req, res, next) => {
  try {
    const { subscription, user_agent } = req.body || {};
    const endpoint = subscription && subscription.endpoint;
    const p256dh = subscription && subscription.keys && subscription.keys.p256dh;
    const auth = subscription && subscription.keys && subscription.keys.auth;
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: 'subscription.endpoint and keys.p256dh/auth are required' });
    }
    if (String(endpoint).length > 500) {
      return res.status(400).json({ error: 'endpoint too long' });
    }
    const ua = user_agent ? String(user_agent).slice(0, 255) : (req.headers['user-agent'] || '').slice(0, 255) || null;

    // Upsert on endpoint (dedupe); reassign to the current user if it moved.
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh),
         auth = VALUES(auth), user_agent = VALUES(user_agent), last_used_at = NOW()`,
      [req.user.id, String(endpoint), String(p256dh).slice(0, 255), String(auth).slice(0, 255), ua]
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/push/unsubscribe { endpoint }
router.post('/unsubscribe', async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    await query('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [String(endpoint), req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/push/test → send a test push to the current user
router.post('/test', async (req, res, next) => {
  try {
    const sent = await sendPushToUser(req.user.id, {
      title: 'Kith test notification',
      body: 'Push notifications are working. 🎉',
      url: require('../lib/notify').APP_URL,
    });
    res.json({ ok: true, sent });
  } catch (err) { next(err); }
});

module.exports = router;
