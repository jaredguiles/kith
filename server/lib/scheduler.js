'use strict';

// Scheduled notification jobs (croner). Timezone follows process.env.TZ
// (America/Los_Angeles in prod). Every job is try/catch-wrapped and logs a
// run summary with counts. Jobs never throw out of the scheduler.

const { Cron } = require('croner');
const { query } = require('../database/connection');
const notify = require('./notify');

const TZ = process.env.TZ || 'America/Los_Angeles';
const APP_URL = notify.APP_URL;

let jobs = [];
let ranDailyToday = null; // 'YYYY-MM-DD' guard for the boot catch-up

function localDateStr(d = new Date()) {
  // Local (TZ) YYYY-MM-DD via en-CA formatting.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function localHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: '2-digit', hour12: false,
  }).format(d)) % 24;
}

function localDow(d = new Date()) {
  // 0=Sun..6=Sat in the configured TZ.
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

// ---------------------------------------------------------------------------
// Per-user data gathering. All queries owner-scoped (no admin fan-out — each
// user gets their own contacts' nudges).
// ---------------------------------------------------------------------------

async function birthdaysWithin(userId, days) {
  return query(
    `SELECT c.id, c.display_name, c.birthday,
       DATEDIFF(DATE_ADD(c.birthday, INTERVAL YEAR(CURDATE()) - YEAR(c.birthday) + IF(DATE_FORMAT(c.birthday,'%m-%d') < DATE_FORMAT(CURDATE(),'%m-%d'), 1, 0) YEAR), CURDATE()) AS days_until
     FROM contacts c
     WHERE c.deleted_at IS NULL AND c.birthday IS NOT NULL AND c.is_deceased = 0 AND c.owner_user_id = ?
     HAVING days_until BETWEEN 0 AND ? ORDER BY days_until LIMIT 50`,
    [userId, days]
  );
}

async function importantDatesWithin(userId, days) {
  return query(
    `SELECT d.id, d.contact_id, c.display_name, d.label, d.date,
       CASE WHEN d.recurring = 1 THEN DATEDIFF(
         DATE_ADD(d.date, INTERVAL YEAR(CURDATE()) - YEAR(d.date) + IF(DATE_FORMAT(d.date,'%m-%d') < DATE_FORMAT(CURDATE(),'%m-%d'), 1, 0) YEAR), CURDATE())
       ELSE DATEDIFF(d.date, CURDATE()) END AS days_until
     FROM important_dates d JOIN contacts c ON c.id = d.contact_id
     WHERE c.deleted_at IS NULL AND c.owner_user_id = ?
     HAVING days_until BETWEEN 0 AND ? ORDER BY days_until LIMIT 50`,
    [userId, days]
  );
}

async function eventsWithin(userId, days) {
  return query(
    `SELECT e.id, e.title, e.starts_at FROM events e
     WHERE e.deleted_at IS NULL AND e.status = 'upcoming' AND e.owner_user_id = ? AND e.is_spicy = 0
       AND e.starts_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)
     ORDER BY e.starts_at ASC LIMIT 50`,
    [userId, days]
  );
}

async function remindersDue(userId) {
  return query(
    `SELECT r.id, r.title, r.due_at, c.display_name AS contact_name FROM reminders r
     LEFT JOIN contacts c ON c.id = r.contact_id
     WHERE r.owner_user_id = ? AND r.deleted_at IS NULL AND r.completed_at IS NULL
       AND r.due_at <= NOW()
     ORDER BY r.due_at ASC LIMIT 50`,
    [userId]
  );
}

async function openReminders(userId) {
  return query(
    `SELECT r.id, r.title, r.due_at, c.display_name AS contact_name FROM reminders r
     LEFT JOIN contacts c ON c.id = r.contact_id
     WHERE r.owner_user_id = ? AND r.deleted_at IS NULL AND r.completed_at IS NULL
     ORDER BY r.due_at ASC LIMIT 50`,
    [userId]
  );
}

async function outOfTouch(userId) {
  return query(
    `SELECT c.id, c.display_name, c.last_contacted_at, c.keep_in_touch_days FROM contacts c
     WHERE c.deleted_at IS NULL AND c.keep_in_touch_days IS NOT NULL AND c.keep_in_touch_days > 0
       AND c.owner_user_id = ?
       AND (c.last_contacted_at IS NULL OR c.last_contacted_at < DATE_SUB(NOW(), INTERVAL c.keep_in_touch_days DAY))
     ORDER BY c.last_contacted_at IS NOT NULL, c.last_contacted_at ASC LIMIT 50`,
    [userId]
  );
}

async function recentlyAdded(userId, days) {
  return query(
    `SELECT c.id, c.display_name, c.created_at FROM contacts c
     WHERE c.deleted_at IS NULL AND c.owner_user_id = ?
       AND c.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY c.created_at DESC LIMIT 20`,
    [userId, days]
  );
}

async function recentActivity(userId, days) {
  return query(
    `SELECT i.type, i.occurred_at, c.display_name FROM interactions i
     JOIN contacts c ON c.id = i.contact_id AND c.deleted_at IS NULL
     WHERE i.owner_user_id = ? AND i.occurred_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY i.occurred_at DESC LIMIT 20`,
    [userId, days]
  );
}

// ---------------------------------------------------------------------------
// Job A — daily nudges (concise "today" email/push per user).
// ---------------------------------------------------------------------------
async function runDailyNudges() {
  let usersNotified = 0;
  try {
    const users = await query(
      `SELECT id, nudge_birthdays, nudge_reminders, nudge_out_of_touch, notify_channel
       FROM users WHERE is_active = 1`
    );
    for (const u of users) {
      try {
        if (u.notify_channel === 'none') continue;
        const parts = [];
        const lines = [];

        if (u.nudge_birthdays) {
          const bdays = await birthdaysWithin(u.id, 3);
          if (bdays.length) {
            lines.push(`Birthdays soon: ${bdays.map((b) => `${b.display_name} (${b.days_until === 0 ? 'today' : `${b.days_until}d`})`).join(', ')}`);
            parts.push(`<p><strong>🎂 Birthdays soon</strong><br>${bdays.map((b) => `${notify.escapeHtml(b.display_name)} — ${b.days_until === 0 ? 'today' : `in ${b.days_until} day(s)`}`).join('<br>')}</p>`);
          }
        }
        if (u.nudge_reminders) {
          const rem = await remindersDue(u.id);
          if (rem.length) {
            lines.push(`Reminders due: ${rem.map((r) => r.title).join(', ')}`);
            parts.push(`<p><strong>⏰ Reminders due</strong><br>${rem.map((r) => notify.escapeHtml(r.title) + (r.contact_name ? ` — ${notify.escapeHtml(r.contact_name)}` : '')).join('<br>')}</p>`);
          }
        }
        if (u.nudge_out_of_touch) {
          const oot = await outOfTouch(u.id);
          if (oot.length) {
            lines.push(`Out of touch: ${oot.map((c) => c.display_name).join(', ')}`);
            parts.push(`<p><strong>👋 Time to reach out</strong><br>${oot.map((c) => notify.escapeHtml(c.display_name)).join('<br>')}</p>`);
          }
        }

        if (!parts.length) continue;
        const body = lines.join(' · ');
        const html = notify.wrapEmail('Kith — today', parts.join('\n') +
          `<p style="margin-top:16px;"><a href="${notify.escapeHtml(APP_URL)}" style="color:#7c5bf5;">Open Kith →</a></p>`);
        await notify.notifyUser(u.id, {
          subject: 'Kith — today', title: 'Kith — today',
          body, html, text: body, url: APP_URL,
        });
        usersNotified += 1;
      } catch (err) {
        console.error(`[scheduler] daily nudge failed for user ${u.id}:`, err.message);
      }
    }
    ranDailyToday = localDateStr();
    console.log(`[scheduler] daily nudges run: ${usersNotified} user(s) notified`);
  } catch (err) {
    console.error('[scheduler] runDailyNudges failed:', err.message);
  }
  return usersNotified;
}

// ---------------------------------------------------------------------------
// Job B — weekly digest. Email-first; push-only channels get a short pointer.
// `onlyUserId` (optional) restricts the run to a single user (preview button).
// ---------------------------------------------------------------------------
async function runWeeklyDigest(onlyUserId = null) {
  let digestsSent = 0;
  try {
    const todayDow = localDow();
    const where = onlyUserId
      ? 'WHERE is_active = 1 AND id = ?'
      : 'WHERE is_active = 1 AND digest_weekly = 1 AND digest_day = ?';
    const users = await query(
      `SELECT id, email, notify_email, notify_channel, digest_day FROM users ${where}`,
      [onlyUserId != null ? onlyUserId : todayDow]
    );

    for (const u of users) {
      try {
        if (u.notify_channel === 'none') continue;
        const [bdays, dates, events, reminders, oot, added, activity] = await Promise.all([
          birthdaysWithin(u.id, 14),
          importantDatesWithin(u.id, 14),
          eventsWithin(u.id, 14),
          openReminders(u.id),
          outOfTouch(u.id),
          recentlyAdded(u.id, 7),
          recentActivity(u.id, 7),
        ]);

        const hasContent = bdays.length || dates.length || events.length ||
          reminders.length || oot.length || added.length || activity.length;

        // Push-only channel → short pointer instead of a rich email.
        if (u.notify_channel === 'push') {
          if (hasContent) {
            await notify.sendPushToUser(u.id, {
              title: 'Your weekly Kith digest',
              body: 'Open Kith to see birthdays, reminders and who to reach out to.',
              url: APP_URL,
            });
            digestsSent += 1;
          }
          continue;
        }

        const to = await notify.resolveUserEmail(u.id, u);
        if (!to) continue;

        const section = (title, rows, render) =>
          rows.length ? `<p><strong>${title}</strong><br>${rows.map(render).join('<br>')}</p>` : '';

        const html = notify.wrapEmail('Your week ahead', [
          section('🎂 Upcoming birthdays (14d)', bdays,
            (b) => `${notify.escapeHtml(b.display_name)} — ${b.days_until === 0 ? 'today' : `in ${b.days_until} day(s)`}`),
          section('📅 Important dates (14d)', dates,
            (d) => `${notify.escapeHtml(d.label)} — ${notify.escapeHtml(d.display_name)} (${d.days_until === 0 ? 'today' : `${d.days_until}d`})`),
          section('🗓️ Upcoming events (14d)', events,
            (e) => `${notify.escapeHtml(e.title)} — ${String(e.starts_at).slice(0, 16)}`),
          section('⏰ Open reminders', reminders,
            (r) => `${notify.escapeHtml(r.title)}${r.contact_name ? ` — ${notify.escapeHtml(r.contact_name)}` : ''} (${String(r.due_at).slice(0, 10)})`),
          section('👋 Out of touch', oot,
            (c) => `${notify.escapeHtml(c.display_name)}${c.last_contacted_at ? ` — last ${String(c.last_contacted_at).slice(0, 10)}` : ' — no contact yet'}`),
          section('✨ Recently added', added,
            (c) => `${notify.escapeHtml(c.display_name)} (${String(c.created_at).slice(0, 10)})`),
          section('📝 Recent activity', activity,
            (a) => `${notify.escapeHtml(a.type)} — ${notify.escapeHtml(a.display_name)} (${String(a.occurred_at).slice(0, 10)})`),
          !hasContent ? '<p>A quiet week — nothing on the horizon. Enjoy it.</p>' : '',
          `<p style="margin-top:16px;"><a href="${notify.escapeHtml(APP_URL)}" style="color:#7c5bf5;">Open Kith →</a></p>`,
        ].filter(Boolean).join('\n'));

        const text = `Your weekly Kith digest — open ${APP_URL}`;
        await notify.sendEmail({ to, subject: 'Your weekly Kith digest', html, text });
        digestsSent += 1;
      } catch (err) {
        console.error(`[scheduler] weekly digest failed for user ${u.id}:`, err.message);
      }
    }
    console.log(`[scheduler] weekly digest run: ${digestsSent} digest(s) sent`);
  } catch (err) {
    console.error('[scheduler] runWeeklyDigest failed:', err.message);
  }
  return digestsSent;
}

// ---------------------------------------------------------------------------
// Job C — daily trash purge (migrated off the old setInterval in index.js).
// ---------------------------------------------------------------------------
async function runTrashPurge() {
  try {
    const trash = require('../routes/trash');
    if (typeof trash.purgeExpiredTrash === 'function') {
      await trash.purgeExpiredTrash();
    }
  } catch (err) {
    console.error('[scheduler] trash purge failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// startScheduler — register croner jobs + boot catch-up for Job A.
// ---------------------------------------------------------------------------
function startScheduler() {
  const opts = { timezone: TZ, protect: true };

  jobs.push(new Cron('0 0 8 * * *', opts, () => { runDailyNudges(); }));      // 08:00 daily
  jobs.push(new Cron('0 15 8 * * *', opts, () => { runWeeklyDigest(); }));    // 08:15 daily (per-user digest_day gate)
  jobs.push(new Cron('0 0 3 * * *', opts, () => { runTrashPurge(); }));       // 03:00 daily
  jobs.push(new Cron('0 30 4 * * *', opts, () => {                            // 04:30 daily CardDAV/CalDAV push
    try { require('./davsync').syncAllToDav(); } catch (e) { console.error('[scheduler] dav sync error', e.message); }
  }));

  console.log(`[scheduler] started 4 croner jobs (TZ=${TZ})`);

  // Boot catch-up for Job A: if we booted after 08:00 local and haven't run
  // today, run once ~60s after boot. Simple in-memory guard.
  setTimeout(() => {
    try {
      const hour = localHour();
      const today = localDateStr();
      if (hour >= 8 && ranDailyToday !== today) {
        console.log('[scheduler] boot catch-up: running daily nudges');
        runDailyNudges();
      }
    } catch (err) {
      console.error('[scheduler] boot catch-up failed:', err.message);
    }
  }, 60 * 1000).unref();

  return jobs;
}

function stopScheduler() {
  for (const j of jobs) {
    try { j.stop(); } catch { /* ignore */ }
  }
  jobs = [];
}

module.exports = {
  startScheduler,
  stopScheduler,
  runDailyNudges,
  runWeeklyDigest,
  runTrashPurge,
};
