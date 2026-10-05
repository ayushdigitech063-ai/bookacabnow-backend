const Vehicle = require("../models/Vehicle.model");
const FleetCompany = require("../models/FleetCompany.model");
const User = require("../models/User.model");

// ==========================================
// 1. ADD VEHICLE BY FLEET OWNER
// POST /api/v1/vehicles/fleet/add
// ==========================================
const addFleetVehicle = async (req, res) => {
  try {
    const user = req.user;

    // Role verification
    if (user.role !== "FLEET_OWNER") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only Fleet Owners can add fleet vehicles.",
      });
    }

    // Find Owner's Registered Fleet Company
    const company = await FleetCompany.findOne({ userId: user._id });
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "No registered fleet company found for this account.",
      });
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
      return res.status(400).json({
        success: false,
        message:
          "Vehicle with this commercial RC number is already registered.",
      });
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
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to add fleet vehicle.",
    });
  }
};

// ==========================================
// 2. ADD VEHICLE BY INDIVIDUAL DRIVER
// POST /api/v1/vehicles/individual/add
// ==========================================
const addIndividualVehicle = async (req, res) => {
  try {
    const user = req.user;

    // Role verification
    if (user.role !== "INDIVIDUAL_DRIVER") {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Only Individual Drivers can register personal vehicles.",
      });
    }

    // Check if driver already has an active vehicle linked
    if (user.driverDetails?.activeVehicleId) {
      return res.status(400).json({
        success: false,
        message:
          "You already have an active registered vehicle. You cannot link another.",
      });
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
      return res.status(400).json({
        success: false,
        message:
          "Vehicle with this commercial RC number is already registered.",
      });
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
      message:
        "Individual vehicle registered and linked to driver profile successfully.",
      data: vehicle,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to register individual vehicle.",
    });
  }
};

// ==========================================
// 3. GET FLEET OWNER'S VEHICLES LIST
// GET /api/v1/vehicles/fleet/my-vehicles
// ==========================================
const getMyFleetVehicles = async (req, res) => {
  try {
    const user = req.user;

    const company = await FleetCompany.findOne({ userId: user._id });
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Fleet company not found.",
      });
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
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch vehicles.",
    });
  }
};

// ==========================================
// 4. ASSIGN FLEET VEHICLE TO DRIVER
// PATCH /api/v1/vehicles/fleet/:vehicleId/assign
// ==========================================
const assignVehicleToDriver = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { driverId } = req.body;

    const company = await FleetCompany.findOne({ userId: req.user._id });
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Fleet company not found.",
      });
    }

    // Verify vehicle belongs to this company
    const vehicle = await Vehicle.findOne({
      _id: vehicleId,
      ownerId: company._id,
    });
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found in your fleet inventory.",
      });
    }

    // Verify driver belongs to this company and is approved
    const driver = await User.findOne({
      _id: driverId,
      role: "FLEET_DRIVER",
      "driverDetails.fleetCompanyId": company._id,
    });

    if (!driver) {
      return res.status(400).json({
        success: false,
        message: "Driver is not registered under your fleet company.",
      });
    }

    // Check KYC status
    if (driver.driverDetails.kycStatus !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message:
          "Driver cannot be assigned a vehicle until KYC status is APPROVED.",
      });
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
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to assign vehicle.",
    });
  }
};

module.exports = {
  addFleetVehicle,
  addIndividualVehicle,
  getMyFleetVehicles,
  assignVehicleToDriver,
};
