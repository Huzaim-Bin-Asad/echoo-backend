const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db-create");

const app = express();
const router = express.Router();
app.use(express.json());

// Helper: update both sender and receiver contact/preview records
async function updateContactsAndPreviews(messageData) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const [senderUserRows, receiverUserRows] = await Promise.all([
      client.query("SELECT username, profile_picture FROM users WHERE user_id = $1", [messageData.sender_id]),
      client.query("SELECT username, profile_picture FROM users WHERE user_id = $1", [messageData.receiver_id])
    ]);

    const senderUsername = senderUserRows.rows[0]?.username || "Unknown";
    const senderProfilePic = senderUserRows.rows[0]?.profile_picture || null;
    const receiverUsername = receiverUserRows.rows[0]?.username || "Unknown";
    const receiverProfilePic = receiverUserRows.rows[0]?.profile_picture || null;

    await processUserContactAndPreview(
      client,
      messageData.sender_id,
      messageData.receiver_id,
      receiverUsername,
      receiverProfilePic,
      messageData.message_text,
      messageData.timestamp,
      messageData.contact_id
    );

    await processUserContactAndPreview(
      client,
      messageData.receiver_id,
      messageData.sender_id,
      senderUsername,
      senderProfilePic,
      messageData.message_text,
      messageData.timestamp
    );

    await client.query("COMMIT");
    console.log("✅ Async contact/preview updates completed");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error in async processing:", err.message);
  } finally {
    client.release();
  }
}

// Manual UPSERT logic for contacts and chat_previews
async function processUserContactAndPreview(
  client,
  userId,
  otherUserId,
  otherUsername,
  otherProfilePic,
  messageText,
  timestamp,
  existingContactId = null
) {
  const { rows: contactRows } = await client.query(
    "SELECT contact_id FROM contacts WHERE user_id = $1 AND receiver_id = $2",
    [userId, otherUserId]
  );

  let contactId = contactRows[0]?.contact_id || existingContactId;

  if (!contactId) {
    contactId = uuidv4();
    await client.query(
      `INSERT INTO contacts (
        contact_id, user_id, sender_id, receiver_id, contact_name
      ) VALUES ($1, $2, $3, $4, $5)`,
      [contactId, userId, userId, otherUserId, otherUsername]
    );
  }

  // Check if chat_preview already exists
  const { rows: previewExists } = await client.query(
    `SELECT 1 FROM chat_previews WHERE contact_id = $1 LIMIT 1`,
    [contactId]
  );

  if (previewExists.length > 0) {
    // Update preview
    await client.query(
      `UPDATE chat_previews SET
        profile_picture = $1,
        contact_name = $2,
        last_text = $3,
        text_timestamp = $4,
        sender_id = $5,
        receiver_id = $6,
        user_id = $7
      WHERE contact_id = $8`,
      [
        otherProfilePic,
        otherUsername,
        messageText,
        timestamp,
        userId,
        otherUserId,
        userId,
        contactId
      ]
    );
  } else {
    // Insert preview
    await client.query(
      `INSERT INTO chat_previews (
        contact_id, profile_picture, contact_name,
        last_text, text_timestamp, user_id, sender_id, receiver_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        contactId,
        otherProfilePic,
        otherUsername,
        messageText,
        timestamp,
        userId,
        userId,
        otherUserId
      ]
    );
  }

  return contactId;
}

// Endpoint to fetch messages between two users
router.post("/get-messages", async (req, res) => {
  try {
    const { sender_id, receiver_id } = req.body;
    const { rows: messages } = await pool.query(
      `SELECT * FROM messages 
       WHERE (sender_id = $1 AND receiver_id = $2)
       OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY timestamp`,
      [sender_id, receiver_id]
    );
    res.json({ messages });
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to send a new message
router.post("/Send-messages", async (req, res) => {
  const { contact_id, sender_id, receiver_id, message_text, temp_id } = req.body;

  if (!contact_id || !sender_id || !receiver_id || !message_text || !temp_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const message_id = uuidv4();
  const timestamp = new Date().toISOString();

  try {
    const { rows: [savedMessage] } = await pool.query(
      `INSERT INTO messages (
        message_id, temp_id, contact_id,
        sender_id, receiver_id, message_text,
        timestamp, read_checker
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'unread')
      RETURNING *`,
      [message_id, temp_id, contact_id, sender_id, receiver_id, message_text, timestamp]
    );

    res.status(201).json({
      message: "Message sent successfully",
      message_id: savedMessage.message_id,
      temp_id,
    });

    updateContactsAndPreviews(savedMessage);

  } catch (err) {
    console.error("Error handling /Send-messages:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;


