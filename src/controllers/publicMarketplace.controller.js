// src/controllers/publicMarketplace.controller.js
const Vehicle = require("../models/Vehicle.model");
const FleetCompany = require("../models/FleetCompany.model");
const { asyncHandler } = require("../utils/asyncHandler");
const { createApiError } = require("../utils/apiError");

// ==========================================
// 1. GET PUBLIC VEHICLES CATALOG
// GET /api/v1/public/cabs
// Screen: /cars
// ==========================================
const getPublicCabs = asyncHandler(async (req, res) => {
  const {
    search,
    serviceType,
    city,
    brand,
    seatingCapacity,
    fuelType,
    transmission,
    minDailyPrice,
    maxDailyPrice,
    sortBy = "price_asc",
    page = 1,
    limit = 12,
  } = req.query;

  // Active aur Available cabs filter
  const query = {
    status: "ACTIVE",
    isAvailable: true,
  };

  if (search && search.trim() !== "") {
    query.$or = [
      { brand: new RegExp(search.trim(), "i") },
      { model: new RegExp(search.trim(), "i") },
    ];
  }

  if (serviceType && serviceType !== "All Service Types") {
    query.enabledServices = serviceType;
  }

  if (city && city.trim() !== "") {
    query.baseCity = new RegExp(city.trim(), "i");
  }

  if (brand && brand !== "All Vehicle Brands") {
    query.brand = new RegExp(brand.trim(), "i");
  }

  if (fuelType && fuelType !== "All Fuel Types") {
    query.fuelType = fuelType;
  }

  if (transmission && transmission !== "Manual & Automatic") {
    query.transmission = transmission.toUpperCase();
  }

  if (seatingCapacity && seatingCapacity !== "All Capacity Tiers") {
    query.seatingCapacity = Number(seatingCapacity);
  }

  if (minDailyPrice || maxDailyPrice) {
    query.dailyRate = {};
    if (minDailyPrice) query.dailyRate.$gte = Number(minDailyPrice);
    if (maxDailyPrice) query.dailyRate.$lte = Number(maxDailyPrice);
  }

  let sortOption = {};
  if (sortBy === "price_asc") sortOption = { expectedPerKmRate: 1, dailyRate: 1 };
  else if (sortBy === "price_desc") sortOption = { expectedPerKmRate: -1, dailyRate: -1 };
  else if (sortBy === "rating") sortOption = { "rating.average": -1 };
  else sortOption = { createdAt: -1 };

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 12;

  const cabs = await Vehicle.find(query)
    .populate("ownerId", "companyName slug contactDesk logoUrl isVerifiedOperator")
    .sort(sortOption)
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

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

  // Base filter: Sirf active companies
  const query = {
    isActive: true,
  };

  // Agar frontend query me `?verifiedOnly=true` bhejega tabhi sirf verified aayengi, warna saari active companies aayengi
  if (verifiedOnly === "true") {
    query.isVerifiedOperator = true;
  }

  if (search && search.trim() !== "") {
    query.companyName = new RegExp(search.trim(), "i");
  }

  if (city && city !== "All Operating Cities") {
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
// ==========================================
const getCompanyDetailsBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  if (!slug) {
    throw createApiError(400, "Company slug is required.");
  }

  const company = await FleetCompany.findOne({
    slug: slug.trim().toLowerCase(),
    isActive: true,
  }).lean();

  if (!company) {
    throw createApiError(404, "Taxi company profile not found.");
  }

  const fleetVehicles = await Vehicle.find({
    ownerId: company._id,
    status: "ACTIVE",
  });

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

module.exports = {
  getPublicCabs,
  getPublicCompanies,
  getCompanyDetailsBySlug,
};