// src/controllers/fleet.controller.js
const FleetCompany = require("../models/FleetCompany.model");
const User = require("../models/User.model");
const { asyncHandler } = require("../utils/asyncHandler");
const { createApiError } = require("../utils/apiError");
const { sendApiResponse } = require("../utils/apiResponse");

// Helper to generate clean unique slug
const generateSlug = (text) => {
  const baseSlug = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${baseSlug}-${randomSuffix}`;
};

// ==========================================
// 1. REGISTER / SETUP FLEET COMPANY PROFILE
// POST /api/v1/fleet/register
// ==========================================
const registerCompany = asyncHandler(async (req, res) => {
  const {
    companyName,
    contactEmail,
    supportPhone,
    operatingCities,
    businessAddress,
    gstNumber,
    panNumber,
    tagline,
    aboutUs,
  } = req.body;

  if (!companyName) {
    throw createApiError(400, "Company name is required");
  }

  // 1. Check if owner already has a registered agency
  const existingCompany = await FleetCompany.findOne({ userId: req.user._id });
  if (existingCompany) {
    throw createApiError(409, "A Fleet Company is already registered under this account");
  }

  // 2. Check unique GST if provided
  if (gstNumber) {
    const duplicateGst = await FleetCompany.findOne({ gstNumber: gstNumber.trim().toUpperCase() });
    if (duplicateGst) {
      throw createApiError(409, "A company with this GST number is already registered");
    }
  }

  // 3. Auto generate unique slug for /company/:slug frontend routing
  const slug = generateSlug(companyName);

  // 4. Create Company profile
  const company = await FleetCompany.create({
    userId: req.user._id,
    companyName,
    slug,
    tagline: tagline || "Premier taxi service operator offering clean cars and route-expert drivers.",
    aboutUs: aboutUs || "Premier taxi service operator offering clean cars and route-expert drivers.",
    contactEmail: contactEmail || req.user.email,
    supportPhone: supportPhone || req.user.phone,
    operatingCities: operatingCities || ["Jaipur"],
    businessAddress: typeof businessAddress === "object" ? businessAddress : { city: businessAddress || "Jaipur" },
    gstNumber: gstNumber ? gstNumber.trim().toUpperCase() : null,
    panNumber: panNumber ? panNumber.trim().toUpperCase() : null,
    contactDesk: {
      helplinePhone: supportPhone || req.user.phone,
      whatsappNumber: supportPhone || req.user.phone,
      officeAddress: typeof businessAddress === "object" ? `${businessAddress.street || ""}, ${businessAddress.city || "Jaipur"}` : "Main Hub, Jaipur",
      operatingHours: "24 Hours / 7 Days a Week",
    },
    isApproved: true,
    isActive: true,
    subscription: {
      status: "ACTIVE",
      maxCarSlots: 50,
    },
  });

  return sendApiResponse(
    res,
    201,
    company,
    "Fleet company profile created successfully"
  );
});

// ==========================================
// 2. GET CURRENT FLEET COMPANY DETAILS
// GET /api/v1/fleet/my-company
// ==========================================
const getMyCompany = asyncHandler(async (req, res) => {
  const company = await FleetCompany.findOne({ userId: req.user._id });

  if (!company) {
    throw createApiError(404, "No Fleet Company associated with this account. Please register your agency first");
  }

  return sendApiResponse(
    res,
    200,
    company,
    "Company profile retrieved successfully"
  );
});

// ==========================================
// 3. GET DRIVERS OF THIS FLEET
// GET /api/v1/fleet/drivers?status=PENDING
// ==========================================
const getAgencyDrivers = asyncHandler(async (req, res) => {
  const { status = "ALL" } = req.query;
  const company = await FleetCompany.findOne({ userId: req.user._id });

  if (!company) {
    throw createApiError(404, "Fleet Company profile not found");
  }

  const query = {
    role: "FLEET_DRIVER",
    "driverDetails.fleetCompanyId": company._id,
  };

  if (status !== "ALL") {
    query["driverDetails.kycStatus"] = status;
  }

  const drivers = await User.find(query).select(
    "fullName phone email driverDetails isSuspended createdAt"
  );

  return sendApiResponse(
    res,
    200,
    drivers,
    "Agency drivers retrieved successfully"
  );
});

// ==========================================
// 4. UPDATE DRIVER KYC APPROVAL BY FLEET OWNER
// PATCH /api/v1/fleet/drivers/:driverId/approval
// ==========================================
const updateDriverApproval = asyncHandler(async (req, res) => {
  const { driverId } = req.params;
  const { status } = req.body;

  if (!["APPROVED", "REJECTED", "PENDING"].includes(status)) {
    throw createApiError(400, "Status must be APPROVED, REJECTED, or PENDING");
  }

  let query = { _id: driverId, role: "FLEET_DRIVER" };

  if (req.user.role === "FLEET_OWNER") {
    const company = await FleetCompany.findOne({ userId: req.user._id });
    if (!company) {
      throw createApiError(404, "Fleet Company profile not found");
    }
    query["driverDetails.fleetCompanyId"] = company._id;
  }

  const driver = await User.findOne(query);
  if (!driver) {
    throw createApiError(404, "Driver not found or does not belong to your agency");
  }

  driver.driverDetails.kycStatus = status;

  if (status === "REJECTED") {
    driver.driverDetails.isShiftActive = false;
    driver.driverDetails.isAvailable = false;
  }

  await driver.save();

  return sendApiResponse(
    res,
    200,
    {
      driverId: driver._id,
      fullName: driver.fullName,
      kycStatus: driver.driverDetails.kycStatus,
    },
    `Driver status successfully updated to ${status}`
  );
});

module.exports = {
  registerCompany,
  getMyCompany,
  getAgencyDrivers,
  updateDriverApproval,
};