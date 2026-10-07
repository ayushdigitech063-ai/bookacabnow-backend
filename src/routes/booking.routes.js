// src/routes/booking.routes.js
const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middlewares/auth.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { searchNearbyCabsSchema, createBookingSchema } = require("../validations/booking.validation");
const { searchNearbyCabs , createBookingRequest, cancelRideByRider} = require("../controllers/booking.controller");

// Customer authenticated routes
router.use(verifyToken);

// Real-time Search: POST /api/v1/bookings/search-cabs
router.post(
  "/search-cabs",
  validate(searchNearbyCabsSchema),
  searchNearbyCabs
);
router.post(
  "/create",
  validate(createBookingSchema),
  createBookingRequest
);


router.post("/:bookingId/cancel", cancelRideByRider);
module.exports = router;