const express = require("express");
const router = express.Router();
const {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getActiveSubscription,
} = require("../controllers/subscriptionOrder.controller.js");
const {
  verifyToken,
  authorizeRoles,
} = require("../middlewares/auth.middleware.js");

// Fleet Owner Protected Routes
router.post(
  "/create-order",
  verifyToken,
  authorizeRoles("FLEET_OWNER"),
  createSubscriptionOrder,
);

router.post(
  "/verify-payment",
  verifyToken,
  authorizeRoles("FLEET_OWNER"),
  verifySubscriptionPayment,
);

router.get(
  "/active",
  authorizeRoles("FLEET_OWNER"),
  getActiveSubscription
);

module.exports = router;
