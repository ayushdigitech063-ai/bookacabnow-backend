const Joi = require("joi");

// Matches standard Indian commercial number plates (e.g., RJ14TA1234, DL01A5678, MH02EE9999)
const commercialRcRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;

// 24-character hex MongoDB ObjectId regex
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// ==========================================
// 1. CREATE / ADD VEHICLE SCHEMA
// ==========================================
const createVehicleSchema = Joi.object({
  // Optional: Backend controller authentication role se bhi auto-detect kar sakta hai
  ownerType: Joi.string().valid("INDIVIDUAL", "FLEET").optional(),

  brand: Joi.string().trim().min(2).max(40).required().messages({
    "string.empty": "Vehicle brand cannot be empty",
    "any.required": "Vehicle brand is required"
  }),

  model: Joi.string().trim().min(1).max(50).required().messages({
    "string.empty": "Car model cannot be empty",
    "any.required": "Car model name is required"
  }),

  category: Joi.string()
    .valid("HATCHBACK", "SEDAN", "SUV", "INNOVA", "LUXURY", "BUS")
    .required()
    .messages({
      "any.only": "Category must be one of HATCHBACK, SEDAN, SUV, INNOVA, LUXURY, BUS",
      "any.required": "Vehicle category is required"
    }),

  baseCity: Joi.string().trim().default("Jaipur"),

  // Dynamic conditional seating capacity based on vehicle category
  seatingCapacity: Joi.number()
    .integer()
    .when("category", {
      switch: [
        { is: Joi.valid("HATCHBACK", "SEDAN"), then: Joi.number().min(3).max(5).required() },
        { is: Joi.valid("SUV", "INNOVA"), then: Joi.number().min(6).max(8).required() },
        { is: "BUS", then: Joi.number().min(12).max(60).required() }
      ],
      otherwise: Joi.number().min(2).max(10).required()
    })
    .messages({
      "number.base": "Seating capacity must be a valid number",
      "any.required": "Seating capacity is required"
    }),

  fuelType: Joi.string()
    .valid("PETROL", "DIESEL", "CNG", "PETROL_CNG", "EV")
    .required()
    .messages({
      "any.only": "Fuel type must be PETROL, DIESEL, CNG, PETROL_CNG, or EV",
      "any.required": "Fuel type is required"
    }),

  commercialRcNumber: Joi.string()
    .trim()
    .uppercase()
    .replace(/\s+/g, "")
    .pattern(commercialRcRegex)
    .required()
    .messages({
      "string.pattern.base": "Commercial RC format invalid. Example valid format: RJ14TA1234",
      "any.required": "Commercial RC number is required"
    }),

  expectedPerKmRate: Joi.number().min(8).max(300).required().messages({
    "number.min": "Per-km rate must be at least ₹8/km",
    "number.max": "Per-km rate cannot exceed ₹300/km",
    "any.required": "Expected per-km rate is required"
  }),

  enabledServices: Joi.array()
    .items(
      Joi.string().valid(
        "LOCAL_RIDE",
        "OUTSTATION",
        "AIRPORT_TRANSFER",
        "HOURLY_RENTAL",
        "WEDDING",
        "CORPORATE"
      )
    )
    .min(1)
    .default(["LOCAL_RIDE"]),

  features: Joi.object({
    hasAC: Joi.boolean().default(true),
    isPetFriendly: Joi.boolean().default(false),
    hasExtraLuggageCarrier: Joi.boolean().default(false),
    isNonSmoking: Joi.boolean().default(true)
  }).default({
    hasAC: true,
    isPetFriendly: false,
    hasExtraLuggageCarrier: false,
    isNonSmoking: true
  }),

  languages: Joi.array().items(Joi.string().trim()).default(["HINDI", "ENGLISH"]),

  // Ordered Tuple: [Longitude (-180 to 180), Latitude (-90 to 90)]
  initialCoordinates: Joi.array()
    .ordered(
      Joi.number().min(-180).max(180).required(), // Index 0: Longitude
      Joi.number().min(-90).max(90).required()   // Index 1: Latitude
    )
    .length(2)
    .optional()
    .messages({
      "array.length": "Coordinates must contain exactly [longitude, latitude]"
    })
});

// ==========================================
// 2. ASSIGN DRIVER TO FLEET VEHICLE SCHEMA
// ==========================================
const assignDriverSchema = Joi.object({
  driverId: Joi.string()
    .pattern(objectIdRegex)
    .required()
    .messages({
      "string.pattern.base": "Invalid driver ID format (Must be 24-character MongoDB ObjectId)",
      "any.required": "Driver ID is required to assign a vehicle"
    })
});

// ==========================================
// 3. DRIVER SHIFT TOGGLE SCHEMA
// ==========================================
const updateDriverShiftSchema = Joi.object({
  isShiftActive: Joi.boolean().required().messages({
    "any.required": "isShiftActive boolean flag is required"
  }),
  isAvailable: Joi.boolean().default(false)
});

const updateVehicleDocumentsSchema = Joi.object({
  insuranceExpiry: Joi.date().iso().greater("now").optional().messages({
    "date.greater": "Insurance expiry date must be in the future",
    "date.format": "Insurance expiry must be a valid ISO date"
  }),
  fitnessExpiry: Joi.date().iso().greater("now").optional().messages({
    "date.greater": "Fitness expiry date must be in the future",
    "date.format": "Fitness expiry must be a valid ISO date"
  })
});

const verifyVehicleDocumentsSchema = Joi.object({
  status: Joi.string()
    .valid("APPROVED", "REJECTED")
    .required()
    .messages({
      "any.only": "Status must be either APPROVED or REJECTED",
      "any.required": "Verification status is required"
    }),
  rejectionReason: Joi.when("status", {
    is: "REJECTED",
    then: Joi.string().trim().min(5).required().messages({
      "any.required": "Rejection reason is required when status is REJECTED",
      "string.min": "Rejection reason must be at least 5 characters long"
    }),
    otherwise: Joi.string().optional().allow(null, "")
  })
});

module.exports = {
  createVehicleSchema,
  assignDriverSchema,
  updateDriverShiftSchema,
  updateVehicleDocumentsSchema,
  verifyVehicleDocumentsSchema
};