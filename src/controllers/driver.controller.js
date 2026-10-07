// src/controllers/driver.controller.js
const { asyncHandler } = require("../utils/asyncHandler");
const { createApiError } = require("../utils/apiError");
const { sendApiResponse } = require("../utils/apiResponse");
const Vehicle = require("../models/Vehicle.model");
const User = require("../models/User.model");
const Booking = require("../models/Booking.model")

// ==========================================
// 1. DUTY ON / OFF (SHIFT TOGGLE)
// PATCH /api/v1/driver/shift
// ==========================================
const updateDriverShift = asyncHandler(async (req, res) => {
  const { isShiftActive } = req.body;
  const user = req.user;

  // 1. Role validation
  if (user.role !== "INDIVIDUAL_DRIVER" && user.role !== "FLEET_DRIVER") {
    throw createApiError(403, "Only registered drivers can update shift status");
  }

  // ------------------------------------------
  // CASE A: DRIVER GOES ONLINE (DUTY ON)
  // ------------------------------------------
  if (isShiftActive) {
    // 2. Check Driver Personal KYC
    if (user.driverDetails?.kycStatus !== "APPROVED") {
      throw createApiError(403, "Cannot start shift until your KYC status is APPROVED");
    }

    // 3. Check Assigned Vehicle Presence
    if (!user.driverDetails?.activeVehicleId) {
      throw createApiError(400, "Cannot start shift without an active assigned vehicle");
    }

    // 4. Fetch Vehicle Record
    const vehicle = await Vehicle.findById(user.driverDetails.activeVehicleId);
    if (!vehicle) {
      throw createApiError(404, "Assigned vehicle record not found in system");
    }

    // 5. Compliance Check: Vehicle Status
    if (vehicle.status !== "ACTIVE") {
      throw createApiError(
        403,
        `Cannot start shift. Vehicle status is currently ${vehicle.status || "INACTIVE"}. Contact admin.`
      );
    }

    // 6. Compliance Check: Document Status
    if (vehicle.complianceDocuments?.documentStatus !== "APPROVED") {
      throw createApiError(
        403,
        `Cannot start shift. Vehicle documents are ${vehicle.complianceDocuments?.documentStatus || "PENDING"}. Approval required.`
      );
    }

    // 7. Compliance Check: Expiry Dates
    const now = new Date();
    if (
      vehicle.complianceDocuments?.insuranceExpiry &&
      new Date(vehicle.complianceDocuments.insuranceExpiry) <= now
    ) {
      throw createApiError(403, "Cannot start shift. Vehicle insurance has expired.");
    }

    if (
      vehicle.complianceDocuments?.fitnessExpiry &&
      new Date(vehicle.complianceDocuments.fitnessExpiry) <= now
    ) {
      throw createApiError(403, "Cannot start shift. Vehicle fitness certificate has expired.");
    }

    // Pass: Turn Car & Driver ONLINE
    vehicle.isOnline = true;
    vehicle.isAvailable = true;
    await vehicle.save();

    user.driverDetails.isShiftActive = true;
    user.driverDetails.isAvailable = true;
  } else {
    // ------------------------------------------
    // CASE B: DRIVER GOES OFFLINE (DUTY OFF)
    // ------------------------------------------
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
    `Shift ${isShiftActive ? "started (ONLINE)" : "ended (OFFLINE)"} successfully`
  );
});

// ==========================================
// 2. LIVE GPS LOCATION SYNC
// PATCH /api/v1/driver/location
// ==========================================
const updateDriverLocation = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  const user = req.user;

  // 1. Role validation
  if (user.role !== "INDIVIDUAL_DRIVER" && user.role !== "FLEET_DRIVER") {
    throw createApiError(403, "Only registered drivers can update live location");
  }

  // 2. Check if car is linked
  if (!user.driverDetails?.activeVehicleId) {
    throw createApiError(400, "No active assigned vehicle found for this driver");
  }

  // 3. Shift Active Check (Offline driver ki location track nahi karni)
  if (!user.driverDetails?.isShiftActive) {
    throw createApiError(400, "Cannot update location while shift is OFFLINE. Please start shift first.");
  }

  // GeoJSON format standard: [longitude, latitude]
  const coordinates = [Number(longitude), Number(latitude)];
  // 4. Update Vehicle's GeoJSON location (for ride search algorithm)
  await Vehicle.findByIdAndUpdate(user.driverDetails.activeVehicleId, {
    currentLocation: {
      type: "Point",
      coordinates: coordinates,
    },
  });

  return sendApiResponse(
    res,
    200,
    {
      driverId: user._id,
      activeVehicleId: user.driverDetails.activeVehicleId,
      coordinates: coordinates,
    },
    "Driver and vehicle location updated successfully"
  );
});

const acceptRideRequest = asyncHandler(async (req, res) => {
  const driver = req.user;
  const { bookingId } = req.params;

  // Driver duty validation
  if (!driver.driverDetails?.isShiftActive) {
    throw createApiError(400, "Cannot accept ride while your shift is OFFLINE");
  }

  if (!driver.driverDetails?.isAvailable) {
    throw createApiError(400, "You already have an ongoing active ride");
  }

  const activeVehicleId = driver.driverDetails?.activeVehicleId;
  if (!activeVehicleId) {
    throw createApiError(400, "No active assigned vehicle found for this driver");
  }

  // Atomic find and lock to eliminate race conditions
  const updatedBooking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      status: "REQUESTED", // Strictly ensure status is still REQUESTED
    },
    {
      $set: {
        status: "ACCEPTED",
        driverId: driver._id,
        vehicleId: activeVehicleId,
      },
    },
    { new: true }
  ).populate("riderId", "fullName phone rating");

  if (!updatedBooking) {
    throw createApiError(
      409,
      "Ride request is no longer available or was already accepted by another driver"
    );
  }

  // Lock Driver & Vehicle availability
  await User.findByIdAndUpdate(driver._id, {
    "driverDetails.isAvailable": false,
  });

  await Vehicle.findByIdAndUpdate(activeVehicleId, {
    isAvailable: false,
  });

  return sendApiResponse(
    res,
    200,
    {
      bookingId: updatedBooking._id,
      bookingCode: updatedBooking.bookingCode,
      status: updatedBooking.status,
      rider: updatedBooking.riderId,
      pickup: updatedBooking.pickup,
      dropoff: updatedBooking.dropoff,
      pricing: updatedBooking.pricing,
    },
    "Ride accepted successfully. Head to the pickup location."
  );
});

// ==========================================
// 4. DRIVER ARRIVED AT PICKUP POINT
// PATCH /api/v1/driver/rides/:bookingId/arrived
// ==========================================
const markDriverArrived = asyncHandler(async (req, res) => {
  const driverId = req.user._id;
  const { bookingId } = req.params;

  const booking = await Booking.findOne({
    _id: bookingId,
    driverId: driverId,
  });

  if (!booking) {
    throw createApiError(404, "No matching booking found for this driver");
  }

  if (booking.status !== "ACCEPTED") {
    throw createApiError(
      400,
      `Cannot mark arrived. Current ride status is ${booking.status}`
    );
  }

  booking.status = "DRIVER_ARRIVED";
  await booking.save();

  return sendApiResponse(
    res,
    200,
    {
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      status: booking.status,
    },
    "Driver arrived at pickup location. Waiting for rider."
  );
});

const startRide = asyncHandler(async (req, res) => {
  const driverId = req.user._id;
  const { bookingId } = req.params;
  const { otp } = req.body;

  // 1. Fetch booking with secret startOtp included
  const booking = await Booking.findOne({
    _id: bookingId,
    driverId: driverId,
  }).select("+startOtp");

  if (!booking) {
    throw createApiError(404, "Active booking not found for this driver");
  }

  // 2. Strict Status Gate: Driver must be at pickup spot
  if (booking.status !== "DRIVER_ARRIVED") {
    throw createApiError(
      400,
      `Cannot start ride. Current booking status is ${booking.status}. Driver must mark arrived first.`
    );
  }

  // 3. Cryptographic OTP Verification
  if (!booking.startOtp || booking.startOtp !== String(otp).trim()) {
    throw createApiError(400, "Invalid ride start OTP. Please verify with rider.");
  }

  // 4. Update Trip State
  booking.status = "IN_TRANSIT";
  booking.tripTimestamps = {
    ...booking.tripTimestamps,
    startedAt: new Date(),
  };

  // 5. Consume OTP (Remove so it cannot be re-used)
  booking.startOtp = "VERIFIED";

  await booking.save();

  return sendApiResponse(
    res,
    200,
    {
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      status: booking.status,
      tripStartedAt: booking.tripTimestamps.startedAt,
      dropoff: booking.dropoff,
      pricing: booking.pricing,
    },
    "OTP verified successfully. Trip is now IN_TRANSIT."
  );
});


const completeRide = asyncHandler(async (req, res) => {
  const driverId = req.user._id;
  const { bookingId } = req.params;
  const {
    actualDistanceKm,
    tollCharges = 0,
    parkingCharges = 0,
    paymentMethod,
  } = req.body;

  // 1. Fetch active booking
  const booking = await Booking.findOne({
    _id: bookingId,
    driverId: driverId,
  });

  if (!booking) {
    throw createApiError(404, "Active booking not found for this driver");
  }

  // 2. Strict Status Gate
  if (booking.status !== "IN_TRANSIT") {
    throw createApiError(
      400,
      `Cannot complete ride. Current ride status is ${booking.status}`
    );
  }

  // 3. Duration Calculation
  const endedAt = new Date();
  const startedAt = booking.tripTimestamps?.startedAt || endedAt;
  const durationInMinutes = Math.max(
    1,
    Math.round((endedAt.getTime() - new Date(startedAt).getTime()) / (1000 * 60))
  );

  // 4. Distance & Subtotal Math
  const finalDistance =
    Number(actualDistanceKm) || booking.pricing.estimatedDistanceKm || 1;
  const perKmRate = booking.pricing.perKmRate || 14;
  const baseFare = booking.pricing.baseFare || 70;

  // Base ride charge (Driver's pure earnings)
  const distanceCharge = Math.round(finalDistance * perKmRate);
  const subTotal = baseFare + distanceCharge;

  // 5. Automatic 5% GST (Calculated by system on customer invoice)
  const GST_PERCENTAGE = 0.05;
  const calculatedGst = Math.round(subTotal * GST_PERCENTAGE);

  // 6. Physical External Receipts (Added directly to bill)
  const extraTolls = Number(tollCharges) || 0;
  const extraParking = Number(parkingCharges) || 0;
  const totalPhysicalLevies = extraTolls + extraParking;

  // 7. Final Billable Amount
  const totalFare = subTotal + calculatedGst + totalPhysicalLevies;

  // Update Booking State
  booking.status = "COMPLETED";
  booking.tripTimestamps = {
    ...booking.tripTimestamps,
    endedAt,
    actualDurationMinutes: durationInMinutes,
  };

  booking.pricing = {
    ...booking.pricing,
    actualDistanceKm: finalDistance,
    distanceCharge,
    tollAndTaxes: totalPhysicalLevies, // Tolls + Parking receipts
    gstAmount: calculatedGst,          // 5% system GST
    platformFee: 0,                   // 0% platform commission
    totalFare,
  };

  if (paymentMethod) {
    booking.payment.method = paymentMethod;
  }
  booking.payment.status = "COMPLETED";

  await booking.save();

  // 8. UNLOCK RESOURCES: Make Driver & Vehicle available for next rides
await User.findByIdAndUpdate(driverId, {
    $set: {
      "driverDetails.isAvailable": true,
    },
    $inc: {
      "driverDetails.totalTripsCompleted": 1, // Driver ka counter +1
    },
  });

  if (booking.vehicleId) {
    await Vehicle.findByIdAndUpdate(booking.vehicleId, {
      $set: {
        isAvailable: true,
      },
      $inc: {
        totalTripsCompleted: 1, // Vehicle ka counter +1 (agar vehicle schema me bhi ho)
      },
    });
  }

  return sendApiResponse(
    res,
    200,
    {
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      status: booking.status,
      tripSummary: {
        durationInMinutes,
        distanceKm: finalDistance,
        breakdown: {
          baseFare,
          distanceCharge,
          driverGrossEarnings: subTotal,
          gst5Percent: calculatedGst,
          tollCharges: extraTolls,
          parkingCharges: extraParking,
          totalBill: totalFare,
        },
      },
      payment: booking.payment,
    },
    "Trip completed and fare settled successfully. Driver and vehicle are now available."
  );
});


module.exports = {
  updateDriverShift,
  updateDriverLocation,
  markDriverArrived,
  acceptRideRequest,
  startRide,
  completeRide
};