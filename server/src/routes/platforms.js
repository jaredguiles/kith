import express from 'express';
import pool from '../database/connection.js';

const router = express.Router();

// GET /api/contacts/:id/platforms - List platform profiles
router.get('/contacts/:id/platforms', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [platforms] = await connection.execute(
      'SELECT * FROM platform_profiles WHERE contact_id = ? ORDER BY platform ASC',
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: platforms,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts/:id/platforms - Create/upsert platform profile
router.post('/contacts/:id/platforms', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      platform,
      platform_user_id,
      username,
      profile_url,
      verified,
      follower_count,
      bio,
    } = req.body;

    if (!platform) {
      return res.status(400).json({ success: false, error: 'platform is required' });
    }

    const connection = await pool.getConnection();

    // Check if exists
    const [existing] = await connection.execute(
      'SELECT id FROM platform_profiles WHERE contact_id = ? AND platform = ?',
      [id, platform]
    );

    if (existing.length > 0) {
      // Update
      await connection.execute(
        `UPDATE platform_profiles SET
         platform_user_id = COALESCE(?, platform_user_id),
         username = COALESCE(?, username),
         profile_url = COALESCE(?, profile_url),
         verified = COALESCE(?, verified),
         follower_count = COALESCE(?, follower_count),
         bio = COALESCE(?, bio),
         updated_at = NOW()
         WHERE contact_id = ? AND platform = ?`,
        [platform_user_id, username, profile_url, verified !== undefined ? (verified ? 1 : 0) : null, follower_count, bio, id, platform]
      );

      const [[profile]] = await connection.execute(
        'SELECT * FROM platform_profiles WHERE contact_id = ? AND platform = ?',
        [id, platform]
      );

      connection.release();

      return res.json({
        success: true,
        data: profile,
      });
    }

    // Create
    const [result] = await connection.execute(
      `INSERT INTO platform_profiles (contact_id, platform, platform_user_id, username, profile_url, verified, follower_count, bio, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [id, platform, platform_user_id || null, username || null, profile_url || null, verified ? 1 : 0, follower_count || null, bio || null]
    );

    const [[profile]] = await connection.execute(
      'SELECT * FROM platform_profiles WHERE id = ?',
      [result.insertId]
    );

    connection.release();

    res.status(201).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/platforms/:id - Update platform profile
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      platform_user_id,
      username,
      profile_url,
      verified,
      follower_count,
      bio,
    } = req.body;

    const connection = await pool.getConnection();

    await connection.execute(
      `UPDATE platform_profiles SET
       platform_user_id = COALESCE(?, platform_user_id),
       username = COALESCE(?, username),
       profile_url = COALESCE(?, profile_url),
       verified = COALESCE(?, verified),
       follower_count = COALESCE(?, follower_count),
       bio = COALESCE(?, bio),
       updated_at = NOW()
       WHERE id = ?`,
      [platform_user_id, username, profile_url, verified !== undefined ? (verified ? 1 : 0) : null, follower_count, bio, id]
    );

    const [[profile]] = await connection.execute(
      'SELECT * FROM platform_profiles WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
