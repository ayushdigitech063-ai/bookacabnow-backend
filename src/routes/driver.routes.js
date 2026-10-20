const express = require("express");
const router = express.Router();

// Middlewares
const { verifyToken, authorizeRoles } = require("../middlewares/auth.middleware");
const { validate } = require("../middlewares/validate.middleware");

// Validations
const {
  updateShiftSchema,
  updateLocationSchema,
  bookingIdParamSchema,
  startRideSchema,
  completeRideSchema,
} = require("../validations/driver.validation");

// Controllers
const {
  updateDriverShift,
  updateDriverLocation,
  getNearbyRideRequests,
  getDriverEarnings,
  acceptRideRequest,
  markDriverArrived,
  startRide,
  completeRide,
} = require("../controllers/driver.controller");

// Global Route Guards
router.use(verifyToken);
router.use(authorizeRoles("INDIVIDUAL_DRIVER", "FLEET_DRIVER"));

// ==========================================
// 1. DRIVER STATE & METRICS
// ==========================================
router.patch("/shift", validate(updateShiftSchema), updateDriverShift);
router.patch("/location", validate(updateLocationSchema), updateDriverLocation);
router.get("/earnings", getDriverEarnings);

// ==========================================
// 2. STATIC RIDE QUERIES (Place before :bookingId)
// ==========================================
router.get("/rides/nearby", getNearbyRideRequests);

// ==========================================
// 3. PARAMETERIZED RIDE LIFECYCLE
// ==========================================
router.patch(
  "/rides/:bookingId/accept",
  validate(bookingIdParamSchema, "params"),
  acceptRideRequest
);

router.patch(
  "/rides/:bookingId/arrived",
  validate(bookingIdParamSchema, "params"),
  markDriverArrived
);

router.patch(
  "/rides/:bookingId/start",
  validate(bookingIdParamSchema, "params"),
  validate(startRideSchema, "body"),
  startRide
);

router.patch(
  "/rides/:bookingId/complete",
  validate(bookingIdParamSchema, "params"),
  validate(completeRideSchema, "body"),
  completeRide
);

module.exports = router;