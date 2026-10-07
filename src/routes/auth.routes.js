const express = require("express");
const router = express.Router();

const {
  register,
  login,
  verifyEmail,
  getMe,
  // updateDriverShift
} = require("../controllers/auth.controller");

const { validate } = require("../middlewares/validate.middleware");
const { verifyToken, authorizeRoles } = require("../middlewares/auth.middleware");
const {
  registerUserSchema,
  loginUserSchema,
  updateDriverShiftSchema
} = require("../validations/user.validation");

// 1. Public Authentication Endpoints
router.post("/register", validate(registerUserSchema), register);
router.post("/login", validate(loginUserSchema), login);
router.get("/verify-email", verifyEmail);

// 2. Protected Session Endpoint (Any logged-in user)
router.get("/me", verifyToken, getMe);

// 3. Driver Shift Route (Protected: Only INDIVIDUAL_DRIVER or FLEET_DRIVER)
// router.patch(
//   "/shift",
//   verifyToken,
//   authorizeRoles("INDIVIDUAL_DRIVER", "FLEET_DRIVER"),
//   validate(updateDriverShiftSchema),
//   updateDriverShift
// );

module.exports = router;