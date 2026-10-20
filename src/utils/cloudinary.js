// src/utils/cloudinary.js
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Direct Memory Buffer to Cloudinary Upload (No Local Disk Storage)
 * @param {Buffer} fileBuffer - req.file.buffer ya file.buffer
 * @param {string} folder - Cloudinary folder ka naam (e.g. "vehicles", "companies")
 * @returns {Promise<string|null>} - Cloudinary image secure URL
 */
const uploadToCloudinary = (fileBuffer, folder = "book-a-cab") => {
  return new Promise((resolve, reject) => {
    if (!fileBuffer) {
      return resolve(null);
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "auto",
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary Buffer Upload Error:", error);
          return resolve(null);
        }
        resolve(result.secure_url);
      }
    );

    // Buffer stream ko Cloudinary stream mein bhejna
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Image URL se public_id nikalna taaki use delete kiya ja sake
 * @param {string} imageUrl - e.g. "https://res.cloudinary.com/.../v1234/vehicles/car1.jpg"
 * @returns {string|null} - e.g. "vehicles/car1"
 */
const extractPublicId = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") return null;

  try {
    const parts = imageUrl.split("/");
    const uploadIndex = parts.indexOf("upload");
    if (uploadIndex === -1) return null;

    // "upload/v123456/" ke baad ka path lena aur extension (.jpg/.png) hatana
    const pathWithVersion = parts.slice(uploadIndex + 1).join("/");
    const withoutVersion = pathWithVersion.replace(/^v\d+\//, "");
    const publicId = withoutVersion.substring(0, withoutVersion.lastIndexOf("."));

    return publicId;
  } catch (error) {
    console.error("Cloudinary extractPublicId error:", error);
    return null;
  }
};

/**
 * Cloudinary se image delete karna (URL pass karke)
 * @param {string} imageUrl - Jo image URL MongoDB mein save hai
 * @returns {Promise<boolean>}
 */
const deleteFromCloudinary = async (imageUrl) => {
  try {
    if (!imageUrl) return false;

    const publicId = extractPublicId(imageUrl);
    if (!publicId) return false;

    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === "ok";
  } catch (error) {
    console.error("Cloudinary Delete Error:", error);
    return false;
  }
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
};