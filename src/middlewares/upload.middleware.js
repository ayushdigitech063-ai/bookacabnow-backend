// src/middlewares/upload.middleware.js
const multer = require("multer");
const { createApiError } = require("../utils/apiError");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf"
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      createApiError(
        400,
        `Invalid file type for '${file.fieldname}'. Only JPG, PNG, WEBP and PDF are allowed`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB strict limit
  },
  fileFilter
});

module.exports = upload;