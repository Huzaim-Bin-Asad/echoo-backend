const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');
const mega = require('megajs');

router.post('/getCurrentStatus', async (req, res) => {
  const { user_id, originalMediaUrl, isCached } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: 'user_id is required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM status WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [user_id]
    );

    if (result.rows.length === 0) {
      console.log(`[INFO] No status found for user_id: ${user_id}`);
      return res.status(404).json({ message: 'No status found' });
    }

    const status = result.rows[0];
    const mediaUrl = status.media_url;

    if (!mediaUrl) {
      console.log(`[INFO] No media URL found for user_id: ${user_id}`);
      return res.status(404).json({ message: 'No media URL found' });
    }

    // Check if frontend cache matches the latest media URL
    if (isCached && originalMediaUrl === mediaUrl) {
      // Frontend already has the latest status media
      // Send 204 No Content (no new data to send)
      return res.status(204).end();
      // Or alternatively:
      // return res.status(200).json({ message: 'Already have latest media' });
    }

    const match = mediaUrl.match(/mega\.nz\/file\/([^#]+)#(.+)/);
    if (!match) {
      console.log(`[ERROR] Invalid Mega.nz URL format for mediaUrl: ${mediaUrl}`);
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
        mov: 'video/quicktime',
        webm: 'video/webm',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const timestampMs = new Date(status.timestamp).getTime();



      res.setHeader('Access-Control-Expose-Headers', 'X-Status-Timestamp, X-Status-MediaURL');
      res.setHeader('X-Status-Timestamp', String(timestampMs));
      res.setHeader('X-Status-MediaURL', mediaUrl);
      res.setHeader('Content-Length', file.size);
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
