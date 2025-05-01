const ImageKit = require('imagekit');
const fs = require('fs');

// Initialize ImageKit instance
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

// Upload function
const uploadToImageKit = (fileBuffer, fileName) => {
  return new Promise((resolve, reject) => {
    // Upload file to ImageKit
    imagekit.upload({
      file: fileBuffer, // File buffer
      fileName: fileName, // File name
      folder: '/profile_pictures', // Directory to upload
      useUniqueFileName: true, // Optional: Use a unique file name
    }, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result); // Return result with URL, metadata, etc.
      }
    });
  });
};

module.exports = { uploadToImageKit };
