const { v4: uuidv4, validate: isUuid } = require("uuid");
const { pool } = require("../db-create");

async function processContactsAndPreviews(sender_id, receiver_id, savedMessage, timestamp) {
  const client = await pool.connect();
  try {
    const [sender, receiver] = await Promise.all([ 
      fetchUserDetails(client, sender_id),
      fetchUserDetails(client, receiver_id),
    ]);

    const [senderContactId, receiverContactId] = await Promise.all([
      ensureContact(client, sender_id, receiver_id, receiver.username),
      ensureContact(client, receiver_id, sender_id, sender.username),
    ]);

    await Promise.all([
      updateChatPreview(client, savedMessage.contact_id, receiver.profile_picture, receiver.username, savedMessage.message_text, timestamp, sender_id, sender_id, receiver_id),
      updateChatPreview(client, receiverContactId, sender.profile_picture, sender.username, savedMessage.message_text, timestamp, receiver_id, receiver_id, sender_id),
    ]);
  } finally {
    client.release();
  }
}

async function fetchUserDetails(client, user_id) {
  const { rows } = await client.query(
    "SELECT username, profile_picture FROM users WHERE user_id = $1",
    [user_id]
  );
  return rows[0] || { username: "Unknown", profile_picture: null };
}

async function ensureContact(client, user_id, contact_user_id, contact_name) {
  const { rows } = await client.query(
    "SELECT contact_id FROM contacts WHERE user_id = $1 AND receiver_id = $2",
    [user_id, contact_user_id]
  );

  if (rows.length) return rows[0].contact_id;

  const newContactId = uuidv4();
  await client.query(`
    INSERT INTO contacts (
      contact_id, user_id, sender_id, receiver_id, contact_name
    ) VALUES ($1, $2, $3, $4, $5)
  `, [newContactId, user_id, user_id, contact_user_id, contact_name]);

  return newContactId;
}

async function updateChatPreview(client, contact_id, profile_picture, contact_name, last_text, text_timestamp, user_id, sender_id, receiver_id) {
  await client.query(`
    INSERT INTO chat_previews (
      contact_id, profile_picture, contact_name,
      last_text, text_timestamp, user_id, sender_id, receiver_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (contact_id) DO UPDATE SET
      profile_picture = EXCLUDED.profile_picture,
      contact_name = EXCLUDED.contact_name,
      last_text = EXCLUDED.last_text,
      text_timestamp = EXCLUDED.text_timestamp,
      sender_id = EXCLUDED.sender_id,
      receiver_id = EXCLUDED.receiver_id;
  `, [contact_id, profile_picture, contact_name, last_text, text_timestamp, user_id, sender_id, receiver_id]);
}


const handleSocketMessage = async (socket, message, clients) => {
  try {
    const { type, contact_id, sender_id, receiver_id, message_text, timestamp, read_checker, temp_id, before, limit = 50, offset = 0 } = message;

    if (type === 'identify') {
      if (!message.user_id || !isUuid(message.user_id)) {
        console.error(`Invalid user_id for identification: ${message.user_id}`);
        socket.send(JSON.stringify({ type: 'error', payload: 'Invalid or missing user_id' }));
        socket.close(1008, 'Invalid user_id');
        return;
      }
      console.log(`User identified: ${message.user_id}`);
      clients.set(message.user_id, socket);
      console.log('Clients map:', Array.from(clients.keys()));
      socket.send(JSON.stringify({ type: 'identified', payload: { user_id: message.user_id } }));
      return;
    }

    if (type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (type === 'send_message') {
      console.log("📩 Incoming message:", {
        contact_id, sender_id, receiver_id,
        message_text: message_text?.slice(0, 20) + "...", temp_id
      });

      if (![contact_id, sender_id, receiver_id, message_text, temp_id].every(Boolean)) {
        console.error('Missing required fields for send_message:', { contact_id, sender_id, receiver_id, message_text, temp_id });
        socket.send(JSON.stringify({
          type: 'error',
          payload: 'Missing required fields',
        }));
        return;
      }

      if (![contact_id, sender_id, receiver_id].every(isUuid)) {
        console.error('Invalid UUID format for send_message:', { contact_id, sender_id, receiver_id });
        socket.send(JSON.stringify({
          type: 'error',
          payload: 'Invalid UUID format',
        }));
        return;
      }

      const message_id = uuidv4();
      const safeTimestamp = timestamp || new Date().toISOString();
      const safeReadChecker = read_checker || "unread";

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const insertMessageQuery = 
          `INSERT INTO messages (
            message_id, temp_id, contact_id,
            sender_id, receiver_id, message_text,
            timestamp, read_checker
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *;`;

        const { rows: [savedMessage] } = await client.query(insertMessageQuery, [
          message_id, temp_id, contact_id,
          sender_id, receiver_id, message_text,
          safeTimestamp, safeReadChecker
        ]);

        await client.query("COMMIT");

        // Send new_message to the receiver, even if offline
        if (receiver_id !== sender_id) {
          if (clients.has(receiver_id)) {
            console.log(`Sending new_message to connected receiver: ${receiver_id}`);
            clients.get(receiver_id).send(JSON.stringify({
              type: "new_message",
              payload: { ...savedMessage, temp_id },
            }));
          } else {
            console.log(`Receiver ${receiver_id} offline; new_message will be delivered on reconnect`);
            // Note: WebSocket may queue or rely on get_messages on reconnect
          }
        } else {
          console.log(`Not sending new_message: receiver_id ${receiver_id} is sender`);
        }

        // Send message_sent to the sender
        socket.send(JSON.stringify({
          type: 'message_sent',
          payload: {
            message_id: savedMessage.message_id,
            temp_id,
            savedMessage
          },
        }));

        try {
          await processContactsAndPreviews(
            sender_id, receiver_id, savedMessage, safeTimestamp
          );
        } catch (bgErr) {
          console.error("⚠️ Background task failed:", bgErr.message);
        }

      } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Message save failed:", err.message);
        socket.send(JSON.stringify({
          type: 'error',
          payload: 'Internal server error',
        }));
      } finally {
        client.release();
      }
    }

    if (type === 'get_messages') {
      if (!sender_id || !receiver_id) {
        console.error('Missing sender_id or receiver_id for get_messages:', { sender_id, receiver_id });
        socket.send(JSON.stringify({
          type: 'error',
          payload: 'Missing sender_id or receiver_id',
        }));
        return;
      }

      let query = 
        `SELECT message_id, temp_id, sender_id, receiver_id, message_text, timestamp, read_checker
        FROM messages
        WHERE 
          (sender_id = $1 AND receiver_id = $2)
          OR
          (sender_id = $2 AND receiver_id = $1)`;
      const queryParams = [sender_id, receiver_id];

      if (before) {
        query += ` AND timestamp < $3`;
        queryParams.push(before);
      }

      query += ` ORDER BY timestamp DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
      queryParams.push(limit, offset);

      try {
        const client = await pool.connect();
        const { rows: messages } = await client.query(query, queryParams);

        const unreadIds = messages
          .filter(msg => msg.receiver_id === sender_id && msg.read_checker !== 'read')
          .map(msg => msg.message_id);

        if (unreadIds.length > 0) {
          await client.query(
            `UPDATE messages SET read_checker = 'read' WHERE message_id = ANY($1::uuid[])`,
            [unreadIds]
          );

          if (clients.has(receiver_id)) {
            clients.get(receiver_id).send(JSON.stringify({
              type: 'read_receipt',
              payload: { reader_id: sender_id, message_ids: unreadIds },
            }));
          }
        }

        client.release();

        socket.send(JSON.stringify({
          type: 'messages',
          payload: { messages: messages.reverse() },
        }));

      } catch (err) {
        console.error('❌ Error fetching messages:', err.message);
        socket.send(JSON.stringify({
          type: 'error',
          payload: 'Failed to fetch messages',
        }));
      }
    }
  } catch (err) {
    console.error('Error handling socket message:', err);
    socket.send(JSON.stringify({
      type: 'error',
      payload: 'Invalid message format or server error',
    }));
  }
};

const handleConnection = (ws, clients) => {
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleSocketMessage(ws, message, clients);
    } catch (err) {
      console.error('Error parsing message:', err);
      ws.send(JSON.stringify({ 
        type: 'error', 
        payload: 'Invalid message format' 
      }));
    }
  });

  ws.on('close', (code, reason) => {
    for (const [userId, socket] of clients.entries()) {
      if (socket === ws) {
        clients.delete(userId);
        console.log(`🚪 User ${userId} disconnected. Code: ${code}, Reason: ${reason || 'Unknown'}`);
        break;
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
};

module.exports = { handleConnection };