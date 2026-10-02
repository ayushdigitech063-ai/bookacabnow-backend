const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "cab_saas_platform_secret_key_book_a_cab_now";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const verifyJwtToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

module.exports = {
  generateToken,
  verifyJwtToken
};