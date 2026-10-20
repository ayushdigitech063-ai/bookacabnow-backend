const { verifyJwtToken } = require("../utils/jwt");
const { createApiError } = require("../utils/apiError");
const { asyncHandler } = require("../utils/asyncHandler");
const User = require("../models/User.model");
const FleetCompany = require("../models/FleetCompany.model");

// 1. Verify JWT Token & Attach User Context
const verifyToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw createApiError(401, "Authentication token missing or invalid format");
  }

  const token = authHeader.split(" ")[1];
  let decoded;

  try {
    decoded = verifyJwtToken(token);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw createApiError(401, "Session expired, please login again");
    }
    throw createApiError(401, "Invalid access token");
  }

  const user = await User.findById(decoded.userId);
  if (!user) {
    throw createApiError(401, "User linked to this session does not exist");
  }

  if (user.isBlocked) {
    throw createApiError(
      403,
      "Your account has been deactivated. Please contact support",
    );
  }

  req.user = user;

  // Auto-attach FleetCompany if user is a FLEET_OWNER
  if (user.role === "FLEET_OWNER") {
    const fleet = await FleetCompany.findOne({ ownerUserId: user._id });
    req.fleetCompany = fleet || null;
  }

  next();
});

// 2. Role-Based Access Control (RBAC)
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      throw createApiError(
        403,
        `Access denied. Role '${req.user?.role}' is not authorized to access this resource`,
      );
    }
    next();
  };
};

module.exports = {
  verifyToken,
  authorizeRoles,
};
