const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const { pool } = require("../db-create");

router.post("/Send-messages", async (req, res) => {
  const {
    contact_id,
    sender_id,
    receiver_id,
    message_text,
    timestamp,
    read_checker,
    temp_id,
  } = req.body;

  if (!contact_id || !sender_id || !receiver_id || !message_text || !temp_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const message_id = uuidv4();
  const safeTimestamp = timestamp || new Date().toISOString();
  const safeReadChecker = read_checker || "unread";

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Save the message
    const insertMessageQuery = `
      INSERT INTO messages (
        message_id, temp_id, contact_id,
        sender_id, receiver_id, message_text,
        timestamp, read_checker
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const { rows: [savedMessage] } = await client.query(insertMessageQuery, [
      message_id,
      temp_id,
      contact_id,
      sender_id,
      receiver_id,
      message_text,
      safeTimestamp,
      safeReadChecker,
    ]);

    // Get profile picture of receiver (to show in sender's chat_preview)
    const { rows: receiverUserRows } = await client.query(
      "SELECT profile_picture FROM users WHERE user_id = $1",
      [receiver_id]
    );
    const receiverProfilePic = receiverUserRows[0]?.profile_picture || null;

    // Get contact name saved by sender
    const { rows: senderContactRows } = await client.query(
      "SELECT contact_name FROM contacts WHERE user_id = $1 AND contacted_id = $2",
      [sender_id, receiver_id]
    );
    const senderContactName = senderContactRows[0]?.contact_name || "Unknown";

    // UPSERT sender's chat_preview
    await client.query(
      `
      INSERT INTO chat_previews (
        contact_id, profile_picture, contact_name,
        last_text, text_timestamp, sender_id, receiver_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (contact_id) DO UPDATE SET
        profile_picture = EXCLUDED.profile_picture,
        contact_name = EXCLUDED.contact_name,
        last_text = EXCLUDED.last_text,
        text_timestamp = EXCLUDED.text_timestamp,
        sender_id = EXCLUDED.sender_id,
        receiver_id = EXCLUDED.receiver_id;
      `,
      [
        contact_id,
        receiverProfilePic,
        senderContactName,
        message_text,
        safeTimestamp,
        sender_id,
        receiver_id,
      ]
    );

    // Check if receiver has sender as contact
    const { rows: receiverContactRows } = await client.query(
      "SELECT contact_id, contact_name FROM contacts WHERE user_id = $1 AND contacted_id = $2",
      [receiver_id, sender_id]
    );

    let receiverContactName = receiverContactRows[0]?.contact_name;

    if (receiverContactRows.length === 0) {
      // Get sender's username
      const { rows: senderUserRows } = await client.query(
        "SELECT username, profile_picture FROM users WHERE user_id = $1",
        [sender_id]
      );
      const senderUsername = senderUserRows[0]?.username || "Unknown";
      const senderProfilePic = senderUserRows[0]?.profile_picture || null;

      // Create new contact for receiver (receiver saves sender)
      receiverContactName = senderUsername;

      await client.query(
        `INSERT INTO contacts (
          contact_id, user_id, contacted_id, contact_name
        ) VALUES ($1, $2, $3, $4)`,
        [contact_id, receiver_id, sender_id, senderUsername]
      );
    }

    // Get sender's profile picture for receiver's chat preview
    const { rows: senderUserRows } = await client.query(
      "SELECT profile_picture FROM users WHERE user_id = $1",
      [sender_id]
    );
    const senderProfilePic = senderUserRows[0]?.profile_picture || null;

    // UPSERT receiver's chat_preview (using same contact_id but swapped sender/receiver)
    await client.query(
      `
      INSERT INTO chat_previews (
        contact_id, profile_picture, contact_name,
        last_text, text_timestamp, sender_id, receiver_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (contact_id) DO UPDATE SET
        profile_picture = EXCLUDED.profile_picture,
        contact_name = EXCLUDED.contact_name,
        last_text = EXCLUDED.last_text,
        text_timestamp = EXCLUDED.text_timestamp,
        sender_id = EXCLUDED.sender_id,
        receiver_id = EXCLUDED.receiver_id;
      `,
      [
        contact_id,
        senderProfilePic,
        receiverContactName || "Unknown",
        message_text,
        safeTimestamp,
        receiver_id,  // Swapped - receiver's perspective
        sender_id    // Swapped - receiver's perspective
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Message sent and chat previews updated",
      message_id: savedMessage.message_id,
      temp_id,
      savedMessage,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error handling /Send-messages:", err.message);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

module.exports = router;