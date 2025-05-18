const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');
const mega = require('megajs');

// GET ALL STATUSES for a user
router.post('/getAllStatuses', async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    console.warn('[getAllStatuses] Missing user_id in request body');
    return res.status(400).json({ message: 'user_id is required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM status WHERE user_id = $1 ORDER BY timestamp DESC',
      [user_id]
    );

    const statuses = result.rows.map((status) => ({
      status_id: status.status_id,
      caption: status.caption,
      timestamp: status.timestamp,
      media_url: status.media_url,
    }));

    console.info(`[getAllStatuses] Found ${statuses.length} statuses for user_id=${user_id}`);
    res.json({ statuses }); // ✅ Always return 200 OK with array
  } catch (error) {
    console.error('[getAllStatuses] DB error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET MEDIA STREAM FROM MEGA.NZ
router.post('/getMediaByUrl', async (req, res) => {
  const { media_url } = req.body;

  if (!media_url) {
    console.warn('[getMediaByUrl] Missing media_url in request body');
    return res.status(400).json({ message: 'media_url is required' });
  }

  const match = media_url.match(/mega\.nz\/file\/([^#]+)#(.+)/);
  if (!match) {
    console.warn('[getMediaByUrl] Invalid Mega.nz URL format:', media_url);
    return res.status(400).json({ message: 'Invalid Mega.nz URL format' });
  }

  const fileId = match[1];
  const fileKey = match[2];

  const file = mega.File.fromURL(`https://mega.nz/file/${fileId}#${fileKey}`);

  file.loadAttributes((err) => {
    if (err) {
      console.error('[getMediaByUrl] Error loading file attributes:', err);
      return res.status(500).json({ message: 'Error loading file attributes' });
    }

    const ext = file.name?.split('.').pop()?.toLowerCase();
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

    stream.on('error', (e) => {
      console.error('[getMediaByUrl] Streaming error:', e);
      res.status(500).end('Streaming error');
    });

    stream.pipe(res);
  });
});

module.exports = router;
