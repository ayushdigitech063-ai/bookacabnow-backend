const express = require("express");
const router = express.Router();

const {
  createSubscriptionPlan,
  getActiveSubscriptionPlans,
  getAllPlansAdmin,
  updateSubscriptionPlan,
  togglePlanStatus,
} = require("../controllers/subscriptionPlan.controller.js");

// Tere actual auth middleware se import
const {
  verifyToken,
  authorizeRoles,
} = require("../middlewares/auth.middleware.js");

// Public / Fleet Owner Route: Koi bhi active plans dekh sakta hai
router.get("/active", getActiveSubscriptionPlans);

// Admin Only Routes: Pehle verifyToken chalega, fir role ADMIN check hoga
router.post(
  "/admin/create",
  verifyToken,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  createSubscriptionPlan
);

router.get(
  "/admin/all",
  verifyToken,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  getAllPlansAdmin
);

router.put(
  "/admin/:planId",
  verifyToken,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  updateSubscriptionPlan
);

router.patch(
  "/admin/:planId/toggle-status",
  verifyToken,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  togglePlanStatus
);

module.exports = router;