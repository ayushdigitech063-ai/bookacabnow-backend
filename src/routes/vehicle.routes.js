const express = require("express");
const router = express.Router();

const {
  addFleetVehicle,
  addIndividualVehicle,
  getMyFleetVehicles,
  assignVehicleToDriver
} = require("../controllers/vehicle.controller");

const { verifyToken, authorizeRoles } = require("../middlewares/auth.middleware");
const { createVehicleSchema, assignDriverSchema } = require("../validations/vehicle.validation");
const {validate} = require("../middlewares/validate.middleware");



// All routes require login
router.use(verifyToken);

// Fleet Owner
router.post("/fleet/add", authorizeRoles("FLEET_OWNER"), validate(createVehicleSchema), addFleetVehicle);
router.get("/fleet/my-vehicles", authorizeRoles("FLEET_OWNER"), getMyFleetVehicles);
router.patch("/fleet/:vehicleId/assign", authorizeRoles("FLEET_OWNER"), validate(assignDriverSchema), assignVehicleToDriver);

// Individual Driver
router.post("/individual/add", authorizeRoles("INDIVIDUAL_DRIVER"), validate(createVehicleSchema), addIndividualVehicle);

module.exports = router;