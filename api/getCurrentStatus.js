const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');
const mega = require('megajs'); // ✅ Fix: Import megajs

router.post('/getCurrentStatus', async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: 'user_id is required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM status WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No status found' });
    }

    const status = result.rows[0];
    const mediaUrl = status.media_url;

    if (!mediaUrl) {
      return res.status(404).json({ message: 'No media URL found' });
    }

    const match = mediaUrl.match(/mega\.nz\/file\/([^#]+)#(.+)/);
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

      // Allow frontend JS to read the custom header
      res.setHeader('Access-Control-Expose-Headers', 'X-Status-Timestamp');

      const timestampMs = new Date(status.timestamp).getTime();

      res.setHeader('X-Status-Timestamp', String(timestampMs));
      res.setHeader('Content-Length', file.size);

      const ext = file.name.split('.').pop().toLowerCase();
      const mimeTypes = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
        webm: 'video/webm',
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
  } catch (error) {
    console.error('DB error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
