// src/controllers/vehicle.controller.js
const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle.model");
const FleetCompany = require("../models/FleetCompany.model");
const User = require("../models/User.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary");
const { createApiError } = require("../utils/apiError");
const { asyncHandler } = require("../utils/asyncHandler");

// ==========================================
// 1. ADD VEHICLE BY FLEET OWNER
// POST /api/v1/vehicles/fleet/add
// ==========================================
const addFleetVehicle = asyncHandler(async (req, res) => {
  const user = req.user;

  // 1. Role verification
  if (user.role !== "FLEET_OWNER") {
    throw createApiError(403, "Access denied. Only registered fleet owners can add fleet vehicles.");
  }

  // 2. Locate fleet company profile
  const company = await FleetCompany.findOne({
    $or: [{ userId: user._id }, { ownerUserId: user._id }],
  });
  if (!company) {
    throw createApiError(404, "No registered fleet company profile found associated with this account.");
  }

  // 3. Extract request body fields
  const {
    brand,
    model,
    category,
    baseCity,
    seatingCapacity,
    fuelType,
    transmission,
    commercialRcNumber,
    expectedPerKmRate,
    dailyRate,
    badgeText,
    enabledServices,
    features,
  } = req.body;

  if (!commercialRcNumber) {
    throw createApiError(400, "Commercial RC number is required.");
  }

  const cleanRcNumber = commercialRcNumber.trim().toUpperCase();

  // 4. Duplicate RC check
  const existingVehicle = await Vehicle.findOne({
    commercialRcNumber: cleanRcNumber,
  });
  if (existingVehicle) {
    throw createApiError(409, "A vehicle with this commercial RC number is already registered.");
  }

  // 5. Buffer-based Cloudinary stream uploads
  const showcaseImageUrls = [];

  if (req.body.images) {
    const bodyImages = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    showcaseImageUrls.push(...bodyImages);
  }

  if (req.files?.vehicleImages && Array.isArray(req.files.vehicleImages)) {
    for (const file of req.files.vehicleImages) {
      if (file.buffer) {
        const cloudUrl = await uploadToCloudinary(file.buffer, "vehicles/showcase");
        if (cloudUrl) showcaseImageUrls.push(cloudUrl);
      }
    }
  }

  let rcDocUrl = null;
  if (req.files?.rcFile?.[0]?.buffer) {
    rcDocUrl = await uploadToCloudinary(req.files.rcFile[0].buffer, "vehicles/rc");
  }

  let insuranceDocUrl = null;
  if (req.files?.insuranceFile?.[0]?.buffer) {
    insuranceDocUrl = await uploadToCloudinary(req.files.insuranceFile[0].buffer, "vehicles/insurance");
  }

  // Parse enabledServices and features if received as stringified form-data
  let parsedServices = enabledServices;
  if (typeof enabledServices === "string") {
    try {
      parsedServices = JSON.parse(enabledServices);
    } catch {
      parsedServices = enabledServices.split(",").map((s) => s.trim());
    }
  }

  let parsedFeatures = features;
  if (typeof features === "string") {
    try {
      parsedFeatures = JSON.parse(features);
    } catch {
      parsedFeatures = { hasAC: true, isNonSmoking: true };
    }
  }

  // Both documents must be uploaded to mark documentStatus as SUBMITTED
  const areAllDocsUploaded = Boolean(rcDocUrl && insuranceDocUrl);

  // 6. Create vehicle document
  const vehicle = await Vehicle.create({
    ownerType: "FLEET",
    ownerModel: "FleetCompany",
    ownerId: company._id,
    ownerContact: {
      fullName: company.companyName || user.fullName || "Fleet Owner",
      phone: company.contactDesk?.helplinePhone || user.phone,
    },
    assignedDriverId: null,
    isAssigned: false,
    brand,
    model,
    category,
    baseCity: baseCity || "Jaipur",
    seatingCapacity: Number(seatingCapacity),
    fuelType,
    transmission: transmission ? transmission.toUpperCase() : "MANUAL",
    commercialRcNumber: cleanRcNumber,
    status: "INACTIVE",
    isAvailable: false,
    expectedPerKmRate: Number(expectedPerKmRate),
    dailyRate: dailyRate ? Number(dailyRate) : 0,
    images: showcaseImageUrls,
    complianceDocuments: {
      rcUrl: rcDocUrl,
      insuranceUrl: insuranceDocUrl,
      documentStatus: areAllDocsUploaded ? "SUBMITTED" : "PENDING",
    },
    enabledServices: parsedServices || ["LOCAL_RIDE", "OUTSTATION"],
    features: parsedFeatures || { hasAC: true, isNonSmoking: true },
    badgeText: badgeText || "Verified Cab",
    rating: {
      average: 4.8,
      totalReviews: 0,
    },
  });

  return res.status(201).json({
    success: true,
    message: "Vehicle registered successfully. It will be activated after administrative verification.",
    data: vehicle,
  });
});

// ==========================================
// 2. ADD VEHICLE BY INDIVIDUAL DRIVER
// POST /api/v1/vehicles/individual/add
// ==========================================
const addIndividualVehicle = asyncHandler(async (req, res) => {
  const user = req.user;

  // 1. Role verification
  if (user.role !== "INDIVIDUAL_DRIVER") {
    throw createApiError(403, "Access denied. Only registered individual drivers can add personal vehicles.");
  }

  // 2. Enforce 1-vehicle limit per individual driver
  const existingCar = await Vehicle.findOne({
    ownerType: "INDIVIDUAL",
    ownerId: user._id,
  });
  if (existingCar || user.driverDetails?.activeVehicleId) {
    throw createApiError(400, "You already have a registered vehicle. Individual drivers can only operate one vehicle.");
  }

  // 3. Extract request body fields
  const {
    brand,
    model,
    category,
    baseCity,
    seatingCapacity,
    fuelType,
    transmission,
    commercialRcNumber,
    expectedPerKmRate,
    dailyRate,
    badgeText,
    enabledServices,
    features,
  } = req.body;

  if (!commercialRcNumber) {
    throw createApiError(400, "Commercial RC number is required.");
  }

  const cleanRcNumber = commercialRcNumber.trim().toUpperCase();

  // 4. Duplicate RC check
  const existingRc = await Vehicle.findOne({
    commercialRcNumber: cleanRcNumber,
  });
  if (existingRc) {
    throw createApiError(409, "A vehicle with this commercial RC number is already registered.");
  }

  // 5. Buffer-based Cloudinary stream uploads
  const showcaseImageUrls = [];

  if (req.body.images) {
    const bodyImages = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    showcaseImageUrls.push(...bodyImages);
  }

  if (req.files?.vehicleImages && Array.isArray(req.files.vehicleImages)) {
    for (const file of req.files.vehicleImages) {
      if (file.buffer) {
        const cloudUrl = await uploadToCloudinary(file.buffer, "vehicles/showcase");
        if (cloudUrl) showcaseImageUrls.push(cloudUrl);
      }
    }
  }

  let rcDocUrl = null;
  if (req.files?.rcFile?.[0]?.buffer) {
    rcDocUrl = await uploadToCloudinary(req.files.rcFile[0].buffer, "vehicles/rc");
  }

  let insuranceDocUrl = null;
  if (req.files?.insuranceFile?.[0]?.buffer) {
    insuranceDocUrl = await uploadToCloudinary(req.files.insuranceFile[0].buffer, "vehicles/insurance");
  }

  let parsedServices = enabledServices;
  if (typeof enabledServices === "string") {
    try {
      parsedServices = JSON.parse(enabledServices);
    } catch {
      parsedServices = enabledServices.split(",").map((s) => s.trim());
    }
  }

  let parsedFeatures = features;
  if (typeof features === "string") {
    try {
      parsedFeatures = JSON.parse(features);
    } catch {
      parsedFeatures = { hasAC: true, isNonSmoking: true };
    }
  }

  const areAllDocsUploaded = Boolean(rcDocUrl && insuranceDocUrl);

  // 6. Create vehicle document
  const vehicle = await Vehicle.create({
    ownerType: "INDIVIDUAL",
    ownerModel: "User",
    ownerId: user._id,
    ownerContact: {
      fullName: user.fullName || "Individual Driver",
      phone: user.phone,
    },
    assignedDriverId: user._id,
    isAssigned: true,
    brand,
    model,
    category,
    baseCity: baseCity || "Jaipur",
    seatingCapacity: Number(seatingCapacity),
    fuelType,
    transmission: transmission ? transmission.toUpperCase() : "MANUAL",
    commercialRcNumber: cleanRcNumber,
    status: "INACTIVE",
    isAvailable: false,
    expectedPerKmRate: Number(expectedPerKmRate),
    dailyRate: dailyRate ? Number(dailyRate) : 0,
    images: showcaseImageUrls,
    complianceDocuments: {
      rcUrl: rcDocUrl,
      insuranceUrl: insuranceDocUrl,
      documentStatus: areAllDocsUploaded ? "SUBMITTED" : "PENDING",
    },
    enabledServices: parsedServices || ["LOCAL_RIDE", "OUTSTATION"],
    features: parsedFeatures || { hasAC: true, isNonSmoking: true },
    badgeText: badgeText || "Verified Cab",
    rating: {
      average: 4.8,
      totalReviews: 0,
    },
  });

  // Link vehicle to driver profile
  await User.findByIdAndUpdate(user._id, {
    $set: {
      "driverDetails.activeVehicleId": vehicle._id,
    },
  });

  return res.status(201).json({
    success: true,
    message: "Vehicle registered successfully. It will be activated after administrative verification.",
    data: vehicle,
  });
});

// ==========================================
// 3. GET MY FLEET VEHICLES
// GET /api/v1/vehicles/fleet/my-vehicles
// ==========================================
const getMyFleetVehicles = asyncHandler(async (req, res) => {
  const user = req.user;

  const company = await FleetCompany.findOne({
    $or: [{ userId: user._id }, { ownerUserId: user._id }],
  });
  if (!company) {
    throw createApiError(404, "Fleet company profile not found.");
  }

  const vehicles = await Vehicle.find({ ownerId: company._id }).populate(
    "assignedDriverId",
    "fullName phone driverDetails.kycStatus driverDetails.rating"
  );

  return res.status(200).json({
    success: true,
    message: "Fleet vehicles retrieved successfully.",
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

  const company = await FleetCompany.findOne({
    $or: [{ userId: req.user._id }, { ownerUserId: req.user._id }],
  });
  if (!company) {
    throw createApiError(404, "Fleet company profile not found.");
  }

  const vehicle = await Vehicle.findOne({
    _id: vehicleId,
    ownerId: company._id,
  });
  if (!vehicle) {
    throw createApiError(404, "Vehicle not found in your fleet inventory.");
  }

  const driver = await User.findOne({
    _id: driverId,
    role: "FLEET_DRIVER",
    "driverDetails.fleetCompanyId": company._id,
  });

  if (!driver) {
    throw createApiError(400, "The specified driver is not registered under your fleet company.");
  }

  vehicle.assignedDriverId = driver._id;
  vehicle.isAssigned = true;
  await vehicle.save();

  await User.findByIdAndUpdate(driver._id, {
    $set: {
      "driverDetails.activeVehicleId": vehicle._id,
    },
  });

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

  if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
    throw createApiError(400, "Invalid vehicle ID format in request URL.");
  }

  const hasFiles = req.files && (req.files.rcFile || req.files.insuranceFile);
  const hasDates = insuranceExpiry || fitnessExpiry;

  if (!hasFiles && !hasDates) {
    throw createApiError(
      400,
      "Payload empty. Provide at least one document file (rcFile/insuranceFile) or expiry date."
    );
  }

  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    throw createApiError(404, "Vehicle not found.");
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
    throw createApiError(403, "Access denied. You do not have permission to modify this vehicle.");
  }

  let rcUrl = vehicle.complianceDocuments?.rcUrl;
  let insuranceUrl = vehicle.complianceDocuments?.insuranceUrl;

  if (req.files?.rcFile?.[0]?.buffer) {
    if (rcUrl) await deleteFromCloudinary(rcUrl);
    rcUrl = await uploadToCloudinary(req.files.rcFile[0].buffer, "vehicles/rc");
  }

  if (req.files?.insuranceFile?.[0]?.buffer) {
    if (insuranceUrl) await deleteFromCloudinary(insuranceUrl);
    insuranceUrl = await uploadToCloudinary(req.files.insuranceFile[0].buffer, "vehicles/insurance");
  }

  const existingDocs = vehicle.complianceDocuments || {};
  const finalRcUrl = rcUrl || existingDocs.rcUrl;
  const finalInsuranceUrl = insuranceUrl || existingDocs.insuranceUrl;
  const areAllDocsComplete = Boolean(finalRcUrl && finalInsuranceUrl);

  vehicle.complianceDocuments = {
    rcUrl: finalRcUrl,
    insuranceUrl: finalInsuranceUrl,
    insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : existingDocs.insuranceExpiry,
    fitnessExpiry: fitnessExpiry ? new Date(fitnessExpiry) : existingDocs.fitnessExpiry,
    documentStatus: areAllDocsComplete ? "SUBMITTED" : "PENDING",
    rejectionReason: areAllDocsComplete ? null : existingDocs.rejectionReason,
    verifiedAt: null,
  };

  await vehicle.save();

  return res.status(200).json({
    success: true,
    message: "Vehicle compliance documents updated successfully.",
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

  if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
    throw createApiError(400, "Invalid vehicle ID format in request URL.");
  }

  if (!["APPROVED", "REJECTED"].includes(status)) {
    throw createApiError(400, "Status must be either APPROVED or REJECTED.");
  }

  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    throw createApiError(404, "Vehicle not found.");
  }

  if (!vehicle.complianceDocuments?.rcUrl && !vehicle.complianceDocuments?.insuranceUrl) {
    throw createApiError(400, "Cannot verify vehicle. No compliance documents have been uploaded.");
  }

  const isApproved = status === "APPROVED";

  // 1. Update compliance documents block
  vehicle.complianceDocuments.documentStatus = status;
  vehicle.complianceDocuments.verifiedAt = new Date();
  vehicle.complianceDocuments.verifiedBy = adminUser._id;
  vehicle.complianceDocuments.rejectionReason = !isApproved ? rejectionReason : null;

  // 2. Synchronize vehicle marketplace visibility
  vehicle.status = isApproved ? "ACTIVE" : "BLOCKED";
  vehicle.isAvailable = isApproved;

  await vehicle.save();

  // 3. Sync individual driver KYC profile if applicable
  let driverKycSynced = false;
  if (vehicle.ownerType === "INDIVIDUAL" && vehicle.ownerId) {
    const driver = await User.findById(vehicle.ownerId);
    if (driver && driver.role === "INDIVIDUAL_DRIVER") {
      driver.driverDetails.kycStatus = isApproved ? "APPROVED" : "REJECTED";
      driver.driverDetails.rejectionReason = !isApproved ? rejectionReason : null;

      await driver.save();
      driverKycSynced = true;
    }
  }

  return res.status(200).json({
    success: true,
    message: `Vehicle documents marked as ${status}${driverKycSynced ? " and driver KYC synchronized." : "."}`,
    data: {
      vehicleId: vehicle._id,
      commercialRcNumber: vehicle.commercialRcNumber,
      status: vehicle.status,
      isAvailable: vehicle.isAvailable,
      complianceDocuments: vehicle.complianceDocuments,
      driverKycSynced,
    },
  });
});

// ==========================================
// 7. DELETE VEHICLE & CLOUDINARY CLEANUP
// DELETE /api/v1/vehicles/:vehicleId
// ==========================================
const deleteVehicle = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const user = req.user;

  if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
    throw createApiError(400, "Invalid vehicle ID format.");
  }

  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    throw createApiError(404, "Vehicle not found.");
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
    throw createApiError(403, "Access denied. You do not have permission to delete this vehicle.");
  }

  // 1. Delete showcase images from Cloudinary
  if (vehicle.images && vehicle.images.length > 0) {
    for (const imgUrl of vehicle.images) {
      await deleteFromCloudinary(imgUrl);
    }
  }

  // 2. Delete legal documents from Cloudinary
  if (vehicle.complianceDocuments?.rcUrl) {
    await deleteFromCloudinary(vehicle.complianceDocuments.rcUrl);
  }
  if (vehicle.complianceDocuments?.insuranceUrl) {
    await deleteFromCloudinary(vehicle.complianceDocuments.insuranceUrl);
  }

  // 3. Remove record from database
  await Vehicle.findByIdAndDelete(vehicleId);

  // 4. Remove active vehicle assignment from individual driver profile
  if (vehicle.ownerType === "INDIVIDUAL") {
    await User.findByIdAndUpdate(vehicle.ownerId, {
      $unset: {
        "driverDetails.activeVehicleId": 1,
      },
    });
  }

  return res.status(200).json({
    success: true,
    message: "Vehicle and all associated cloud assets deleted successfully.",
  });
});

module.exports = {
  addFleetVehicle,
  addIndividualVehicle,
  getMyFleetVehicles,
  assignVehicleToDriver,
  updateVehicleDocuments,
  verifyVehicleDocuments,
  deleteVehicle,
};