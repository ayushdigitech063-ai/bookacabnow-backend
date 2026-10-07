// src/controllers/booking.controller.js
const { asyncHandler } = require("../utils/asyncHandler");
const { createApiError } = require("../utils/apiError");
const { sendApiResponse } = require("../utils/apiResponse");
const Vehicle = require("../models/Vehicle.model");
const Booking = require("../models/Booking.model");
const crypto = require("crypto");
const { calculateHaversineDistanceKm } = require("../utils/geoUtils");
const CATEGORY_RATES = {
  BIKE: { baseFare: 20, perKmRate: 7, baseKm: 2 },
  AUTO: { baseFare: 30, perKmRate: 10, baseKm: 2 },
  HATCHBACK: { baseFare: 50, perKmRate: 12, baseKm: 3 },
  SEDAN: { baseFare: 70, perKmRate: 14, baseKm: 3 },
  SUV: { baseFare: 100, perKmRate: 18, baseKm: 3 },
};

// ==========================================
// SEARCH NEARBY AVAILABLE CABS (REAL-TIME)
// POST /api/v1/bookings/search-cabs
// ==========================================
// ==========================================
const searchNearbyCabs = asyncHandler(async (req, res) => {
  const {
    pickupCoordinates,
    dropCoordinates,
    serviceCategory = "LOCAL_RIDE",
    category,
    radiusInKm = 5,
  } = req.body;

  if (!pickupCoordinates || !Array.isArray(pickupCoordinates) || pickupCoordinates.length !== 2) {
    throw createApiError(400, "pickupCoordinates [longitude, latitude] are required");
  }

  const [longitude, latitude] = pickupCoordinates.map(Number);
  const maxDistanceInMeters = Number(radiusInKm) * 1000;

  // 1. Distance & Fare Matrix (Agar drop location bheji ho)
  let tripDistanceKm = null;
  if (dropCoordinates && Array.isArray(dropCoordinates) && dropCoordinates.length === 2) {
    tripDistanceKm = calculateHaversineDistanceKm(pickupCoordinates, dropCoordinates);
  }

  // 2. Geospatial Query Filters
  const matchFilter = {
    status: "ACTIVE",
    isOnline: true,
    isAvailable: true,
    "complianceDocuments.documentStatus": "APPROVED",
    enabledServices: { $in: [serviceCategory] },
  };

  if (category) {
    matchFilter.category = category;
  }

  // 3. Search Cabs & Driver
  const nearbyVehicles = await Vehicle.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        distanceField: "distanceInMeters",
        maxDistance: maxDistanceInMeters,
        spherical: true,
        query: matchFilter,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "assignedDriverId",
        foreignField: "_id",
        as: "driver",
      },
    },
    {
      $unwind: "$driver",
    },
    {
      $match: {
        "driver.driverDetails.isShiftActive": true,
        "driver.driverDetails.kycStatus": "APPROVED",
      },
    },
    {
      // Sirf app ke kaam ki fields
      $project: {
        _id: 1,
        brand: 1,
        model: 1,
        category: 1,
        commercialRcNumber: 1,
        expectedPerKmRate: 1,
        distanceInMeters: { $round: ["$distanceInMeters", 0] },
        driverId: "$driver._id",
        driverName: "$driver.fullName",
        driverPhone: "$driver.phone",
        driverRating: "$driver.driverDetails.rating",
      },
    },
    {
      $sort: { distanceInMeters: 1 },
    },
  ]);

  // 4. Attach Fare Calculation
  const cabs = nearbyVehicles.map((cab) => {
    let estimatedFare = null;

    if (tripDistanceKm) {
      const rates = CATEGORY_RATES[cab.category] || CATEGORY_RATES.SEDAN;
      const ratePerKm = Math.max(rates.perKmRate, cab.expectedPerKmRate || 0);
      const extraKm = Math.max(0, tripDistanceKm - rates.baseKm);
      estimatedFare = Math.round(rates.baseFare + extraKm * ratePerKm);
    }

    return {
      vehicleId: cab._id,
      cabName: `${cab.brand} ${cab.model}`,
      category: cab.category,
      rcNumber: cab.commercialRcNumber,
      driverName: cab.driverName,
      driverPhone: cab.driverPhone,
      driverRating: cab.driverRating || 4.8,
      driverDistanceMeters: cab.distanceInMeters,
      estimatedFare,
    };
  });

  return sendApiResponse(
    res,
    200,
    {
      totalFound: cabs.length,
      tripDistanceKm,
      cabs,
    },
    "Cabs fetched successfully"
  );
});
const createBookingRequest = asyncHandler(async (req, res) => {
  const riderId = req.user._id;
  const {
    serviceCategory,
    tripType,
    pickup,
    dropoff,
    pickupDateTime,
    category,
    paymentMethod = "CASH",
  } = req.body;

  // 1. Prevent overlapping active rides for the same rider
  const existingActiveRide = await Booking.findOne({
    riderId,
    status: { $in: ["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED", "IN_TRANSIT"] },
  });

  if (existingActiveRide) {
    throw createApiError(
      400,
      `You already have an active ride request (${existingActiveRide.bookingCode}) with status ${existingActiveRide.status}`
    );
  }

  // 2. Calculate distance between Pickup & Dropoff
  const estimatedDistanceKm = calculateHaversineDistanceKm(
    pickup.coordinates,
    dropoff.coordinates
  );

  if (estimatedDistanceKm < 0.5) {
    throw createApiError(400, "Pickup and dropoff locations are too close (minimum 500m required)");
  }

  // 3. Dynamic Fare Calculation
  const rates = CATEGORY_RATES[category] || CATEGORY_RATES.SEDAN;
  const distanceAboveBase = Math.max(0, estimatedDistanceKm - rates.baseKm);
  const distanceCharge = Math.round(distanceAboveBase * rates.perKmRate);
  const totalFare = Math.round(rates.baseFare + distanceCharge);

  // 4. Generate Unique Booking Code (e.g., BK-93821)
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const bookingCode = `BK-${randomSuffix}`;

  // 5. Generate 4-digit Cryptographic Start OTP
  // const startOtp = crypto.randomInt(1000, 9999).toString();
  // const startOtp = String(Math.floor(1000 + Math.random() * 9000));

  // 6. Save Booking
  const newBooking = await Booking.create({
    bookingCode,
    riderId,
    serviceCategory,
    tripType,
    pickup: {
      address: pickup.address,
      coordinates: pickup.coordinates,
    },
    dropoff: {
      address: dropoff.address,
      coordinates: dropoff.coordinates,
    },
    pickupDateTime,
    pricing: {
      baseFare: rates.baseFare,
      perKmRate: rates.perKmRate,
      estimatedDistanceKm,
      distanceCharge,
      totalDriverAllowance: 0,
      nightStayAllowance: 0,
      tollAndTaxes: 0,
      platformFee: 0, // 0% commission architecture
      totalFare,
    },
    payment: {
      method: paymentMethod,
      status: "PENDING",
    },
    // startOtp : newBooking.startOtp,
    status: "REQUESTED",
  });

  return sendApiResponse(
    res,
    201,
    {
      bookingId: newBooking._id,
      bookingCode: newBooking.bookingCode,
      status: newBooking.status,
      serviceCategory: newBooking.serviceCategory,
      category,
      estimatedDistanceKm,
      pricing: newBooking.pricing,
      startOtp: newBooking.startOtp, // Returned to rider for trip verification
      pickup: newBooking.pickup,
      dropoff: newBooking.dropoff,
    },
    "Ride request created successfully. Waiting for nearby drivers to accept."
  );
});
// POST /api/v1/bookings/:bookingId/cancel
const cancelRideByRider = asyncHandler(async (req, res) => {
  const riderId = req.user._id;
  const { bookingId } = req.params;
  const { reason = "Change of plans" } = req.body;

  // 1. Fetch booking
  const booking = await Booking.findOne({ _id: bookingId, riderId });
  if (!booking) {
    throw createApiError(404, "Booking not found or unauthorized");
  }

  // 2. State guards
  if (booking.status === "COMPLETED" || booking.status === "CANCELLED") {
    throw createApiError(400, `Cannot cancel. Ride is already ${booking.status}`);
  }

  if (booking.status === "IN_TRANSIT") {
    throw createApiError(
      400,
      "Cannot cancel while ride is IN_TRANSIT. Driver must end trip safely."
    );
  }

  // 3. Penalty Logic
  let cancellationFee = 0;
  const GRACE_PERIOD_MINUTES = 3;

  if (booking.status === "ACCEPTED") {
    const acceptedAt = booking.acceptedAt || booking.updatedAt;
    const diffMinutes = (new Date().getTime() - new Date(acceptedAt).getTime()) / (1000 * 60);

    if (diffMinutes > GRACE_PERIOD_MINUTES) {
      cancellationFee = 35; // Late cancellation charge
    }
  } else if (booking.status === "DRIVER_ARRIVED") {
    cancellationFee = 50; // Driver reached pickup spot
  }

  // 4. Update Booking Document
  booking.status = "CANCELLED";
  booking.cancellation = {
    cancelledBy: riderId,
    reason,
    cancellationFee,
  };
  await booking.save();

  // 5. Unlock Driver and Vehicle (agar assign hue the)
  if (booking.driverId) {
    await User.findByIdAndUpdate(booking.driverId, {
      $set: { "driverDetails.isAvailable": true },
    });
  }

  if (booking.vehicleId) {
    await Vehicle.findByIdAndUpdate(booking.vehicleId, {
      $set: { isAvailable: true },
    });
  }

  // 6. 🚀 Dues Management & Rollback Engine
  const rolledBackDues = booking.pricing?.previousDues || 0;
  const totalDuesToAdd = cancellationFee + rolledBackDues;

  if (totalDuesToAdd > 0) {
    // Rider ke account me penalty + rolled back old dues wapas add karo
    await User.findByIdAndUpdate(riderId, {
      $inc: { "riderDetails.outstandingDues": totalDuesToAdd },
    });
  }

  // 7. Driver Fuel Compensation (agar penalty lagi ho)
  if (cancellationFee > 0 && booking.driverId) {
    const driverPayout = Math.round(cancellationFee * 0.8); // 80% to driver
    await User.findByIdAndUpdate(booking.driverId, {
      $inc: { "driverDetails.walletBalance": driverPayout },
    });
  }

  return sendApiResponse(
    res,
    200,
    {
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      status: booking.status,
      cancellationFee,
      rolledBackPreviousDues: rolledBackDues,
      netOutstandingDuesAdded: totalDuesToAdd,
    },
    totalDuesToAdd > 0
      ? `Ride cancelled. ₹${totalDuesToAdd} added to your outstanding dues for your next ride.`
      : "Ride cancelled successfully with zero charges."
  );
});

module.exports = {
  searchNearbyCabs,
  createBookingRequest,
  cancelRideByRider
};