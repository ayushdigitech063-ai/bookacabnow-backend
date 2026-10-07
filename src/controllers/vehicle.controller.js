// src/controllers/vehicle.controller.js
const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle.model");
const FleetCompany = require("../models/FleetCompany.model");
const User = require("../models/User.model");
const { uploadToCloudinary } = require("../utils/cloudinary");
const { createApiError } = require("../utils/apiError");
const { asyncHandler } = require("../utils/asyncHandler");

// ==========================================
// 1. ADD VEHICLE BY FLEET OWNER
// POST /api/v1/vehicles/fleet/add
// ==========================================
const addFleetVehicle = asyncHandler(async (req, res) => {
  const user = req.user;

  // Role verification
  if (user.role !== "FLEET_OWNER") {
    throw createApiError(403, "Access denied. Only Fleet Owners can add fleet vehicles.");
  }

  // Find Owner's Registered Fleet Company
  const company = await FleetCompany.findOne({ userId: user._id });
  if (!company) {
    throw createApiError(404, "No registered fleet company found for this account.");
  }

  const {
    brand,
    model,
    category,
    baseCity,
    seatingCapacity,
    fuelType,
    commercialRcNumber,
    expectedPerKmRate,
    enabledServices,
    features,
  } = req.body;

  // Duplicate RC check
  const existingVehicle = await Vehicle.findOne({
    commercialRcNumber: commercialRcNumber.trim().toUpperCase(),
  });
  if (existingVehicle) {
    throw createApiError(400, "Vehicle with this commercial RC number is already registered.");
  }

  // Create Vehicle linked to FleetCompany
  const vehicle = await Vehicle.create({
    ownerType: "FLEET",
    ownerModel: "FleetCompany",
    ownerId: company._id,
    ownerContact: {
      fullName: user.fullName,
      phone: user.phone,
    },
    assignedDriverId: null,
    isAssigned: false,
    brand,
    model,
    category,
    baseCity: baseCity || "Jaipur",
    seatingCapacity,
    fuelType,
    commercialRcNumber: commercialRcNumber.trim().toUpperCase(),
    expectedPerKmRate,
    enabledServices: enabledServices || ["LOCAL_RIDE"],
    features: features || {},
  });

  return res.status(201).json({
    success: true,
    message: "Fleet vehicle added successfully.",
    data: vehicle,
  });
});

// ==========================================
// 2. ADD VEHICLE BY INDIVIDUAL DRIVER
// POST /api/v1/vehicles/individual/add
// ==========================================
const addIndividualVehicle = asyncHandler(async (req, res) => {
  const user = req.user;

  // Role verification
  if (user.role !== "INDIVIDUAL_DRIVER") {
    throw createApiError(403, "Access denied. Only Individual Drivers can register personal vehicles.");
  }

  // Check if driver already has an active vehicle linked
  if (user.driverDetails?.activeVehicleId) {
    throw createApiError(400, "You already have an active registered vehicle. You cannot link another.");
  }

  const {
    brand,
    model,
    category,
    baseCity,
    seatingCapacity,
    fuelType,
    commercialRcNumber,
    expectedPerKmRate,
    enabledServices,
    features,
  } = req.body;

  // Duplicate RC check
  const existingVehicle = await Vehicle.findOne({
    commercialRcNumber: commercialRcNumber.trim().toUpperCase(),
  });
  if (existingVehicle) {
    throw createApiError(400, "Vehicle with this commercial RC number is already registered.");
  }

  // Create Vehicle linked to User (Driver is self-owner & assigned)
  const vehicle = await Vehicle.create({
    ownerType: "INDIVIDUAL",
    ownerModel: "User",
    ownerId: user._id,
    ownerContact: {
      fullName: user.fullName,
      phone: user.phone,
    },
    assignedDriverId: user._id,
    isAssigned: true,
    brand,
    model,
    category,
    baseCity: baseCity || "Jaipur",
    seatingCapacity,
    fuelType,
    commercialRcNumber: commercialRcNumber.trim().toUpperCase(),
    expectedPerKmRate,
    enabledServices: enabledServices || ["LOCAL_RIDE"],
    features: features || {},
  });

  // Automatically bind vehicle to driver's profile
  await User.findByIdAndUpdate(user._id, {
    "driverDetails.activeVehicleId": vehicle._id,
  });

  return res.status(201).json({
    success: true,
    message: "Individual vehicle registered and linked to driver profile successfully.",
    data: vehicle,
  });
});

// ==========================================
// 3. GET FLEET OWNER'S VEHICLES LIST
// GET /api/v1/vehicles/fleet/my-vehicles
// ==========================================
const getMyFleetVehicles = asyncHandler(async (req, res) => {
  const user = req.user;

  const company = await FleetCompany.findOne({ userId: user._id });
  if (!company) {
    throw createApiError(404, "Fleet company not found.");
  }

  const vehicles = await Vehicle.find({ ownerId: company._id }).populate(
    "assignedDriverId",
    "fullName phone driverDetails.kycStatus driverDetails.rating",
  );

  return res.status(200).json({
    success: true,
    message: "Fleet vehicles fetched successfully.",
    totalCount: vehicles.length,
    data: vehicles,
  });
});

// ==========================================
// 4. ASSIGN FLEET VEHICLE TO DRIVER
// PATCH /api/v1/vehicles/fleet/:vehicleId/assign
// ==========================================
const assignVehicleToDriver = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const { driverId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(vehicleId) || !mongoose.Types.ObjectId.isValid(driverId)) {
    throw createApiError(400, "Invalid vehicle ID or driver ID format.");
  }

  const company = await FleetCompany.findOne({ userId: req.user._id });
  if (!company) {
    throw createApiError(404, "Fleet company not found.");
  }

  // Verify vehicle belongs to this company
  const vehicle = await Vehicle.findOne({
    _id: vehicleId,
    ownerId: company._id,
  });
  if (!vehicle) {
    throw createApiError(404, "Vehicle not found in your fleet inventory.");
  }

  if (vehicle.status !== "ACTIVE" || vehicle.complianceDocuments?.documentStatus !== "APPROVED") {
  throw createApiError(
    400,
    `Cannot assign vehicle. Vehicle status is ${vehicle.status} and document status is ${vehicle.complianceDocuments?.documentStatus || "PENDING"}. Only APPROVED & ACTIVE vehicles can be assigned to drivers.`
  );
}
  // Verify driver belongs to this company and is approved
  const driver = await User.findOne({
    _id: driverId,
    role: "FLEET_DRIVER",
    "driverDetails.fleetCompanyId": company._id,
  });

  if (!driver) {
    throw createApiError(400, "Driver is not registered under your fleet company.");
  }

  // Check KYC status
  if (driver.driverDetails?.kycStatus !== "APPROVED") {
    throw createApiError(400, "Driver cannot be assigned a vehicle until KYC status is APPROVED.");
  }

  // Update vehicle
  vehicle.assignedDriverId = driver._id;
  vehicle.isAssigned = true;
  await vehicle.save();

  // Update driver profile with active vehicle
  driver.driverDetails.activeVehicleId = vehicle._id;
  await driver.save();

  return res.status(200).json({
    success: true,
    message: "Vehicle successfully assigned to driver.",
    data: {
      vehicleId: vehicle._id,
      commercialRcNumber: vehicle.commercialRcNumber,
      assignedDriverId: driver._id,
      driverName: driver.fullName,
    },
  });
});

// ==========================================
// 5. UPDATE VEHICLE COMPLIANCE DOCUMENTS
// PATCH /api/v1/vehicles/:vehicleId/documents
// ==========================================
const updateVehicleDocuments = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const { insuranceExpiry, fitnessExpiry } = req.body;
  const user = req.user;

  // 1. URL ID Format Guard
  if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
    throw createApiError(400, "Invalid vehicle ID format in request URL");
  }

  // 2. Empty Request Guard
  const hasFiles = req.files && (req.files.rcFile || req.files.insuranceFile);
  const hasDates = insuranceExpiry || fitnessExpiry;

  if (!hasFiles && !hasDates) {
    throw createApiError(
      400,
      "Payload empty. Provide at least one document file (rcFile/insuranceFile) or expiry date"
    );
  }

  // 3. Vehicle Existence & Authorization Check
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    throw createApiError(404, "Vehicle not found");
  }

  const isIndividualOwner =
    vehicle.ownerType === "INDIVIDUAL" &&
    vehicle.ownerId.toString() === user._id.toString();

  let isFleetOwner = false;
  if (vehicle.ownerType === "FLEET") {
    const company = await FleetCompany.findOne({
      $or: [{ ownerUserId: user._id }, { userId: user._id }],
    });
    if (company && vehicle.ownerId.toString() === company._id.toString()) {
      isFleetOwner = true;
    }
  }

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!isIndividualOwner && !isFleetOwner && !isAdmin) {
    throw createApiError(403, "Access denied. You do not own this vehicle");
  }

  // 4. Stream Upload to Cloudinary
  let rcUrl = vehicle.complianceDocuments?.rcUrl;
  let insuranceUrl = vehicle.complianceDocuments?.insuranceUrl;

  if (req.files?.rcFile?.[0]) {
    rcUrl = await uploadToCloudinary(req.files.rcFile[0].buffer, "vehicles/rc");
  }

  if (req.files?.insuranceFile?.[0]) {
    insuranceUrl = await uploadToCloudinary(req.files.insuranceFile[0].buffer, "vehicles/insurance");
  }

  // 5. Update Database Record with State Preservation
  const isNewFileUploaded = Boolean(req.files?.rcFile?.[0] || req.files?.insuranceFile?.[0]);
  const existingDocs = vehicle.complianceDocuments || {};

  vehicle.complianceDocuments = {
    rcUrl,
    insuranceUrl,
    insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : existingDocs.insuranceExpiry,
    fitnessExpiry: fitnessExpiry ? new Date(fitnessExpiry) : existingDocs.fitnessExpiry,
    documentStatus: isNewFileUploaded ? "SUBMITTED" : (existingDocs.documentStatus || "PENDING"),
    rejectionReason: isNewFileUploaded ? null : existingDocs.rejectionReason,
    verifiedAt: isNewFileUploaded ? null : existingDocs.verifiedAt,
  };

  await vehicle.save();

  return res.status(200).json({
    success: true,
    message: "Vehicle compliance documents updated successfully",
    data: {
      vehicleId: vehicle._id,
      commercialRcNumber: vehicle.commercialRcNumber,
      complianceDocuments: vehicle.complianceDocuments,
    },
  });
});

// ==========================================
// 6. VERIFY VEHICLE COMPLIANCE DOCUMENTS (ADMIN)
// PATCH /api/v1/vehicles/:vehicleId/verify-documents
// ==========================================
const verifyVehicleDocuments = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const { status, rejectionReason } = req.body;
  const adminUser = req.user;

  // 1. URL ID Format Guard
  if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
    throw createApiError(400, "Invalid vehicle ID format in request URL");
  }

  // 2. Find vehicle
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    throw createApiError(404, "Vehicle not found");
  }

  // 3. Document check
  if (!vehicle.complianceDocuments?.rcUrl && !vehicle.complianceDocuments?.insuranceUrl) {
    throw createApiError(400, "Cannot verify. Vehicle has no uploaded documents");
  }

  // 4. Update vehicle status & audit data
  vehicle.complianceDocuments.documentStatus = status;
  vehicle.complianceDocuments.verifiedAt = new Date();
  vehicle.complianceDocuments.verifiedBy = adminUser._id;
  vehicle.complianceDocuments.rejectionReason = status === "REJECTED" ? rejectionReason : null;

  // Active status synchronization
  vehicle.status = status === "APPROVED" ? "ACTIVE" : "INACTIVE";

  await vehicle.save();

  // =========================================================================
  // 5. AUTO-SYNC DRIVER KYC (FOR INDIVIDUAL_DRIVER)
  // =========================================================================
  let driverKycSynced = false;

  // Agar vehicle individual driver ka hai to ownerId hi driver ka _id hai
  if (vehicle.ownerType === "INDIVIDUAL" && vehicle.ownerId) {
    const driver = await User.findById(vehicle.ownerId);

    // Exact role match: INDIVIDUAL_DRIVER
    if (driver && driver.role === "INDIVIDUAL_DRIVER") {
      const isApproved = status === "APPROVED";

      driver.driverDetails.kycStatus = isApproved ? "APPROVED" : "REJECTED";
      driver.driverDetails.isVerified = isApproved;

      if (status === "REJECTED" && rejectionReason) {
        driver.driverDetails.kycRemarks = rejectionReason;
      }

      await driver.save();
      driverKycSynced = true;
    }
  }

  return res.status(200).json({
    success: true,
    message: `Vehicle documents marked as ${status} successfully${
      driverKycSynced ? " and individual driver KYC synchronized." : "."
    }`,
    data: {
      vehicleId: vehicle._id,
      commercialRcNumber: vehicle.commercialRcNumber,
      status: vehicle.status,
      complianceDocuments: vehicle.complianceDocuments,
      driverKycSynced,
    },
  });
});
module.exports = {
  addFleetVehicle,
  addIndividualVehicle,
  getMyFleetVehicles,
  assignVehicleToDriver,
  updateVehicleDocuments,
  verifyVehicleDocuments,
};