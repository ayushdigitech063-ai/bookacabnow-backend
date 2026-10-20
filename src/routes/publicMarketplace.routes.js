// src/routes/publicMarketplace.routes.js
const express = require("express");
const {
  getPublicCabs,
  getPublicCompanies,
  getCompanyDetailsBySlug,
} = require("../controllers/publicMarketplace.controller");

const router = express.Router();

// 1. Cars search/filter API (/cars screen)
router.get("/cabs", getPublicCabs);

// 2. Operators list API (/companies screen)
router.get("/companies", getPublicCompanies);

// 3. Single company profile + fleet inventory (/company/:slug screen)
router.get("/companies/:slug", getCompanyDetailsBySlug);

module.exports = router;