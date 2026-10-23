const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle.model");
const Booking = require("../models/Booking.model");
const FleetCompany = require("../models/FleetCompany.model");
const { asyncHandler } = require("../utils/asyncHandler");
const { createApiError } = require("../utils/apiError");

// ==========================================
// 1. GET PUBLIC VEHICLES CATALOG
// GET /api/v1/public/cabs
// Screen: /cars (Filtered by /services page)
// ==========================================
const getPublicCabs = asyncHandler(async (req, res) => {
  const {
    search,
    category,
    serviceType,
    city,
    brand,
    seatingCapacity,
    fuelType,
    transmission,
    minPrice,
    maxPrice,
    minDailyPrice,
    maxDailyPrice,
    sortBy = "price_asc",
    page = 1,
    limit = 12,
  } = req.query;

 
  const query = {
    status: "ACTIVE",
    isAvailable: true,
  };


  if (search && search.trim() !== "") {
    const cleanSearch = search.trim();
    query.$or = [
      { brand: new RegExp(cleanSearch, "i") },
      { model: new RegExp(cleanSearch, "i") },
      { slug: new RegExp(cleanSearch.toLowerCase(), "i") },
    ];
  }


  if (category && category !== "All Categories" && category !== "all") {
    query.category = category.toUpperCase();
  }


  if (serviceType && serviceType !== "All Service Types" && serviceType !== "all") {
    const upperService = serviceType.toUpperCase();
    if (upperService === "BUS" || upperService === "LUXURY_BUS") {
      // Luxury Tourist Buses card mapping
      query.category = "BUS";
    } else {
      query.enabledServices = upperService;
    }
  }

  if (city && city.trim() !== "" && city !== "All Operating Cities" && city !== "all") {
    query.baseCity = new RegExp(city.trim(), "i");
  }


  if (brand && brand !== "All Vehicle Brands" && brand !== "all") {
    query.brand = new RegExp(brand.trim(), "i");
  }

 
  if (fuelType && fuelType !== "All Fuel Types" && fuelType !== "all") {
    query.fuelType = fuelType.toUpperCase();
  }


  if (transmission && transmission !== "Manual & Automatic" && transmission !== "all") {
    query.transmission = transmission.toUpperCase();
  }


  if (seatingCapacity && seatingCapacity !== "All Capacity Tiers" && seatingCapacity !== "all") {
    query.seatingCapacity = Number(seatingCapacity);
  }

 
  const lowPrice = Number(minPrice || minDailyPrice);
  const highPrice = Number(maxPrice || maxDailyPrice);

  if (!isNaN(lowPrice) || !isNaN(highPrice)) {
    const priceRange = {};
    if (!isNaN(lowPrice)) priceRange.$gte = lowPrice;
    if (!isNaN(highPrice)) priceRange.$lte = highPrice;

   
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { dailyRate: priceRange },
        { expectedPerKmRate: priceRange }
      ]
    });
  }

 
  let sortOption = {};
  if (sortBy === "price_asc") sortOption = { expectedPerKmRate: 1, dailyRate: 1 };
  else if (sortBy === "price_desc") sortOption = { expectedPerKmRate: -1, dailyRate: -1 };
  else if (sortBy === "rating") sortOption = { "rating.average": -1 };
  else sortOption = { createdAt: -1 };

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 12));

 
  const cabs = await Vehicle.find(query)
    .populate({
      path: "ownerId",
      select: "companyName slug contactDesk logoUrl isVerifiedOperator stats",
    })
    .select("-complianceDocuments")
    .sort(sortOption)
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  const totalCount = await Vehicle.countDocuments(query);

  return res.status(200).json({
    success: true,
    message: totalCount > 0 ? "Cabs fetched successfully." : "No cabs found matching your criteria.",
    totalCount,
    currentPage: pageNum,
    totalPages: Math.ceil(totalCount / limitNum),
    data: cabs,
  });
});

// ==========================================
// 2. GET TAXI COMPANIES DIRECTORY
// GET /api/v1/public/companies
// Screen: /companies
// ==========================================
const getPublicCompanies = asyncHandler(async (req, res) => {
  const { search, city, verifiedOnly } = req.query;

  const query = {
    isActive: true,
  };

  if (verifiedOnly === "true") {
    query.isVerifiedOperator = true;
  }

  if (search && search.trim() !== "") {
    query.companyName = new RegExp(search.trim(), "i");
  }

  if (city && city !== "All Operating Cities" && city !== "all") {
    query.operatingCities = new RegExp(city.trim(), "i");
  }

  const companies = await FleetCompany.find(query).lean();

 
  const enhancedCompanies = await Promise.all(
    companies.map(async (company) => {
      const activeFleetCount = await Vehicle.countDocuments({
        ownerId: company._id,
        status: "ACTIVE",
      });

      return {
        ...company,
        activeFleetCount,
      };
    })
  );

  return res.status(200).json({
    success: true,
    message: enhancedCompanies.length > 0 ? "Taxi companies fetched successfully." : "No taxi companies found.",
    totalCount: enhancedCompanies.length,
    data: enhancedCompanies,
  });
});

// ==========================================
// 3. GET COMPANY DETAILS & INVENTORY BY SLUG
// GET /api/v1/public/companies/:slug
// Screen: /companies/:slug
// ==========================================
const getCompanyDetailsBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  if (!slug) {
    throw createApiError(400, "Company identifier (slug or ID) is required.");
  }

  const cleanIdentifier = slug.trim();
  const isObjectId = mongoose.isValidObjectId(cleanIdentifier);

  const query = {
    isActive: true,
    $or: [
      { slug: cleanIdentifier.toLowerCase() },
      ...(isObjectId ? [{ _id: cleanIdentifier }] : []),
    ],
  };

  const company = await FleetCompany.findOne(query).lean();

  if (!company) {
    throw createApiError(404, "Taxi company profile not found.");
  }

  // Company ke under jitni active cars hain unhe specs & amenities ke saath fetch karo
  const fleetVehicles = await Vehicle.find({
    ownerId: company._id,
    status: "ACTIVE",
  })
    .select("-complianceDocuments")
    .lean();

  return res.status(200).json({
    success: true,
    message: "Company details fetched successfully.",
    data: {
      company,
      activeFleetCount: fleetVehicles.length,
      fleet: fleetVehicles,
    },
  });
});

// ==========================================
// 4. GET SINGLE CAB DETAIL & BOOKING DESK
// GET /api/v1/public/cabs/:identifier
// Screen: /cars/:slug
// ==========================================
const getPublicCabDetails = asyncHandler(async (req, res) => {
  const { identifier } = req.params;

  if (!identifier) {
    throw createApiError(400, "Cab identifier (slug or ID) is required.");
  }

  const cleanIdentifier = identifier.trim();
  const isObjectId = mongoose.isValidObjectId(cleanIdentifier);

  const query = {
    status: "ACTIVE",
    $or: [
      { slug: cleanIdentifier.toLowerCase() },
      ...(isObjectId ? [{ _id: cleanIdentifier }] : []),
    ],
  };

  const cab = await Vehicle.findOne(query)
    .populate({
      path: "ownerId",
      select: "companyName slug contactDesk logoUrl isVerifiedOperator stats operatingCities",
    })
    .populate({
      path: "assignedDriverId",
      select: "fullName phone driverDetails.rating driverDetails.totalTripsCompleted driverDetails.experienceYears",
    })
    .select("-complianceDocuments")
    .lean();

  if (!cab) {
    throw createApiError(404, "Cab details not found or cab is currently inactive.");
  }

  
  const recentBookings = await Booking.find({
    vehicleId: cab._id,
    status: "COMPLETED",
    "ratings.riderFeedback.rating": { $exists: true, $gt: 0 },
  })
    .select("ratings.riderFeedback serviceCategory tripType createdAt")
    .populate("riderId", "fullName")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  const reviews = recentBookings.map((b) => ({
    reviewerName: b.riderId?.fullName || "Verified Passenger",
    tripType: b.serviceCategory === "LOCAL_RIDE" ? "City Trip" : b.serviceCategory,
    rating: b.ratings?.riderFeedback?.rating || 5,
    comment:
      b.ratings?.riderFeedback?.customReason ||
      "Clean car and smooth driving experience. Driver was polite and on time.",
    date: b.createdAt,
  }));

  return res.status(200).json({
    success: true,
    message: "Cab details fetched successfully.",
    data: {
      cab,
      reviewsSummary: {
        averageRating: cab.rating?.average || 4.9,
        totalReviews: cab.rating?.totalReviews || reviews.length,
      },
      reviews,
    },
  });
});

module.exports = {
  getPublicCabs,
  getPublicCompanies,
  getCompanyDetailsBySlug,
  getPublicCabDetails,
};