const { File } = require('megajs');
const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');
const stream = require('stream');
const mime = require('mime-types'); // Add mime-types package

// Helper function to fetch and stream Mega.nz file
async function getMegaFileStream(megaUrl) {
  try {
    const file = File.fromURL(megaUrl);

    // Load file metadata
    await file.loadAttributes();

    // Determine MIME type
    let mimeType = file.attributes.mimeType;
    if (!mimeType || mimeType === 'application/octet-stream') {
      // Fallback to inferring MIME type from file extension
      mimeType = mime.lookup(file.name) || 'application/octet-stream';
    }

    // Create a readable stream for the file
    const fileStream = file.download();
    return { stream: fileStream, mimeType };
  } catch (error) {
    console.error(`[Mega] Error fetching file from ${megaUrl}:`, error);
    throw error;
  }
}

// New endpoint to proxy Mega.nz media
router.get('/media/:statusId', async (req, res) => {
  const { statusId } = req.params;

  try {
    // Fetch the status from the database to get the media_url
    const statusQuery = `
      SELECT media_url
      FROM status
      WHERE status_id = $1
    `;
    const { rows } = await pool.query(statusQuery, [statusId]);

    if (!rows.length) {
      console.warn(`[Media] No status found for status_id: ${statusId}`);
      return res.status(404).json({ error: 'Status not found' });
    }

    const { media_url } = rows[0];

    if (!media_url) {
      console.warn(`[Media] No media_url for status_id: ${statusId}`);
      return res.status(400).json({ error: 'No media URL available' });
    }


    // Fetch the Mega.nz file stream
    const { stream: fileStream, mimeType } = await getMegaFileStream(media_url);

    // Set appropriate headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');

    // Pipe the file stream to the response
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error(`[Media] Stream error for ${media_url}:`, error);
      res.status(500).json({ error: 'Failed to stream media' });
    });

  } catch (error) {
    console.error(`[Media] Error processing media for status_id: ${statusId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/get-contacts-statuses', async (req, res) => {

  const { user_id, cachedMediaUrls = [] } = req.body;

  if (!user_id) {
    console.warn("⚠️ [2] Missing user_id in request body.");
    return res.status(400).json({ error: 'user_id is required' });
  }


  try {
    const contactsQuery = `
      SELECT receiver_id, contact_name
      FROM contacts
      WHERE user_id = $1
    `;
    const { rows: contacts } = await pool.query(contactsQuery, [user_id]);

    if (!contacts.length) {
      return res.json({ statuses: [] });
    }

    const receiverIds = contacts.map(c => c.receiver_id);
    const contactNameMap = Object.fromEntries(contacts.map(c => [c.receiver_id, c.contact_name]));


    const statusQuery = `
      SELECT status_id, user_id, caption, timestamp, media_url
      FROM status
      WHERE user_id = ANY($1::uuid[])
      ORDER BY timestamp DESC
    `;
    const { rows: statuses } = await pool.query(statusQuery, [receiverIds]);


    // Filter out statuses with cached media URLs to avoid redundant downloads
    const enrichedStatuses = await Promise.all(
      statuses.map(async (status) => {
        const proxiedUrl = `http://localhost:5000/api/media/${status.status_id}`;

        if (cachedMediaUrls.includes(proxiedUrl)) {
          return {
            ...status,
            contactName: contactNameMap[status.user_id] || null,
            media_url: proxiedUrl,
            isCached: true,
          };
        }

        return {
          ...status,
          contactName: contactNameMap[status.user_id] || null,
          media_url: status.media_url ? proxiedUrl : null,
          isCached: false,
        };
      })
    );

    enrichedStatuses.slice(0, 3).forEach((s, i) => {
    });

    return res.json({ statuses: enrichedStatuses });

  } catch (error) {
    console.error("❌ [9] Error while retrieving contacts or statuses:", error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
