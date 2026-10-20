// src/validations/driver.validation.js
const Joi = require("joi");


const updateShiftSchema = Joi.object({
  isShiftActive: Joi.boolean().required().messages({
    "boolean.base": "isShiftActive must be a boolean (true or false)",
    "any.required": "isShiftActive is required to update duty status",
  }),
});



const updateLocationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required().messages({
    "number.base": "Latitude must be a valid number",
    "number.min": "Latitude cannot be less than -90 degrees",
    "number.max": "Latitude cannot be greater than 90 degrees",
    "any.required": "Latitude is required for tracking",
  }),
  longitude: Joi.number().min(-180).max(180).required().messages({
    "number.base": "Longitude must be a valid number",
    "number.min": "Longitude cannot be less than -180 degrees",
    "number.max": "Longitude cannot be greater than 180 degrees",
    "any.required": "Longitude is required for tracking",
  }),
});

const bookingIdParamSchema = Joi.object({
  bookingId: Joi.string()
    .hex()
    .length(24)
    .required()
    .messages({
      "string.hex": "bookingId must be a valid MongoDB ObjectId hex string",
      "string.length": "bookingId must be exactly 24 characters long",
      "any.required": "bookingId parameter is required in URL",
    }),
});

const startRideSchema = Joi.object({
  otp: Joi.string()
    .length(4)
    .pattern(/^[0-9]+$/)
    .required()
    .messages({
      "string.base": "OTP must be a string",
      "string.length": "OTP must be exactly 4 digits",
      "string.pattern.base": "OTP must contain only numbers",
      "any.required": "OTP is required to start the ride",
    }),
});
const completeRideSchema = Joi.object({
  actualDistanceKm: Joi.number().min(0).optional().messages({
    "number.base": "actualDistanceKm must be a valid number",
    "number.min": "actualDistanceKm cannot be negative",
  }),
  tollCharges: Joi.number().min(0).default(0).messages({
    "number.base": "tollCharges must be a valid number",
    "number.min": "tollCharges cannot be negative",
  }),
  parkingCharges: Joi.number().min(0).default(0).messages({
    "number.base": "parkingCharges must be a valid number",
    "number.min": "parkingCharges cannot be negative",
  }),
  paymentMethod: Joi.string()
    .valid("CASH", "ONLINE_UPI", "WALLET")
    .optional(),
});

module.exports = {
  updateShiftSchema,
  updateLocationSchema,
  bookingIdParamSchema,
  startRideSchema,
  completeRideSchema,
};