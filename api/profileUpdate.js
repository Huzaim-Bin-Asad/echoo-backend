const express = require('express');
const multer = require('multer');
const { uploadToCloudinary } = require('./cloudinary-upload');
const { pool } = require('../db-create'); // ✅ Destructure pool properly
const router = express.Router();

// Multer middleware to handle multipart/form-data
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/upload-profile-picture', upload.single('profilePicture'), async (req, res) => {
  try {
    const file = req.file;
    const userId = req.body.userId; // 🔥 Get userId from the request body

    if (!file || !userId) {
      return res.status(400).json({ error: 'File and user ID must be provided.' });
    }

    // Upload image to Cloudinary
    const uploadResult = await uploadToCloudinary(file.buffer, file.originalname);

    const profilePictureUrl = uploadResult.secure_url;

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
