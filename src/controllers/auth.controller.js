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

  // 1. Duplicate checks
  const existingPhone = await User.findOne({ phone });
  if (existingPhone) {
    throw createApiError(409, "User with this mobile number already exists");
  }

  if (email) {
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      throw createApiError(409, "User with this email already exists");
    }
  }

  // 2. Fleet Company verification if role is FLEET_DRIVER
  if (role === "FLEET_DRIVER") {
    if (!driverDetails?.fleetCompanyId) {
      throw createApiError(
        400,
        "Fleet company ID is required for fleet drivers",
      );
    }
    const company = await FleetCompany.findById(driverDetails.fleetCompanyId);
    if (!company) {
      throw createApiError(404, "Associated Fleet Company does not exist");
    }
  }

  // 3. Build payload aligned with User.model.js
  const userPayload = {
    fullName,
    phone,
    password, // Auto-hashed by pre('save') hook
    role: role || "USER",
    isPhoneVerified: false,
  };

  if (email) {
    userPayload.email = email;
  }

  // Drivers profile setup (driverDetails block)
  if (role === "INDIVIDUAL_DRIVER" || role === "FLEET_DRIVER") {
    userPayload.driverDetails = {
      licenseNumber: driverDetails?.licenseNumber || null,
      licenseExpiry: driverDetails?.licenseExpiry || null,
      aadharNumber: driverDetails?.aadharNumber || null,
      kycStatus: "PENDING",
      rating: 5.0,
      totalTripsCompleted: 0,
      fleetCompanyId:
        role === "FLEET_DRIVER" ? driverDetails.fleetCompanyId : null,
      activeVehicleId: null,
      isShiftActive: false,
      isAvailable: false,
    };
  }

  // 4. Create User
  const newUser = await User.create(userPayload);

  // 5. Verification Email trigger
  if (email && typeof sendVerificationEmail === "function") {
    const verificationToken = crypto.randomBytes(32).toString("hex");
    sendVerificationEmail(email, verificationToken).catch((err) => {
      console.error("[Email Error]:", err.message);
    });
  }

  // 6. Generate JWT Token
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
    "Registration successful.",
  );
});

// ==========================================
// 2. USER LOGIN
// ==========================================
const login = asyncHandler(async (req, res) => {
  const { identifier, phone, email, password } = req.body;
  const loginKey = identifier || email || phone;

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
    throw createApiError(
      403,
      "Your account has been deactivated. Please contact support",
    );
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
    "Logged in successfully",
  );
});

// ==========================================
// 3. EMAIL VERIFICATION
// ==========================================
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

// ==========================================
// 4. GET ME PROFILE
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
        fleetCompany = await FleetCompany.findById(
          user.driverDetails.fleetCompanyId,
        ).select("companyName supportPhone businessAddress isApproved");
      }
      if (user.driverDetails?.activeVehicleId) {
        activeVehicle = await Vehicle.findById(
          user.driverDetails.activeVehicleId,
        );
      }
      break;

    case "INDIVIDUAL_DRIVER": // 👈 Fixed role name here
      if (user.driverDetails?.activeVehicleId) {
        activeVehicle = await Vehicle.findById(
          user.driverDetails.activeVehicleId,
        );
      }
      break;

    case "USER":
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
    "Profile fetched successfully",
  );
});

// ==========================================
// 5. DRIVER SHIFT TOGGLE (PATCH /api/v1/auth/shift)
// ==========================================
const updateDriverShift = asyncHandler(async (req, res) => {
  const { isShiftActive } = req.body;
  const user = req.user;

  if (user.role !== "INDIVIDUAL_DRIVER" && user.role !== "FLEET_DRIVER") {
    throw createApiError(
      403,
      "Only registered drivers can update shift status",
    );
  }

  // 1. Shift ON validations
  if (isShiftActive) {
    if (user.driverDetails?.kycStatus !== "APPROVED") {
      throw createApiError(
        403,
        "Cannot start shift until your KYC status is APPROVED",
      );
    }

    if (!user.driverDetails?.activeVehicleId) {
      throw createApiError(
        400,
        "Cannot start shift without an active assigned vehicle",
      );
    }

    const vehicle = await Vehicle.findById(user.driverDetails.activeVehicleId);
    if (!vehicle) {
      throw createApiError(404, "Assigned vehicle record not found");
    }

    // Car online switch
    vehicle.isOnline = true;
    vehicle.isAvailable = true;
    await vehicle.save();

    user.driverDetails.isShiftActive = true;
    user.driverDetails.isAvailable = true;
  } else {
    // 2. Shift OFF / Duty Stop
    if (user.driverDetails?.activeVehicleId) {
      await Vehicle.findByIdAndUpdate(user.driverDetails.activeVehicleId, {
        isOnline: false,
        isAvailable: false,
      });
    }

    user.driverDetails.isShiftActive = false;
    user.driverDetails.isAvailable = false;
  }

  await user.save();

  return sendApiResponse(
    res,
    200,
    {
      isShiftActive: user.driverDetails.isShiftActive,
      isAvailable: user.driverDetails.isAvailable,
      activeVehicleId: user.driverDetails.activeVehicleId,
    },
    `Shift ${isShiftActive ? "started (ONLINE)" : "ended (OFFLINE)"} successfully`,
  );
});

module.exports = {
  register,
  login,
  verifyEmail,
  getMe,
  updateDriverShift,
};
