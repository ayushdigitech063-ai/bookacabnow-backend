// src/controllers/driver.controller.js
const { asyncHandler } = require("../utils/asyncHandler");
const { createApiError } = require("../utils/apiError");
const { sendApiResponse } = require("../utils/apiResponse");
const Vehicle = require("../models/Vehicle.model");
const User = require("../models/User.model");
const Booking = require("../models/Booking.model")
const { calculateDistanceInMeters } = require("../utils/geoUtils");
const { RIDER_FEEDBACK_TAGS, DRIVER_FEEDBACK_TAGS } = require("../constants/ratingReasons");

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
  const { latitude, longitude } = req.body;

  // 1. Validation for presence & valid numbers
  if (latitude === undefined || longitude === undefined) {
    throw createApiError(400, "Driver current latitude and longitude are required");
  }

  const driverLat = Number(latitude);
  const driverLon = Number(longitude);

  if (isNaN(driverLat) || isNaN(driverLon)) {
    throw createApiError(400, "Coordinates must be valid numbers");
  }

  // 2. Fetch active booking
  const booking = await Booking.findOne({
    _id: bookingId,
    driverId: driverId,
  });

  if (!booking) {
    throw createApiError(404, "No matching booking found for this driver");
  }

  // 3. Strict Status Gate
  if (booking.status !== "ACCEPTED") {
    throw createApiError(
      400,
      `Cannot mark arrived. Current ride status is ${booking.status}`
    );
  }

  // 4. Geofencing Calculation (Array format: [lon, lat])
  const driverCoords = [driverLon, driverLat];
  const pickupCoords = booking.pickup.coordinates; // [lon, lat] from DB

  const distanceMeters = calculateDistanceInMeters(driverCoords, pickupCoords);
  const ALLOWED_RADIUS_METERS = 200;

  if (distanceMeters > ALLOWED_RADIUS_METERS) {
    throw createApiError(
      400,
      `You are ${distanceMeters}m away from the pickup point. You must be within ${ALLOWED_RADIUS_METERS}m to mark arrived.`
    );
  }

  // 5. Update Status & Arrived Timestamp
  const arrivedAt = new Date();
  booking.status = "DRIVER_ARRIVED";
  booking.tripTimestamps = {
    ...booking.tripTimestamps,
    arrivedAt,
  };

  await booking.save();

  return sendApiResponse(
    res,
    200,
    {
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      status: booking.status,
      distanceFromPickup: `${distanceMeters} meters`,
      arrivedAt,
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

  const distanceCharge = Math.round(finalDistance * perKmRate);
  const subTotal = baseFare + distanceCharge;

  // 5. Automatic 5% GST
  const GST_PERCENTAGE = 0.05;
  const calculatedGst = Math.round(subTotal * GST_PERCENTAGE);

  // 6. External charges
  const extraTolls = Number(tollCharges) || 0;
  const extraParking = Number(parkingCharges) || 0;
  const totalPhysicalLevies = extraTolls + extraParking;

  // 7. Previous Dues jo is ride me jode gaye the
  const previousDues = booking.pricing?.previousDues || 0;

  // Final Billable Amount jo Rider ko bharna hai
  const totalFare = subTotal + calculatedGst + totalPhysicalLevies + previousDues;

  const finalPaymentMethod = paymentMethod || booking.payment?.method || "CASH";

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
    tollAndTaxes: totalPhysicalLevies,
    gstAmount: calculatedGst,
    previousDues,
    platformFee: 0,
    totalFare,
  };

  booking.payment.method = finalPaymentMethod;
  booking.payment.status = "COMPLETED";
  await booking.save();

  // 8. Financial Settlement
  const driverTripEarnings = subTotal + totalPhysicalLevies; // Driver ki is trip ki actual mehnat

  if (finalPaymentMethod === "CASH") {
    // Rider ne pura cash driver ko thama diya.
    // Agar usme purana previousDues jud ke aaya tha, toh driver par platform ka due chadh gaya:
    const driverUpdate = {
      $set: { "driverDetails.isAvailable": true },
      $inc: { "driverDetails.totalTripsCompleted": 1 },
    };

    if (previousDues > 0) {
      driverUpdate.$inc["driverDetails.cashDuesToPlatform"] = previousDues;
    }

    await User.findByIdAndUpdate(driverId, driverUpdate);
  } else if (finalPaymentMethod === "ONLINE_UPI") {
    // Rider ne online pay kiya (company ke paas aaya)
    // Driver ko uski kamai wallet me credit karo:
    await User.findByIdAndUpdate(driverId, {
      $set: { "driverDetails.isAvailable": true },
      $inc: {
        "driverDetails.totalTripsCompleted": 1,
        "driverDetails.walletBalance": driverTripEarnings,
      },
    });
  }

  // 9. Rider ke outstanding dues ab final clear karo (kyunki usne trip me pay kar diya)
  if (previousDues > 0 && booking.riderId) {
    await User.findByIdAndUpdate(booking.riderId, {
      $inc: { "riderDetails.outstandingDues": -previousDues },
    });
  }

  // 10. Vehicle Unlock
  if (booking.vehicleId) {
    await Vehicle.findByIdAndUpdate(booking.vehicleId, {
      $set: { isAvailable: true },$inc: { totalTripsCompleted: 1 },
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
          settledPreviousDues: previousDues,
          totalBill: totalFare,
        },
      },
      payment: booking.payment,
    },
    "Trip completed and fare settled successfully. Driver and vehicle are now available."
  );
});

// GET /api/v1/drivers/rides/nearby?latitude=26.9124&longitude=75.7873&radiusKm=5
const getNearbyRideRequests = asyncHandler(async (req, res) => {
  const driver = req.user;
  const { latitude, longitude, radiusKm = 5 } = req.query;

  // 1. Coordinates validation
  if (!latitude || !longitude) {
    throw createApiError(400, "Driver latitude and longitude query params are required");
  }

  const driverLat = Number(latitude);
  const driverLon = Number(longitude);

  if (isNaN(driverLat) || isNaN(driverLon)) {
    throw createApiError(400, "Latitude and longitude must be valid numbers");
  }

  // 2. Shift status check (Tumhare existing schema fields)
  if (!driver.driverDetails?.isShiftActive) {
    throw createApiError(400, "Cannot fetch nearby rides while your shift is OFFLINE");
  }

  if (!driver.driverDetails?.isAvailable) {
    throw createApiError(400, "You already have an active ride");
  }

  const maxDistanceMeters = Number(radiusKm) * 1000;

  // 3. Clean Geospatial Aggregation (No useless lookups)
  const nearbyRides = await Booking.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [driverLon, driverLat], // [longitude, latitude]
        },
        distanceField: "distanceToPickupMeters",
        maxDistance: maxDistanceMeters,
        spherical: true,
        query: {
          status: "REQUESTED",
          driverId: null,
        },
      },
    },
    {
      $project: {
        bookingCode: 1,
        status: 1,
        serviceCategory: 1,
        tripType: 1,
        pickup: 1,
        dropoff: 1,
        pricing: 1,
        createdAt: 1,
        distanceToPickupMeters: { $round: ["$distanceToPickupMeters", 0] },
      },
    },
    {
      $sort: { distanceToPickupMeters: 1 },     },     {$limit: 15,
    },
  ]);

  return sendApiResponse(
    res,
    200,
    {
      count: nearbyRides.length,
      rides: nearbyRides,
    },
    `Found ${nearbyRides.length} available ride(s) within ${radiusKm}km.`
  );
});

// src/controllers/driver.controller.js

// GET /api/v1/drivers/earnings
const getDriverEarnings = asyncHandler(async (req, res) => {
  const driverId = req.user._id;

  // 1. Time Filters (Today & Last 7 Days)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const startOfLast7Days = new Date();
  startOfLast7Days.setDate(startOfLast7Days.getDate() - 6);
  startOfLast7Days.setHours(0, 0, 0, 0);

  // 2. Parallel Database Aggregations
  const [driverUser, todayStats, weeklyStats, allTimeStats, recentTrips] = await Promise.all([
    // A. Driver profile (rating & completed trips count)
    User.findById(driverId)
      .select("fullName phone driverDetails.rating driverDetails.totalTripsCompleted")
      .lean(),

    // B. Today's Completed Rides
    Booking.aggregate([
      {
        $match: {
          driverId: driverId,
          status: "COMPLETED",
          updatedAt: { $gte: startOfToday, $lte: endOfToday },
        },
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: "$pricing.totalFare" },
          tripsCount: { $sum: 1 },
        },
      },
    ]),

    // C. Last 7 Days Aggregation
    Booking.aggregate([
      {
        $match: {
          driverId: driverId,
          status: "COMPLETED",
          updatedAt: { $gte: startOfLast7Days, $lte: endOfToday },
        },
      },
      {
        $group: {
          _id: null,
          weeklyEarnings: { $sum: "$pricing.totalFare" },
          weeklyTripsCount: { $sum: 1 },
        },
      },
    ]),

    // D. Lifetime Stats (Saari completed bookings ka direct aggregation)
    Booking.aggregate([
      {
        $match: {
          driverId: driverId,
          status: "COMPLETED",
        },
      },
      {
        $group: {
          _id: null,
          lifetimeEarnings: { $sum: "$pricing.totalFare" },
          lifetimeTripsCount: { $sum: 1 },
        },
      },
    ]),

    // E. Pichli 5 completed trips (Exact schema fields)
    Booking.find({
      driverId: driverId,
      status: "COMPLETED",
    })
      .select("bookingCode serviceCategory tripType pricing.totalFare pricing.estimatedDistanceKm payment.method updatedAt")
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
  ]);

  // 3. Response construct
  const lifetimeTrips = 
    driverUser?.driverDetails?.totalTripsCompleted || 
    allTimeStats[0]?.lifetimeTripsCount || 
    0;

  return sendApiResponse(
    res,
    200,
    {
      driver: {
        fullName: driverUser?.fullName,
        rating: driverUser?.driverDetails?.rating || 5.0,
      },
      summary: {
        today: {
          earnings: todayStats[0]?.totalEarnings || 0,
          tripsCount: todayStats[0]?.tripsCount || 0,
        },
        last7Days: {
          earnings: weeklyStats[0]?.weeklyEarnings || 0,
          tripsCount: weeklyStats[0]?.weeklyTripsCount || 0,
        },
        lifetime: {
          earnings: allTimeStats[0]?.lifetimeEarnings || 0,
          tripsCount: lifetimeTrips,
        },
      },
      recentSettlements: recentTrips.map((trip) => ({
        bookingCode: trip.bookingCode,
        serviceCategory: trip.serviceCategory,
        tripType: trip.tripType,
        amount: trip.pricing?.totalFare || 0,
        distanceKm: trip.pricing?.estimatedDistanceKm || 0,
        paymentMethod: trip.payment?.method || "CASH",
        completedAt: trip.updatedAt,
      })),
    },
    "Driver earnings summary fetched successfully."
  );
});



module.exports = {
  updateDriverShift,
  updateDriverLocation,
  markDriverArrived,
  acceptRideRequest,
  startRide,
  completeRide,
  getNearbyRideRequests,
  getDriverEarnings
  
};