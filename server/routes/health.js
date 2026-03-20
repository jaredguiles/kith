const express = require('express');
const pool = require('../database/connection');

const router = express.Router();

// GET /api/health - Health check
router.get('/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Health check database error:', err);
    res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
