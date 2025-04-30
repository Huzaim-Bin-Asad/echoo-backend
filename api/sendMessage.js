const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const { pool } = require("../db-create"); // Adjust path if necessary

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

  // Validate required fields
  if (!contact_id || !sender_id || !receiver_id || !message_text || !temp_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const message_id = uuidv4();
  const safeTimestamp = timestamp || new Date().toISOString();
  const safeReadChecker = read_checker || "unread";

  const query = `
    INSERT INTO messages (
      message_id, temp_id, contact_id,
      sender_id, receiver_id, message_text,
      timestamp, read_checker
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;

  try {
    const result = await pool.query(query, [
      message_id,
      temp_id,
      contact_id,
      sender_id,
      receiver_id,
      message_text,
      safeTimestamp,
      safeReadChecker,
    ]);

    console.log("✅ Message saved:", result.rows[0]);

    res.status(201).json({
      message: "Message sent successfully",
      message_id: result.rows[0].message_id,
      temp_id, // include this to help frontend match pending message
      savedMessage: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Error saving message:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
