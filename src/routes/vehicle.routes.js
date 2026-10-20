// src/routes/vehicle.routes.js
const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload.middleware");

const {
  addFleetVehicle,
  addIndividualVehicle,
  getMyFleetVehicles,
  assignVehicleToDriver,
  updateVehicleDocuments,
  verifyVehicleDocuments,
} = require("../controllers/vehicle.controller");

const { verifyToken, authorizeRoles } = require("../middlewares/auth.middleware");
const {
  createVehicleSchema,
  assignDriverSchema,
  updateVehicleDocumentsSchema,
  verifyVehicleDocumentsSchema,
} = require("../validations/vehicle.validation");
const { validate } = require("../middlewares/validate.middleware");

// Multer upload fields config for vehicle registration
const vehicleUploadFields = upload.fields([
  { name: "vehicleImages", maxCount: 5 },
  { name: "rcFile", maxCount: 1 },
  { name: "insuranceFile", maxCount: 1 },
]);

// All vehicle routes require authentication
router.use(verifyToken);

// ==========================================
// 1. FLEET OWNER ROUTES
// ==========================================
router.post(
  "/fleet/add",
  authorizeRoles("FLEET_OWNER"),
  vehicleUploadFields,            // 1. Multer pehle body aur files parse karega
  validate(createVehicleSchema),  // 2. Uske baad Joi validate karega
  addFleetVehicle                 // 3. Controller execute hoga
);

router.get("/fleet/my-vehicles", authorizeRoles("FLEET_OWNER"), getMyFleetVehicles);

router.patch(
  "/fleet/:vehicleId/assign",
  authorizeRoles("FLEET_OWNER"),
  validate(assignDriverSchema),
  assignVehicleToDriver
);

// ==========================================
// 2. VEHICLE COMPLIANCE DOCUMENTS UPDATE
// ==========================================
router.patch(
  "/:vehicleId/documents",
  authorizeRoles("FLEET_OWNER", "INDIVIDUAL_DRIVER", "ADMIN"),
  upload.fields([
    { name: "rcFile", maxCount: 1 },
    { name: "insuranceFile", maxCount: 1 },
  ]),
  validate(updateVehicleDocumentsSchema),
  updateVehicleDocuments
);

// ==========================================
// 3. INDIVIDUAL DRIVER ROUTES
// ==========================================
router.post(
  "/individual/add",
  authorizeRoles("INDIVIDUAL_DRIVER"),
  vehicleUploadFields,            // 1. Multer pehle parse karega
  validate(createVehicleSchema),  // 2. Joi validate karega
  addIndividualVehicle
);

// ==========================================
// 4. ADMIN ROUTES (APPROVAL / VERIFICATION)
// ==========================================
router.patch(
  "/:vehicleId/verify-documents",
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  validate(verifyVehicleDocumentsSchema),
  verifyVehicleDocuments
);

module.exports = router;