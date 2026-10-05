const FleetCompany = require("../models/FleetCompany.model");
const User = require("../models/User.model");
const { asyncHandler } = require("../utils/asyncHandler");
const { createApiError } = require("../utils/apiError");
const { sendApiResponse } = require("../utils/apiResponse");

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
  } = req.body;

  // 1. Check if owner already has a registered agency (userId field)
  const existingCompany = await FleetCompany.findOne({ userId: req.user._id });
  if (existingCompany) {
    throw createApiError(
      409,
      "A Fleet Company is already registered under this account",
    );
  }

  // 2. Check unique GST
  const duplicateGst = await FleetCompany.findOne({ gstNumber });
  if (duplicateGst) {
    throw createApiError(
      409,
      "A company with this GST number is already registered",
    );
  }

  // 3. Create Company profile
  const company = await FleetCompany.create({
    userId: req.user._id,
    companyName,
    contactEmail,
    supportPhone,
    operatingCities: operatingCities || ["Jaipur"],
    businessAddress,
    gstNumber,
    panNumber,
    isApproved: true, // Auto-approved for development/testing phase
    subscription: {
      status: "ACTIVE",
      maxCarSlots: 50,
      activeCarSlotsUsed: 0,
    },
  });

  return sendApiResponse(
    res,
    201,
    company,
    "Fleet company profile created successfully",
  );
});

// ==========================================
// 2. GET CURRENT FLEET COMPANY DETAILS
// GET /api/v1/fleet/my-company
// ==========================================
const getMyCompany = asyncHandler(async (req, res) => {
  const company = await FleetCompany.findOne({ userId: req.user._id });

  if (!company) {
    throw createApiError(
      404,
      "No Fleet Company associated with this account. Please register your agency first",
    );
  }

  return sendApiResponse(
    res,
    200,
    company,
    "Company profile retrieved successfully",
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
    "fullName phone email driverDetails isSuspended createdAt",
  );

  return sendApiResponse(
    res,
    200,
    drivers,
    "Agency drivers retrieved successfully",
  );
});

// ==========================================
// 4. APPROVE OR REJECT FLEET DRIVER
// PATCH /api/v1/fleet/drivers/:driverId/approval
// ==========================================
const updateDriverApproval = asyncHandler(async (req, res) => {
  const { driverId } = req.params;
  const { status } = req.body; // "APPROVED", "REJECTED", "PENDING"

  if (!["APPROVED", "REJECTED", "PENDING"].includes(status)) {
    throw createApiError(400, "Status must be APPROVED, REJECTED, or PENDING");
  }

  let query = { _id: driverId, role: "FLEET_DRIVER" };

  // Fleet Owner can only approve drivers registered under their own company
  if (req.user.role === "FLEET_OWNER") {
    const company = await FleetCompany.findOne({ userId: req.user._id });
    if (!company) {
      throw createApiError(404, "Fleet Company profile not found");
    }
    query["driverDetails.fleetCompanyId"] = company._id;
  }

  const driver = await User.findOne(query);
  if (!driver) {
    throw createApiError(
      404,
      "Driver not found or does not belong to your agency",
    );
  }

  // Update schema-aligned KYC status
  driver.driverDetails.kycStatus = status;

  // Agar reject hua toh shift aur duty reset karo
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
    `Driver status successfully updated to ${status}`,
  );
});

module.exports = {
  registerCompany,
  getMyCompany,
  getAgencyDrivers,
  updateDriverApproval,
};
