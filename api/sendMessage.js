const express = require("express");
const { v4: uuidv4, validate: isUuid } = require("uuid");
const router = express.Router();
const { pool } = require("../db-create");

router.post("/Send-messages", async (req, res) => {
  const {
    contact_id, // Original contact_id from client (UUID format)
    sender_id,
    receiver_id,
    message_text,
    timestamp,
    read_checker,
    temp_id,
  } = req.body;

  console.log("📩 Received message request:", {
    contact_id,
    sender_id,
    receiver_id,
    message_text: message_text?.substring(0, 20) + "...",
    temp_id,
  });

  // Validate UUIDs
  if (!isUuid(contact_id) || !isUuid(sender_id) || !isUuid(receiver_id)) {
    console.error("❌ Invalid UUID format");
    return res.status(400).json({ error: "Invalid UUID format" });
  }

  if (!contact_id || !sender_id || !receiver_id || !message_text || !temp_id) {
    console.error("❌ Missing required fields");
    return res.status(400).json({ error: "Missing required fields" });
  }

  const message_id = uuidv4();
  const safeTimestamp = timestamp || new Date().toISOString();
  const safeReadChecker = read_checker || "unread";

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    console.log("🔵 Transaction begun");

    // Save the message (using original contact_id)
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

    console.log("💾 Message saved:", savedMessage.message_id);

    // Get user details for both users
    console.log("🔍 Fetching user details...");
    const { rows: senderUserRows } = await client.query(
      "SELECT username, profile_picture FROM users WHERE user_id = $1",
      [sender_id]
    );
    const senderUsername = senderUserRows[0]?.username || "Unknown";
    const senderProfilePic = senderUserRows[0]?.profile_picture || null;

    const { rows: receiverUserRows } = await client.query(
      "SELECT username, profile_picture FROM users WHERE user_id = $1",
      [receiver_id]
    );
    const receiverUsername = receiverUserRows[0]?.username || "Unknown";
    const receiverProfilePic = receiverUserRows[0]?.profile_picture || null;

    console.log("👤 User details fetched:", {
      sender: senderUsername,
      receiver: receiverUsername,
    });

    // Generate UUIDs for chat_previews (not composite IDs)
    const senderPreviewId = uuidv4();
    const receiverPreviewId = uuidv4();

    console.log("🆔 Generated chat preview IDs:", {
      senderPreviewId,
      receiverPreviewId,
    });

    // 1. Handle sender's contact and chat preview
    console.log("🔄 Processing sender's contact...");
    const { rows: senderContactRows } = await client.query(
      "SELECT contact_id, contact_name FROM contacts WHERE user_id = $1 AND receiver_id = $2",
      [sender_id, receiver_id]
    );
    
    let senderContactId = senderContactRows[0]?.contact_id;
    let senderContactName = senderContactRows[0]?.contact_name;
    
    if (!senderContactId) {
      senderContactId = senderPreviewId;
      senderContactName = receiverUsername;
      console.log("➕ Creating sender's contact entry");
      await client.query(
        `INSERT INTO contacts (
          contact_id, user_id, receiver_id, contact_name
        ) VALUES ($1, $2, $3, $4)`,
        [senderContactId, sender_id, receiver_id, receiverUsername]
      );
    }

    // Update sender's chat preview
    console.log("💬 Updating sender's chat preview");
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
        senderContactId, // Use the contact's UUID
        receiverProfilePic,
        senderContactName,
        message_text,
        safeTimestamp,
        sender_id,
        receiver_id
      ]
    );
    console.log("✅ Sender's chat preview updated");

    // 2. Handle receiver's contact and chat preview
    console.log("🔄 Processing receiver's contact...");
    const { rows: receiverContactRows } = await client.query(
      "SELECT contact_id, contact_name FROM contacts WHERE user_id = $1 AND  = $2",
      [receiver_id, sender_id]
    );
    
    let receiverContactId = receiverContactRows[0]?.contact_id;
    let receiverContactName = receiverContactRows[0]?.contact_name;
    
    if (!receiverContactId) {
      receiverContactId = receiverPreviewId;
      receiverContactName = senderUsername;
      console.log("➕ Creating receiver's contact entry");
      await client.query(
        `INSERT INTO contacts (
          contact_id, user_id, receiver_id, contact_name
        ) VALUES ($1, $2, $3, $4)`,
        [receiverContactId, receiver_id, sender_id, senderUsername]
      );
    }

    // Update receiver's chat preview
    console.log("💬 Updating receiver's chat preview");
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
        receiverContactId, // Use the contact's UUID
        senderProfilePic,
        receiverContactName,
        message_text,
        safeTimestamp,
        receiver_id,
        sender_id
      ]
    );
    console.log("✅ Receiver's chat preview updated");

    await client.query("COMMIT");
    console.log("🟢 Transaction committed");

    res.status(201).json({
      message: "Message sent and chat previews updated for both users",
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
    console.log("🔴 Connection released");
  }
});

module.exports = router;