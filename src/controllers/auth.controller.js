// src/controllers/auth.controller.js
const crypto = require("crypto");
const User = require("../models/User.model");
const FleetCompany = require("../models/FleetCompany.model");
const Vehicle = require("../models/Vehicle.model");
const { asyncHandler } = require("../utils/asyncHandler");
const { createApiError } = require("../utils/apiError");
const { sendApiResponse } = require("../utils/apiResponse");
const { generateToken } = require("../utils/jwt");
const { sendVerificationEmail } = require("../services/email.services");

// ==========================================
// 1. USER REGISTRATION
// ==========================================
const register = asyncHandler(async (req, res) => {
  const { fullName, phone, email, password, role, driverDetails } = req.body;

  if (!fullName || !phone || !password) {
    throw createApiError(400, "Full name, phone, and password are required");
  }

  // 1. Duplicate checks
  const existingPhone = await User.findOne({ phone: phone.trim() });
  if (existingPhone) {
    throw createApiError(409, "User with this mobile number already exists");
  }

  if (email) {
    const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingEmail) {
      throw createApiError(409, "User with this email already exists");
    }
  }

  // 2. Target Role (Default: RIDER)
  const targetRole = role ? role.toUpperCase() : "RIDER";
  const allowedRoles = ["RIDER", "INDIVIDUAL_DRIVER", "FLEET_DRIVER", "FLEET_OWNER", "ADMIN"];
  if (!allowedRoles.includes(targetRole)) {
    throw createApiError(400, `Invalid role '${targetRole}'. Allowed roles: ${allowedRoles.join(", ")}`);
  }

  // 3. Fleet Driver Validation
  if (targetRole === "FLEET_DRIVER") {
    if (!driverDetails?.fleetCompanyId) {
      throw createApiError(400, "Fleet company ID is required for fleet drivers");
    }
    const company = await FleetCompany.findById(driverDetails.fleetCompanyId);
    if (!company) {
      throw createApiError(404, "Associated Fleet Company does not exist");
    }
  }

  // 4. Build payload
  const userPayload = {
    fullName: fullName.trim(),
    phone: phone.trim(),
    password,
    role: targetRole,
    isPhoneVerified: false,
  };

  if (email) {
    userPayload.email = email.trim().toLowerCase();
  }

  if (targetRole === "INDIVIDUAL_DRIVER" || targetRole === "FLEET_DRIVER") {
    userPayload.driverDetails = {
      licenseNumber: driverDetails?.licenseNumber || null,
      licenseExpiry: driverDetails?.licenseExpiry || null,
      aadharNumber: driverDetails?.aadharNumber || null,
      kycStatus: "PENDING",
      rating: 5.0,
      totalTripsCompleted: 0,
      walletBalance: 0,
      cashDuesToPlatform: 0,
      fleetCompanyId: targetRole === "FLEET_DRIVER" ? driverDetails.fleetCompanyId : null,
      activeVehicleId: null,
      isShiftActive: false,
      isAvailable: false,
    };
  }

  const newUser = await User.create(userPayload);

  // Email verification trigger (Non-blocking)
  if (email && typeof sendVerificationEmail === "function") {
    const verificationToken = crypto.randomBytes(32).toString("hex");
    sendVerificationEmail(email, verificationToken).catch((err) => {
      console.error("[Email Error]:", err.message);
    });
  }

  const token = generateToken({
    userId: newUser._id,
    role: newUser.role,
  });

  return sendApiResponse(
    res,
    201,
    {
      user: {
        _id: newUser._id,
        fullName: newUser.fullName,
        phone: newUser.phone,
        email: newUser.email,
        role: newUser.role,
        driverDetails: newUser.driverDetails || null,
      },
      token,
    },
    "Registration successful."
  );
});

// ==========================================
// 2. USER LOGIN
// ==========================================
const login = asyncHandler(async (req, res) => {
  const { identifier, phone, email, password } = req.body;
  const loginKey = (identifier || email || phone || "").trim();

  if (!loginKey || !password) {
    throw createApiError(400, "Please provide phone/email and password");
  }

  const user = await User.findOne({
    $or: [{ phone: loginKey }, { email: loginKey.toLowerCase() }],
  }).select("+password");

  if (!user) {
    throw createApiError(401, "Invalid credentials");
  }

  const isPasswordMatch = await user.comparePassword(password);
  if (!isPasswordMatch) {
    throw createApiError(401, "Invalid credentials");
  }

  if (user.isSuspended) {
    throw createApiError(403, "Your account has been deactivated. Please contact support");
  }

  const token = generateToken({
    userId: user._id,
    role: user.role,
  });

  return sendApiResponse(
    res,
    200,
    {
      user: {
        _id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        driverDetails: user.driverDetails || null,
      },
      token,
    },
    "Logged in successfully"
  );
});

// ==========================================
// 3. GET CURRENT PROFILE
// ==========================================
const getMe = asyncHandler(async (req, res) => {
  const user = req.user;

  let fleetCompany = null;
  let activeVehicle = null;

  switch (user.role) {
    case "FLEET_OWNER":
      fleetCompany = await FleetCompany.findOne({ userId: user._id });
      break;

    case "FLEET_DRIVER":
      if (user.driverDetails?.fleetCompanyId) {
        fleetCompany = await FleetCompany.findById(user.driverDetails.fleetCompanyId).select(
          "companyName supportPhone businessAddress isApproved"
        );
      }
      if (user.driverDetails?.activeVehicleId) {
        activeVehicle = await Vehicle.findById(user.driverDetails.activeVehicleId);
      }
      break;

    case "INDIVIDUAL_DRIVER":
      if (user.driverDetails?.activeVehicleId) {
        activeVehicle = await Vehicle.findById(user.driverDetails.activeVehicleId);
      }
      break;

    case "RIDER":
    case "ADMIN":
    default:
      break;
  }

  return sendApiResponse(
    res,
    200,
    {
      user,
      fleetCompany,
      activeVehicle,
    },
    "Profile fetched successfully"
  );
});
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;

  if (!token) {
    throw createApiError(400, "Verification token is required");
  }

  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw createApiError(400, "Verification token is invalid or has expired");
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  return sendApiResponse(res, 200, null, "Email verified successfully!");
});

module.exports = {
  register,
  login,
  getMe,
  verifyEmail
};