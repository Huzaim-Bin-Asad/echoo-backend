const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const { pool } = require("../db-create"); // Adjust path if different

router.post("/Send-messages", async (req, res) => {
  const { contact_id, sender_id, message_text, timestamp, read_checker } = req.body;

  if (!contact_id || !sender_id || !message_text) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const message_id = uuidv4();

  const query = `
    INSERT INTO messages (message_id, contact_id, sender_id, message_text, timestamp, read_checker)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;

  try {
    const result = await pool.query(query, [
      message_id,
      contact_id,
      sender_id,
      message_text,
      timestamp || new Date().toISOString(),
      read_checker || "unread",
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error saving message:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
