'use strict';

// Delivery layer for notifications: email (SMTP or n8n webhook) + Web Push.
// This module NEVER throws to callers — every send path logs and continues so
// scheduler jobs and app events can't be crashed by a flaky transport.

const nodemailer = require('nodemailer');
const webpush = require('web-push');
const { query } = require('../database/connection');

// ---------------------------------------------------------------------------
// Config (read once at module load; all optional)
// ---------------------------------------------------------------------------
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_SECURE = String(process.env.SMTP_SECURE) === 'true';
const SMTP_FROM = process.env.SMTP_FROM || 'Kith <kith@example.com>';
const N8N_NOTIFY_WEBHOOK = process.env.N8N_NOTIFY_WEBHOOK || '';
const APP_URL = process.env.APP_URL || 'https://kith.example.com';

// Extract a bare email address from a "Name <addr@host>" style From header.
function fromEmailAddress() {
  const m = String(SMTP_FROM).match(/<([^>]+)>/);
  if (m) return m[1].trim();
  const trimmed = String(SMTP_FROM).trim();
  return /@/.test(trimmed) ? trimmed : 'admin@example.com';
}

// ---------------------------------------------------------------------------
// VAPID keys — generated once at boot if absent, persisted in app_settings.
// ---------------------------------------------------------------------------
let vapidCache = null; // { publicKey, privateKey }
let vapidConfigured = false;

async function getVapidKeys() {
  if (vapidCache) {
    ensureVapidDetails();
    return vapidCache;
  }
  const rows = await query(
    "SELECT `key`, value FROM app_settings WHERE `key` IN ('vapid_public_key','vapid_private_key')"
  );
  const map = {};
  for (const r of rows) {
    try { map[r.key] = JSON.parse(r.value); } catch { map[r.key] = r.value; }
  }
  let publicKey = map.vapid_public_key;
  let privateKey = map.vapid_private_key;

  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    await query(
      "INSERT INTO app_settings (`key`, value, type) VALUES (?, ?, 'string') " +
        'ON DUPLICATE KEY UPDATE value = VALUES(value)',
      ['vapid_public_key', JSON.stringify(publicKey)]
    );
    await query(
      "INSERT INTO app_settings (`key`, value, type) VALUES (?, ?, 'string') " +
        'ON DUPLICATE KEY UPDATE value = VALUES(value)',
      ['vapid_private_key', JSON.stringify(privateKey)]
    );
    console.log('[notify] generated and persisted new VAPID keypair');
  }

  vapidCache = { publicKey, privateKey };
  ensureVapidDetails();
  return vapidCache;
}

function ensureVapidDetails() {
  if (vapidConfigured || !vapidCache) return;
  try {
    webpush.setVapidDetails(`mailto:${fromEmailAddress()}`, vapidCache.publicKey, vapidCache.privateKey);
    vapidConfigured = true;
  } catch (err) {
    console.error('[notify] setVapidDetails failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Email transport — created once, reused.
// ---------------------------------------------------------------------------
let transport = null;
function getTransport() {
  if (transport) return transport;
  if (!SMTP_HOST) return null;
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transport;
}

/**
 * Send an email. Prefers an n8n webhook if configured, else direct SMTP, else
 * logs and skips. Never throws.
 */
async function sendEmail({ to, subject, html, text }) {
  if (!to) return;
  try {
    if (N8N_NOTIFY_WEBHOOK) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      try {
        await fetch(N8N_NOTIFY_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, subject, html, text }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
      return;
    }
    const tp = getTransport();
    if (!tp) {
      console.log('[notify] no email transport configured, skipping');
      return;
    }
    await tp.sendMail({ from: SMTP_FROM, to, subject, html, text });
  } catch (err) {
    console.error('[notify] sendEmail failed:', err.message);
  }
}

/**
 * Send a Web Push notification to every subscription belonging to a user.
 * On 404/410 the dead subscription row is deleted. Other errors are swallowed.
 * Returns the count of successfully sent notifications. Never throws.
 */
async function sendPushToUser(userId, { title, body, url }) {
  let sent = 0;
  try {
    await getVapidKeys();
    if (!vapidConfigured) return 0;
    const subs = await query('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
    const payload = JSON.stringify({ title, body, url: url || APP_URL });
    for (const sub of subs) {
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      try {
        await webpush.sendNotification(subscription, payload);
        sent += 1;
        query('UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = ?', [sub.id])
          .catch((e) => console.error('[notify] last_used_at update failed:', e.message));
      } catch (err) {
        const code = err.statusCode;
        if (code === 404 || code === 410) {
          query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id])
            .catch((e) => console.error('[notify] stale-sub delete failed:', e.message));
        } else {
          console.error('[notify] push send failed:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('[notify] sendPushToUser failed:', err.message);
  }
  return sent;
}

/**
 * Resolve a user's delivery email: notify_email override, else users.email.
 */
async function resolveUserEmail(userId, userRow = null) {
  const row = userRow || (await query('SELECT email, notify_email FROM users WHERE id = ?', [userId]))[0];
  if (!row) return null;
  return (row.notify_email && String(row.notify_email).trim()) || row.email || null;
}

/**
 * Central per-user notifier. Respects the user's notify_channel
 * (email/push/both/none). Never throws.
 */
async function notifyUser(userId, { subject, title, body, html, text, url }) {
  try {
    const rows = await query(
      'SELECT id, email, notify_email, notify_channel FROM users WHERE id = ?',
      [userId]
    );
    if (!rows.length) return;
    const user = rows[0];
    const channel = user.notify_channel || 'email';
    if (channel === 'none') return;

    if (channel === 'email' || channel === 'both') {
      const to = await resolveUserEmail(userId, user);
      if (to) {
        await sendEmail({
          to,
          subject: subject || title,
          html: html || wrapEmail(subject || title, `<p>${escapeHtml(body || '')}</p>`),
          text: text || body || '',
        });
      }
    }
    if (channel === 'push' || channel === 'both') {
      await sendPushToUser(userId, { title: title || subject, body: body || '', url });
    }
  } catch (err) {
    console.error('[notify] notifyUser failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Email templating — plain, inline-styled, email-client-safe. Paper/ink
// editorial look (serif headings). No external CSS/images.
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wrap inner HTML in a simple editorial template. `heading` is the masthead
 * title; `innerHtml` is trusted, pre-built markup.
 */
function wrapEmail(heading, innerHtml) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ea;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf8;border:1px solid #e3ddd0;">
        <tr><td style="padding:28px 32px 8px 32px;border-bottom:2px solid #2b2723;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7c5bf5;">Kith</div>
          <h1 style="margin:6px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:#2b2723;font-weight:normal;">${escapeHtml(heading)}</h1>
        </td></tr>
        <tr><td style="padding:20px 32px 28px 32px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.55;color:#33302b;">
          ${innerHtml}
        </td></tr>
        <tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #e3ddd0;font-family:Georgia,serif;font-size:12px;color:#8a857c;">
          <a href="${escapeHtml(APP_URL)}" style="color:#7c5bf5;text-decoration:none;">Open Kith</a> &middot; Your circle, kept close.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = {
  getVapidKeys,
  sendEmail,
  sendPushToUser,
  notifyUser,
  resolveUserEmail,
  wrapEmail,
  escapeHtml,
  APP_URL,
};
