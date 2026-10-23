// src/controllers/booking.controller.js
const { asyncHandler } = require("../utils/asyncHandler");
const { createApiError } = require("../utils/apiError");
const { sendApiResponse } = require("../utils/apiResponse");
const Vehicle = require("../models/Vehicle.model");
const Booking = require("../models/Booking.model");
const User = require("../models/User.model");
const crypto = require("crypto");
const { calculateHaversineDistanceKm } = require("../utils/geoUtils");
const { RIDER_FEEDBACK_TAGS, DRIVER_FEEDBACK_TAGS } = require("../constants/ratingReasons");


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
 
const scheduledPickupTime = pickupDateTime ? new Date(pickupDateTime) : new Date();

  // 1. Prevent overlapping active rides
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

  // 2. Distance calculation
  const estimatedDistanceKm = calculateHaversineDistanceKm(
    pickup.coordinates,
    dropoff.coordinates
  );

  if (estimatedDistanceKm < 0.5) {
    throw createApiError(
      400,
      "Pickup and dropoff locations are too close (minimum 500m required)"
    );
  }

  // 3. Dynamic Fare Calculation
  const rates = CATEGORY_RATES[category] || CATEGORY_RATES.SEDAN;
  const distanceAboveBase = Math.max(0, estimatedDistanceKm - rates.baseKm);
  const distanceCharge = Math.round(distanceAboveBase * rates.perKmRate);
  const currentTripFare = Math.round(rates.baseFare + distanceCharge);

  // Rider ke pending dues sirf read karo (yahan zero nahi karna!)
  const rider = await User.findById(riderId);
  const pendingDues = Number(rider?.riderDetails?.outstandingDues) || 0;
  const totalFare = currentTripFare + pendingDues;

  // 4. Generate Unique Booking Code
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const bookingCode = `BK-${randomSuffix}`;

  // 5. Save Booking
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
    pickupDateTime: scheduledPickupTime,
    pricing: {
      baseFare: rates.baseFare,
      perKmRate: rates.perKmRate,
      estimatedDistanceKm,
      distanceCharge,
      previousDues: pendingDues, // Track rakha ki bill me kitne purane dues jode hain
      totalDriverAllowance: 0,
      nightStayAllowance: 0,
      tollAndTaxes: 0,
      platformFee: 0,
      totalFare,
    },
    payment: {
      method: paymentMethod,
      status: "PENDING",
    },
    status: "REQUESTED",
  });

  // NOTE: Yahan outstandingDues ko 0 nahi kiya. Yeh ride complete hone par hi clear hoga!

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
      pickup: newBooking.pickup,
      dropoff: newBooking.dropoff,
    },
    pendingDues > 0
      ? `Ride requested. ₹${pendingDues} previous cancellation fee added to your total fare.`
      : "Ride request created successfully. Waiting for nearby drivers to accept."
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

  // 3. Penalty Logic (Grace period 3 minutes)
  let cancellationFee = 0;
  const GRACE_PERIOD_MINUTES = 3;

  if (booking.status === "ACCEPTED") {
    const acceptedAt = booking.updatedAt;
    const diffMinutes = (new Date().getTime() - new Date(acceptedAt).getTime()) / (1000 * 60);

    if (diffMinutes > GRACE_PERIOD_MINUTES) {
      cancellationFee = 35;
    }
  } else if (booking.status === "DRIVER_ARRIVED") {
    cancellationFee = 50;
  }

  // 4. Update Booking Document
  booking.status = "CANCELLED";
  booking.cancellation = {
    cancelledBy: riderId,
    reason: String(reason).trim(),
    cancellationFee,
  };
  await booking.save();

  // 5. Unlock Driver and Vehicle
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

  // 6. Penalty Handling: Rider par penalty chadhayi (Rollback ka koi jhanjhat nahi kyunki dues create ke time 0 nahi kiye the)
  if (cancellationFee > 0) {
    await User.findByIdAndUpdate(riderId, {
      $inc: { "riderDetails.outstandingDues": cancellationFee },
    });
  }

  // 7. Driver Fuel Compensation
  if (cancellationFee > 0 && booking.driverId) {
    const driverPayout = Math.round(cancellationFee * 0.8); // 80% e.g. ₹40
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
      reason: booking.cancellation.reason,
    },
    cancellationFee > 0
      ? `Ride cancelled. ₹${cancellationFee} penalty added to your dues for your next ride.`
      : "Ride cancelled successfully with zero charges."
  );
});

// GET /api/v1/bookings/my-rides?page=1&limit=10&status=COMPLETED

const getMyRides = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role; // "RIDER", "INDIVIDUAL_DRIVER", "FLEET_DRIVER", "FLEET_OWNER", "ADMIN", "SUPER_ADMIN"
  const { page = 1, limit = 10, status, driverId, vehicleId } = req.query;

  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const limitNumber = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNumber - 1) * limitNumber;

  // 1. Role-based Filter Construction
  const filter = {};

  if (userRole === "INDIVIDUAL_DRIVER" || userRole === "FLEET_DRIVER") {
    // Individual ho ya Fleet Driver, use sirf apni drive ki hui rides dikhengi
    filter.driverId = userId;
  } else if (userRole === "FLEET_OWNER") {
    // Fleet owner ke case me: Uski FleetCompany nikaalo jiska owner ye user hai
    const company = await FleetCompany.findOne({ ownerId: userId });
    if (!company) {
      throw createApiError(404, "No fleet company found registered under this account");
    }

    // Uski company ki sabhi vehicles nikaalo (ownerType: "FLEET", ownerId: company._id)
    const companyVehicles = await Vehicle.find({
      ownerType: "FLEET",
      ownerId: company._id,
    }).select("_id");

    const vehicleIds = companyVehicles.map((v) => v._id);

    // Fleet Owner ko uski company ki saari registered vehicles ki rides dikhengi
    filter.vehicleId = { $in: vehicleIds };

    // Optional drill-down filters for Fleet Owner
    if (driverId) filter.driverId = driverId;
    if (vehicleId) filter.vehicleId = vehicleId;
  } else if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
    // Admin ko platform ki sabhi rides access karne ka right hai
    if (driverId) filter.driverId = driverId;
    if (vehicleId) filter.vehicleId = vehicleId;
  } else {
    // Default: RIDER (Sirf apni book ki hui rides)
    filter.riderId = userId;
  }

  // 2. Status Filter (Optional: "COMPLETED", "CANCELLED", etc.)
  if (status) {
    filter.status = String(status).toUpperCase();
  }

  // 3. Populate Config (Tere actual Vehicle model schema ke exact fields: brand, model, commercialRcNumber)
  let populateConfig = [];

  if (userRole === "INDIVIDUAL_DRIVER" || userRole === "FLEET_DRIVER") {
    // Driver ko: Rider details + Assigned Vehicle specs
    populateConfig = [
      { path: "riderId", select: "fullName phone rating" },
      { 
        path: "vehicleId", 
        select: "brand model category commercialRcNumber fuelType" 
      },
    ];
  } else if (userRole === "FLEET_OWNER" || userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
    // Fleet Owner / Admin ko: Rider, Driver aur Vehicle teeno ki details
    populateConfig = [
      { path: "riderId", select: "fullName phone" },
      { path: "driverId", select: "fullName phone driverDetails.rating" },
      { 
        path: "vehicleId", 
        select: "brand model category commercialRcNumber fuelType" 
      },
    ];
  } else {
    // Rider ko: Driver details aur Vehicle recognition details
    populateConfig = [
      { path: "driverId", select: "fullName phone driverDetails.rating" },
      { 
        path: "vehicleId", 
        select: "brand model category commercialRcNumber" 
      },
    ];
  }

  // 4. Database Query with Pagination
  const [rides, totalRecords] = await Promise.all([
    Booking.find(filter)
      .select(
        "bookingCode status serviceCategory tripType pickup dropoff pricing payment tripTimestamps ratings cancellation vehicleId driverId riderId createdAt"
      )
      .populate(populateConfig)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
    Booking.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalRecords / limitNumber) || 1;

  return sendApiResponse(
    res,
    200,
    {
      rides,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: pageNumber,
        limit: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
    },
    `Fetched ${rides.length} ride(s) successfully.`
  );
});
 
// src/controllers/booking.controller.js

const rateTrip = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { bookingId } = req.params;
  const { rating, reasonTag, customReason } = req.body;

  // 1. Booking fetch
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw createApiError(404, "Booking not found");
  }

  // 2. Status Gate: Sirf COMPLETED ya CANCELLED par review allow hai
  const allowableStatuses = ["COMPLETED", "CANCELLED"];
  if (!allowableStatuses.includes(booking.status)) {
    throw createApiError(
      400,
      `Cannot submit feedback. Trip is currently ${booking.status}. Feedback is only allowed after trip completion or cancellation.`
    );
  }

  // 3. User Identity Check (Rider, Individual Driver, ya Fleet Driver)
  const isRider = String(booking.riderId) === String(userId);
  const isDriver = String(booking.driverId) === String(userId);

  if (!isRider && !isDriver) {
    throw createApiError(403, "You are not authorized to submit feedback for this booking");
  }

  // 4. Duplicate Check
  if (isRider && booking.ratings?.riderFeedback?.score) {
    throw createApiError(400, "You have already submitted feedback for this trip");
  }
  if (isDriver && booking.ratings?.driverFeedback?.score) {
    throw createApiError(400, "You have already submitted feedback for this trip");
  }

  // 5. Validation Rules based on Status
  const score = Number(rating);

  if (booking.status === "COMPLETED") {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw createApiError(400, "Rating must be an integer between 1 and 5 for completed trips");
    }
  } else if (booking.status === "CANCELLED") {
    // Cancelled ride par rating compulsory nahi hai, par agar di hai toh 1 se 3 star hi allow hogi (issue tracking)
    if (rating !== undefined && (!Number.isInteger(score) || score < 1 || score > 3)) {
      throw createApiError(400, "For cancelled trips, feedback rating can only be between 1 and 3 stars");
    }
  }

  // Low rating (< 4 stars) ya Cancelled trip par reason tag enforce karna
  let cleanReasonTag = reasonTag || null;
  let cleanCustomReason = customReason ? String(customReason).trim() : null;

  if (score < 4 || booking.status === "CANCELLED") {
    const allowedTags = isRider ? RIDER_FEEDBACK_TAGS : DRIVER_FEEDBACK_TAGS;

    if (!cleanReasonTag || !allowedTags.includes(cleanReasonTag)) {
      throw createApiError(
        400,
        `Reason tag is mandatory for low ratings or cancelled trips. Allowed tags: ${allowedTags.join(", ")}`
      );
    }

    if (cleanReasonTag === "OTHER" && (!cleanCustomReason || cleanCustomReason.length < 5)) {
      throw createApiError(
        400,
        "When selecting 'OTHER', please provide a reason in customReason (minimum 5 characters)"
      );
    }
  }

  // 6. Save Feedback in Booking Document
  const feedbackData = {
    score: score || 1,
    reasonTag: cleanReasonTag,
    customReason: cleanCustomReason,
    tripStatusAtReview: booking.status,
    ratedAt: new Date(),
  };

  const updatePath = isRider ? "ratings.riderFeedback" : "ratings.driverFeedback";
  booking.set(updatePath, feedbackData);
  await booking.save();

  // 7. Profile Updates (Only for COMPLETED trips)
  if (booking.status === "COMPLETED") {
    if (isRider && booking.driverId) {
      // A. Driver Cumulative Rating Update (Individual ya Fleet Driver dono)
      const driverRatingAggregate = await Booking.aggregate([
        {
          $match: {
            driverId: booking.driverId,
            status: "COMPLETED",
            "ratings.riderFeedback.score": { $exists: true,$ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$ratings.riderFeedback.score" },
          },
        },
      ]);

      if (driverRatingAggregate.length > 0) {
        const updatedDriverRating = Math.round(driverRatingAggregate[0].avgRating * 10) / 10;
        await User.findByIdAndUpdate(booking.driverId, {
          $set: { "driverDetails.rating": updatedDriverRating },
        });
      }

      // B. Fleet Company Rating Update (Agar Driver Fleet se juda hua hai)
      if (booking.fleetCompanyId) {
        const fleetRatingAggregate = await Booking.aggregate([
          {
            $match: {
              fleetCompanyId: booking.fleetCompanyId,
              status: "COMPLETED",
              "ratings.riderFeedback.score": { $exists: true,$ne: null },
            },
          },
          {
            $group: {
              _id: null,
              avgRating: { $avg: "$ratings.riderFeedback.score" },
            },
          },
        ]);

        if (fleetRatingAggregate.length > 0) {
          const updatedFleetRating = Math.round(fleetRatingAggregate[0].avgRating * 10) / 10;
          // FleetCompany model mein average rating update
          await mongoose.model("FleetCompany").findByIdAndUpdate(booking.fleetCompanyId, {
            $set: { rating: updatedFleetRating },
          });
        }
      }
    } else if (isDriver && booking.riderId) {
      // C. Rider Cumulative Rating Update
      const riderRatingAggregate = await Booking.aggregate([
        {
          $match: {
            riderId: booking.riderId,
            status: "COMPLETED",
            "ratings.driverFeedback.score": { $exists: true,$ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$ratings.driverFeedback.score" },
          },
        },
      ]);

      if (riderRatingAggregate.length > 0) {
        const updatedRiderRating = Math.round(riderRatingAggregate[0].avgRating * 10) / 10;
        await User.findByIdAndUpdate(booking.riderId, {
          $set: { "riderDetails.rating": updatedRiderRating },
        });
      }
    }
  }

  return sendApiResponse(
    res,
    200,
    {
      bookingId: booking._id,
      tripStatus: booking.status,
      submittedBy: isRider ? "RIDER" : "DRIVER",
      feedback: feedbackData,
    },
    "Feedback recorded successfully."
  );
});

// GET /api/v1/bookings/:bookingId
// GET /api/v1/bookings/:bookingId
const getBookingDetails = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role; // "RIDER", "INDIVIDUAL_DRIVER", "FLEET_DRIVER", "FLEET_OWNER", "ADMIN", "SUPER_ADMIN"
  const { bookingId } = req.params;

  // 1. Fetch booking with populated references matching your exact models
  const booking = await Booking.findById(bookingId)
  .select("+startOtp")
    .populate("riderId", "fullName phone email")
    .populate({
      path: "driverId",
      select: "fullName phone driverDetails.rating",
    })
    .populate({
      path: "vehicleId",
      select: "brand model category commercialRcNumber fuelType ownerType ownerId",
    })
    .lean();

  if (!booking) {
    throw createApiError(404, "Booking not found");
  }


  const isRider = String(booking.riderId?._id || booking.riderId) === String(userId);
  const isDriver = String(booking.driverId?._id || booking.driverId) === String(userId);
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  let isAuthorizedFleetOwner = false;
  if (userRole === "FLEET_OWNER") {
    const company = await FleetCompany.findOne({ ownerId: userId }).select("_id");
    if (
      company &&
      booking.vehicleId?.ownerType === "FLEET" &&
      String(booking.vehicleId?.ownerId) === String(company._id)
    ) {
      isAuthorizedFleetOwner = true;
    }
  }

  if (!isRider && !isDriver && !isAdmin && !isAuthorizedFleetOwner) {
    throw createApiError(403, "You are not authorized to view this booking's details");
  }

  // =========================================================================
  // 3. PRIVACY & FIELD SANITIZATION GATES
  // =========================================================================

  const isPreTrip = ["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED"].includes(booking.status);
  if (!isRider || !isPreTrip) {
    delete booking.startOtp;
  }

  if (!isAdmin && !isRider) {
    // Email hamesha mask rahega
    if (booking.riderId?.email) {
      delete booking.riderId.email;
    }

    
    const isRideActive = ["ACCEPTED", "DRIVER_ARRIVED", "IN_TRANSIT"].includes(booking.status);

    if (!isRideActive) {
      // REQUESTED state me ya COMPLETED / CANCELLED hone par phone delete
      if (booking.riderId?.phone) {
        delete booking.riderId.phone;
      }
    }
  }

  return sendApiResponse(
    res,
    200,
    { booking },
    "Booking details fetched successfully."
  );
});

// GET /api/v1/bookings/active
const getActiveBooking = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role; // "RIDER", "INDIVIDUAL_DRIVER", "FLEET_DRIVER"

  const activeStatuses = ["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED", "IN_TRANSIT"];

  // 1. Determine query based on role
  const filter = {
    status: { $in: activeStatuses },
  };

  if (userRole === "INDIVIDUAL_DRIVER" || userRole === "FLEET_DRIVER") {
    filter.driverId = userId;
  } else {
    // Rider
    filter.riderId = userId;
  }

  // 2. Fetch the latest active ride
  const activeBooking = await Booking.findOne(filter)
     .select("+startOtp")
    .populate("riderId", "fullName phone")
    .populate("driverId", "fullName phone driverDetails.rating")
    .populate({
      path: "vehicleId",
      select: "brand model category commercialRcNumber currentLocation",
    })
    .sort({ createdAt: -1 })
    .lean();

  if (!activeBooking) {
    return sendApiResponse(
      res,
      200,
      {
        hasActiveRide: false,
        booking: null,
      },
      "No active ongoing ride found."
    );
  }

  // 3. Privacy & OTP Filter
  const isRider = String(activeBooking.riderId?._id || activeBooking.riderId) === String(userId);

  // OTP sirf pre-trip rider ko dikhana hai
  const isPreTrip = ["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED"].includes(activeBooking.status);
  if (!isRider || !isPreTrip) {
    delete activeBooking.startOtp;
  }

  // Agar driver dekh raha hai aur ride abhi accept nahi hui (REQUESTED), phone hide karo
  if (!isRider && activeBooking.status === "REQUESTED") {
    if (activeBooking.riderId?.phone) {
      delete activeBooking.riderId.phone;
    }
  }

  return sendApiResponse(
    res,
    200,
    {
      hasActiveRide: true,
      booking: activeBooking,
    },
    "Active booking retrieved successfully."
  );
});

const cancelRideByDriver = asyncHandler(async (req, res) => {
  const driverId = req.user._id;
  const { bookingId } = req.params;
  const { reason = "RIDER_NO_SHOW" } = req.body;

  // 1. Fetch booking with authorization check
  const booking = await Booking.findOne({ _id: bookingId, driverId });
  if (!booking) {
    throw createApiError(404, "Booking not found or not assigned to you");
  }

  // 2. State guards
  if (booking.status === "COMPLETED" || booking.status === "CANCELLED") {
    throw createApiError(400, `Cannot cancel. Ride is already ${booking.status}`);
  }

  if (booking.status === "IN_TRANSIT") {
    throw createApiError(
      400,
      "Cannot cancel while ride is IN_TRANSIT. Drop rider safely."
    );
  }

  // 3. Penalty Logic: Rider No-Show check (5 min wait check)
  let cancellationFee = 0;
  const now = new Date();
  const MIN_WAIT_MINUTES = 5;

  if (booking.status === "DRIVER_ARRIVED") {
    const arrivedAt = booking.updatedAt;
    const waitTimeMinutes = (now.getTime() - new Date(arrivedAt).getTime()) / (1000 * 60);

    if (waitTimeMinutes >= MIN_WAIT_MINUTES) {
      cancellationFee = 50; // Rider par penalty lagegi
    }
  }

  // 4. Update Booking Document
  booking.status = "CANCELLED";
  booking.cancellation = {
    cancelledBy: driverId,
    reason: String(reason).trim(),
    cancellationFee,
  };
  await booking.save();

  // 5. Driver & Vehicle Unlock
  await User.findByIdAndUpdate(driverId, {
    $set: { "driverDetails.isAvailable": true },
  });

  if (booking.vehicleId) {
    await Vehicle.findByIdAndUpdate(booking.vehicleId, {
      $set: { isAvailable: true },
    });
  }

  // 6. Penalty & Compensation
  if (cancellationFee > 0) {
    // Rider par ₹50 penalty add hui
    await User.findByIdAndUpdate(booking.riderId, {
      $inc: { "riderDetails.outstandingDues": cancellationFee },
    });

    // Driver ke wallet me instant ₹40 credit hua
    const driverPayout = Math.round(cancellationFee * 0.8);
    await User.findByIdAndUpdate(driverId, {
      $inc: { "driverDetails.walletBalance": driverPayout },
    });
  }

  return sendApiResponse(
    res,
    200,
    {
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      status: "CANCELLED",
      cancelledBy: "DRIVER",
      reason: booking.cancellation.reason,
      cancellationFeeChargedToRider: cancellationFee,
      driverCompensationCredited: cancellationFee > 0 ? Math.round(cancellationFee * 0.8) : 0,
    },
    cancellationFee > 0
      ? "Ride cancelled due to rider no-show. ₹40 waiting compensation credited to your wallet."
      : "Ride cancelled by driver with zero charges."
  );
});


module.exports = {
  searchNearbyCabs,
  createBookingRequest,
  cancelRideByRider,
  getMyRides,
  rateTrip,
  getBookingDetails,
  getActiveBooking,
  cancelRideByDriver
};