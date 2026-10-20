const express = require("express");
const router = express.Router();

const {
  registerCompany,
  getMyCompany,
  getAgencyDrivers,
  updateDriverApproval
} = require("../controllers/fleet.controller");

const { validate } = require("../middlewares/validate.middleware");
const { verifyToken, authorizeRoles } = require("../middlewares/auth.middleware");
const {
  registerFleetCompanySchema,
  updateDriverApprovalSchema
} = require("../validations/fleetCompany.validation");

// 1. Company Profile Endpoints (FLEET_OWNER only)
router.post(
  "/register",
  verifyToken,
  authorizeRoles("FLEET_OWNER"),
  validate(registerFleetCompanySchema),
  registerCompany
);

router.get(
  "/me",
  verifyToken,
  authorizeRoles("FLEET_OWNER"),
  getMyCompany
);

// 2. Driver Management Endpoints
router.get(
  "/drivers",
  verifyToken,
  authorizeRoles("FLEET_OWNER", "ADMIN"),
  getAgencyDrivers
);

router.patch(
  "/drivers/:driverId/approval",
  verifyToken,
  authorizeRoles("FLEET_OWNER", "ADMIN"),
  validate(updateDriverApprovalSchema),
  updateDriverApproval
);

module.exports = router;