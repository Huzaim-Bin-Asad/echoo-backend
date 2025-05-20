const { File } = require('megajs');
const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');
const stream = require('stream');
const mime = require('mime-types'); // Add mime-types package

// Helper function to fetch and stream Mega.nz file
async function getMegaFileStream(megaUrl) {
  try {
    console.log(`[Mega] Initializing file fetch for ${megaUrl}`);
    const file = File.fromURL(megaUrl);

    // Load file metadata
    await file.loadAttributes();
    console.log(`[Mega] Loaded attributes for ${file.name}, size: ${file.size}`);

    // Determine MIME type
    let mimeType = file.attributes.mimeType;
    if (!mimeType || mimeType === 'application/octet-stream') {
      // Fallback to inferring MIME type from file extension
      mimeType = mime.lookup(file.name) || 'application/octet-stream';
      console.log(`[Mega] Inferred MIME type for ${file.name}: ${mimeType}`);
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

    console.log(`[Media] Fetching media for status_id: ${statusId}, URL: ${media_url}`);

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
  console.log("📥 [1] Received POST request to /get-contacts-statuses");

  const { user_id } = req.body;

  if (!user_id) {
    console.warn("⚠️ [2] Missing user_id in request body.");
    return res.status(400).json({ error: 'user_id is required' });
  }

  console.log(`✅ [3] user_id received: ${user_id}`);

  try {
    const contactsQuery = `
      SELECT receiver_id, contact_name
      FROM contacts
      WHERE user_id = $1
    `;
    const { rows: contacts } = await pool.query(contactsQuery, [user_id]);

    if (!contacts.length) {
      console.log("ℹ️ [4] No contacts found for this user.");
      return res.json({ statuses: [] });
    }

    const receiverIds = contacts.map(c => c.receiver_id);
    const contactNameMap = Object.fromEntries(contacts.map(c => [c.receiver_id, c.contact_name]));

    console.log(`📦 [5] Found ${receiverIds.length} receiver IDs.`);

    const statusQuery = `
      SELECT status_id, user_id, caption, timestamp, media_url
      FROM status
      WHERE user_id = ANY($1::uuid[])
      ORDER BY timestamp DESC
    `;
    const { rows: statuses } = await pool.query(statusQuery, [receiverIds]);

    console.log(`📄 [6] Retrieved ${statuses.length} statuses.`);

    // Modify media_url to point to the new /media/:statusId endpoint
    const enrichedStatuses = statuses.map(status => ({
      ...status,
      contactName: contactNameMap[status.user_id] || null,
      media_url: status.media_url ? `http://localhost:5000/api/media/${status.status_id}` : null,
    }));

    console.log("🔗 [7] Sample enriched status:");
    enrichedStatuses.slice(0, 3).forEach((s, i) => {
      console.log(`   ${i + 1}. status_id: ${s.status_id}, user_id: ${s.user_id}, contactName: ${s.contactName}, media_url: ${s.media_url}`);
    });

    return res.json({ statuses: enrichedStatuses });

  } catch (error) {
    console.error("❌ [8] Error while retrieving contacts or statuses:", error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;