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
  completeRideSchema
} = require("../validations/driver.validation");

// Controllers
const {
  updateDriverShift,
  updateDriverLocation,
  acceptRideRequest,
  markDriverArrived,
  startRide,
  completeRide
} = require("../controllers/driver.controller");


router.use(verifyToken);
router.use(authorizeRoles("INDIVIDUAL_DRIVER", "FLEET_DRIVER"));



router.patch(
  "/shift",
  validate(updateShiftSchema),
  updateDriverShift
);

router.patch(
  "/location",
  validate(updateLocationSchema),
  updateDriverLocation
);

// 3. Accept Ride: PATCH /api/v1/driver/rides/:bookingId/accept
router.patch(
  "/rides/:bookingId/accept",
  validate(bookingIdParamSchema, "params"),
  acceptRideRequest
);

// 4. Mark Arrived: PATCH /api/v1/driver/rides/:bookingId/arrived
router.patch(
  "/rides/:bookingId/arrived",
  validate(bookingIdParamSchema, "params"),
  markDriverArrived
);

router.patch(
  "/rides/:bookingId/start",
  validate(bookingIdParamSchema, "params"), // Validate bookingId in URL
  validate(startRideSchema, "body"),        // Validate OTP in JSON body
  startRide
);

router.patch(
  "/rides/:bookingId/complete",
  validate(bookingIdParamSchema, "params"),
  validate(completeRideSchema, "body"),
  completeRide
);

module.exports = router;