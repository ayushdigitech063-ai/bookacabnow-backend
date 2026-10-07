const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload.middleware");

const {
  addFleetVehicle,
  addIndividualVehicle,
  getMyFleetVehicles,
  assignVehicleToDriver,
  updateVehicleDocuments,
  verifyVehicleDocuments
} = require("../controllers/vehicle.controller");

const { verifyToken, authorizeRoles } = require("../middlewares/auth.middleware");
const { createVehicleSchema, assignDriverSchema,updateVehicleDocumentsSchema, verifyVehicleDocumentsSchema } = require("../validations/vehicle.validation");
const {validate} = require("../middlewares/validate.middleware");



// All routes require login
router.use(verifyToken);

// Fleet Owner
router.post("/fleet/add", authorizeRoles("FLEET_OWNER"), validate(createVehicleSchema), addFleetVehicle);
router.get("/fleet/my-vehicles", authorizeRoles("FLEET_OWNER"), getMyFleetVehicles);
router.patch("/fleet/:vehicleId/assign", authorizeRoles("FLEET_OWNER"), validate(assignDriverSchema), assignVehicleToDriver);


router.patch(
  "/:vehicleId/documents",
  authorizeRoles("FLEET_OWNER", "INDIVIDUAL_DRIVER", "ADMIN"),
  upload.fields([
    { name: "rcFile", maxCount: 1 },
    { name: "insuranceFile", maxCount: 1 }
  ]), 
  validate(updateVehicleDocumentsSchema),
  updateVehicleDocuments
);

// Individual Driver
router.post("/individual/add", authorizeRoles("INDIVIDUAL_DRIVER"), validate(createVehicleSchema), addIndividualVehicle);


// admin routes

router.patch(
  "/:vehicleId/verify-documents",
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  validate(verifyVehicleDocumentsSchema),
  verifyVehicleDocuments
);

module.exports = router;