const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');
const mega = require('megajs');

// Route 1: Get all statuses by user_id
router.post('/getAllStatuses', async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: 'user_id is required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM status WHERE user_id = $1 ORDER BY timestamp DESC',
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No statuses found' });
    }

    const statuses = result.rows.map((status) => ({
      status_id: status.status_id,
      caption: status.caption,
      timestamp: status.timestamp,
      media_url: status.media_url,
    }));

    res.json({ statuses });
  } catch (error) {
    console.error('DB error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route 2: Stream media by Mega.nz URL
router.post('/getMediaByUrl', async (req, res) => {
  const { media_url } = req.body;

  const match = media_url.match(/mega\.nz\/file\/([^#]+)#(.+)/);
  if (!match) {
    return res.status(400).json({ message: 'Invalid Mega.nz URL format' });
  }

  const fileId = match[1];
  const fileKey = match[2];
  const file = mega.File.fromURL(`https://mega.nz/file/${fileId}#${fileKey}`);

  file.loadAttributes((err) => {
    if (err) {
      console.error('Mega attribute error:', err);
      return res.status(500).json({ message: 'Error loading file attributes' });
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const mimeTypes = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    const stream = file.download();
    stream.pipe(res);
    stream.on('error', (e) => {
      console.error('Streaming error:', e);
      res.status(500).end('Streaming error');
    });
  });
});

module.exports = router;
