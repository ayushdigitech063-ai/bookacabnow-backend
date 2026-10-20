// src/validations/booking.validation.js
const Joi = require("joi");

const searchNearbyCabsSchema = Joi.object({
  pickupCoordinates: Joi.array()
    .items(
      Joi.number().min(-180).max(180).required(), // Longitude
      Joi.number().min(-90).max(90).required()    // Latitude
    )
    .length(2)
    .required()
    .messages({
      "array.base": "pickupCoordinates must be an array of [longitude, latitude]",
      "array.length": "pickupCoordinates must contain exactly [longitude, latitude]",
      "any.required": "pickupCoordinates are required",
    }),
    dropCoordinates: Joi.array()
    .ordered(
      Joi.number().min(-180).max(180).required(), // Longitude
      Joi.number().min(-90).max(90).required()    // Latitude
    )
    .length(2)
    .required()
    .messages({
      "any.required": "Drop coordinates are required to calculate fare",
    }),

  serviceCategory: Joi.string()
    .valid(
      "LOCAL_RIDE",
      "OUTSTATION",
      "AIRPORT_TRANSFER",
      "HOURLY_RENTAL",
      "WEDDING",
      "CORPORATE"
    )
    .default("LOCAL_RIDE")
    .messages({
      "any.only": "Invalid serviceCategory specified",
    }),

  category: Joi.string()
    .valid("HATCHBACK", "SEDAN", "SUV", "AUTO", "BIKE")
    .optional()
    .messages({
      "any.only": "Invalid vehicle category specified",
    }),

  radiusInKm: Joi.number().min(1).max(25).default(5).messages({
    "number.min": "Search radius must be at least 1 KM",
    "number.max": "Search radius cannot exceed 25 KM",
  }),
});
const createBookingSchema = Joi.object({
  serviceCategory: Joi.string()
    .valid(
      "LOCAL_RIDE",
      "OUTSTATION",
      "AIRPORT_TRANSFER",
      "HOURLY_RENTAL",
      "WEDDING",
      "CORPORATE"
    )
    .required()
    .messages({
      "any.required": "serviceCategory is required",
      "any.only": "Invalid serviceCategory specified",
    }),

  tripType: Joi.string()
    .valid("ONE_WAY", "ROUND_TRIP", "AIRPORT_TRANSFER", "HOURLY_RENTAL", "MULTI_DAY")
    .required()
    .messages({
      "any.required": "tripType is required",
      "any.only": "Invalid tripType specified",
    }),

  pickup: Joi.object({
    address: Joi.string().trim().required().messages({
      "any.required": "Pickup address text is required",
    }),
    coordinates: Joi.array()
      .items(
        Joi.number().min(-180).max(180).required(), // Longitude
        Joi.number().min(-90).max(90).required()    // Latitude
      )
      .length(2)
      .required()
      .messages({
        "array.length": "Pickup coordinates must be [longitude, latitude]",
      }),
  }).required(),

  dropoff: Joi.object({
    address: Joi.string().trim().required().messages({
      "any.required": "Dropoff address text is required",
    }),
    coordinates: Joi.array()
      .items(
        Joi.number().min(-180).max(180).required(), // Longitude
        Joi.number().min(-90).max(90).required()    // Latitude
      )
      .length(2)
      .required()
      .messages({
        "array.length": "Dropoff coordinates must be [longitude, latitude]",
      }),
  }).required(),

  pickupDateTime: Joi.date().iso().required().messages({
    "date.base": "pickupDateTime must be a valid ISO Date",
    "any.required": "pickupDateTime is required",
  }),

  category: Joi.string()
    .valid("HATCHBACK", "SEDAN", "SUV", "AUTO", "BIKE")
    .required()
    .messages({
      "any.required": "Vehicle category selection is required",
      "any.only": "Invalid vehicle category",
    }),

  paymentMethod: Joi.string()
    .valid("CASH", "ONLINE_UPI", "WALLET")
    .default("CASH"),
});

module.exports = {
  searchNearbyCabsSchema,
  createBookingSchema,
};