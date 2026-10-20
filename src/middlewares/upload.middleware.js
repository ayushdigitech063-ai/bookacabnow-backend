// src/middlewares/upload.middleware.js
const multer = require("multer");
const { createApiError } = require("../utils/apiError");

// Seedha RAM buffer mein store hoga (Disk par file nahi banegi)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const imageTypes = ["image/jpeg", "image/png", "image/webp"];
  const docTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

  // Agar field 'vehicleImages' hai toh sirf images allow karo (No PDF for car showcase)
  if (file.fieldname === "vehicleImages") {
    if (imageTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(
      createApiError(
        400,
        `Invalid file type for '${file.fieldname}'. Showcase photos must be JPG, PNG, or WEBP.`
      ),
      false
    );
  }

  // RC, Insurance, aur baaki documents ke liye PDF + Images dono allow hain
  if (docTypes.includes(file.mimetype)) {
    return cb(null, true);
  }

  return cb(
    createApiError(
      400,
      `Invalid file type for '${file.fieldname}'. Only JPG, PNG, WEBP, and PDF are allowed.`
    ),
    false
  );
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB strict limit per file
  },
  fileFilter,
});

// Named export aur default export dono taaki require karne par koi error na aaye
module.exports = upload;
module.exports.upload = upload;