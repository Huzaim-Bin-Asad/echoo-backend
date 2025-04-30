const express = require('express');
const multer = require('multer');
const { uploadToImageKit } = require('./imagekit-upload'); // ✅ Updated import
const { pool } = require('../db-create');
const router = express.Router();

// Multer middleware to handle multipart/form-data
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/upload-profile-picture', upload.single('profilePicture'), async (req, res) => {
  try {
    const file = req.file;
    const userId = req.body.userId;

    if (!file || !userId) {
      return res.status(400).json({ error: 'File and user ID must be provided.' });
    }

    // Upload image to ImageKit
    const uploadResult = await uploadToImageKit(file.buffer, file.originalname);
    const profilePictureUrl = uploadResult.url; // ✅ Use 'url' instead of 'secure_url'

    // Update the user's profile_picture URL in the database
    await pool.query(
      `UPDATE users
       SET profile_picture = $1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [profilePictureUrl, userId]
    );

    res.json({ profilePictureUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
