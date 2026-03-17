import express from 'express';
import pool from '../database/connection.js';
import { updateSearchIndex } from '../services/searchIndex.js';

const router = express.Router();

// POST /api/webhooks/sync - Unified sync endpoint
router.post('/sync', async (req, res, next) => {
  try {
    const {
      platform,
      contact,
      preferences,
      messages,
      media,
    } = req.body;

    if (!platform || !contact) {
      return res.status(400).json({
        success: false,
        error: 'platform and contact are required',
      });
    }

    const connection = await pool.getConnection();

    try {
      // Find or create contact
      let contactId;
      const [existingContacts] = await connection.execute(
        `SELECT id FROM contacts WHERE display_name = ? AND deleted_at IS NULL`,
        [contact.display_name]
      );

      if (existingContacts.length > 0) {
        contactId = existingContacts[0].id;
        // Update contact
        await connection.execute(
          `UPDATE contacts SET
           username = COALESCE(?, username),
           bio = COALESCE(?, bio),
           age = COALESCE(?, age),
           photo_url = COALESCE(?, photo_url),
           is_anonymous = COALESCE(?, is_anonymous),
           is_spicy = COALESCE(?, is_spicy),
           location = COALESCE(?, location),
           updated_at = NOW()
           WHERE id = ?`,
          [
            contact.username || null,
            contact.bio || null,
            contact.age || null,
            contact.photo_url || null,
            contact.is_anonymous ? 1 : 0,
            contact.is_spicy !== undefined ? (contact.is_spicy ? 1 : 0) : null,
            contact.location || null,
            contactId,
          ]
        );
      } else {
        // Create contact
        const [result] = await connection.execute(
          `INSERT INTO contacts (display_name, username, bio, age, photo_url, is_anonymous, is_spicy, location, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            contact.display_name,
            contact.username || null,
            contact.bio || null,
            contact.age || null,
            contact.photo_url || null,
            contact.is_anonymous ? 1 : 0,
            contact.is_spicy ? 1 : 0,
            contact.location || null,
          ]
        );
        contactId = result.insertId;
      }

      // Find or create platform profile
      const [existingProfiles] = await connection.execute(
        `SELECT id FROM platform_profiles WHERE contact_id = ? AND platform = ?`,
        [contactId, platform]
      );

      if (existingProfiles.length > 0) {
        // Update profile
        await connection.execute(
          `UPDATE platform_profiles SET
           platform_user_id = COALESCE(?, platform_user_id),
           username = COALESCE(?, username),
           profile_url = COALESCE(?, profile_url),
           bio = COALESCE(?, bio),
           updated_at = NOW()
           WHERE id = ?`,
          [
            contact.platform_user_id || null,
            contact.username || null,
            contact.profile_url || null,
            contact.bio || null,
            existingProfiles[0].id,
          ]
        );
      } else {
        // Create profile
        await connection.execute(
          `INSERT INTO platform_profiles (contact_id, platform, platform_user_id, username, profile_url, bio, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            contactId,
            platform,
            contact.platform_user_id || null,
            contact.username || null,
            contact.profile_url || null,
            contact.bio || null,
          ]
        );
      }

      // Save messages with deduplication
      let messageCount = 0;
      let timelineEventId = null;

      if (Array.isArray(messages) && messages.length > 0) {
        // Create timeline event for message batch
        const [eventResult] = await connection.execute(
          `INSERT INTO timeline_events (contact_id, event_type, title, description, occurred_at, created_at, updated_at)
           VALUES (?, 'message_batch', ?, ?, NOW(), NOW(), NOW())`,
          [contactId, `${messages.length} messages from ${platform}`, `Synced from ${platform}`]
        );
        timelineEventId = eventResult.insertId;

        for (const msg of messages) {
          const { sender, content, timestamp, message_type } = msg;

          if (!sender || !content) {
            continue;
          }

          // Check for duplicates
          const [existing] = await connection.execute(
            `SELECT id FROM messages WHERE contact_id = ? AND sender = ? AND content = ? LIMIT 1`,
            [contactId, sender, content]
          );

          if (existing.length === 0) {
            await connection.execute(
              `INSERT INTO messages (contact_id, timeline_event_id, sender, content, message_type, platform, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
              [contactId, timelineEventId, sender, content, message_type || 'text', platform, timestamp || new Date().toISOString()]
            );
            messageCount++;
          }
        }

        // Update timeline event with actual count
        if (messageCount > 0) {
          await connection.execute(
            `UPDATE timeline_events SET
             title = ?,
             description = ?
             WHERE id = ?`,
            [`${messageCount} new messages`, `Synced ${messageCount} messages from ${platform}`, timelineEventId]
          );
        } else {
          // Delete timeline event if no new messages
          await connection.execute(
            `DELETE FROM timeline_events WHERE id = ?`,
            [timelineEventId]
          );
        }
      }

      // Save media with deduplication
      let mediaCount = 0;
      let mediaTimelineEventId = null;

      if (Array.isArray(media) && media.length > 0) {
        // Create timeline event for media exchange
        const [mediaEventResult] = await connection.execute(
          `INSERT INTO timeline_events (contact_id, event_type, title, description, occurred_at, created_at, updated_at)
           VALUES (?, 'media_exchange', ?, ?, NOW(), NOW(), NOW())`,
          [contactId, `${media.length} media assets`, `Media synced from ${platform}`]
        );
        mediaTimelineEventId = mediaEventResult.insertId;

        for (const item of media) {
          const { file_url, media_type, captured_at } = item;

          if (!file_url) {
            continue;
          }

          // Check for duplicates
          const [existing] = await connection.execute(
            `SELECT id FROM media_assets WHERE contact_id = ? AND file_url = ? LIMIT 1`,
            [contactId, file_url]
          );

          if (existing.length === 0) {
            await connection.execute(
              `INSERT INTO media_assets (contact_id, timeline_event_id, file_url, media_type, platform, captured_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [contactId, mediaTimelineEventId, file_url, media_type || 'image', platform, captured_at || new Date().toISOString()]
            );
            mediaCount++;
          }
        }

        // Update timeline event with actual count
        if (mediaCount > 0) {
          await connection.execute(
            `UPDATE timeline_events SET
             title = ?,
             description = ?
             WHERE id = ?`,
            [`${mediaCount} media assets`, `${mediaCount} new media files from ${platform}`, mediaTimelineEventId]
          );
        } else {
          // Delete timeline event if no new media
          await connection.execute(
            `DELETE FROM timeline_events WHERE id = ?`,
            [mediaTimelineEventId]
          );
        }
      }

      // Save preferences (upsert)
      if (preferences && typeof preferences === 'object') {
        for (const [key, value] of Object.entries(preferences)) {
          await connection.execute(
            `INSERT INTO platform_preferences (contact_id, platform, key, value, updated_at)
             VALUES (?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()`,
            [contactId, platform, key, JSON.stringify(value), JSON.stringify(value)]
          );
        }
      }

      // Update search index
      await updateSearchIndex(contactId);

      connection.release();

      res.status(201).json({
        success: true,
        data: {
          contactId,
          messagesAdded: messageCount,
          mediaAdded: mediaCount,
        },
      });
    } catch (error) {
      connection.release();
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

export default router;
