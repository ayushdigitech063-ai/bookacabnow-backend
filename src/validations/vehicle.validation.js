const Joi = require("joi");

const commercialRcRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;

const createVehicleSchema = Joi.object({
  ownerType: Joi.string().valid("INDIVIDUAL", "FLEET").required(),
  brand: Joi.string().trim().min(2).max(40).required(),
  model: Joi.string().trim().min(1).max(50).required(),
  category: Joi.string()
    .valid("HATCHBACK", "SEDAN", "SUV", "INNOVA", "LUXURY", "BUS")
    .required(),
  baseCity: Joi.string().trim().required(),

  // Switch array: clean & stable runtime validation
  seatingCapacity: Joi.number().integer().when("category", {
    switch: [
      { is: Joi.valid("HATCHBACK", "SEDAN"), then: Joi.number().min(3).max(5).required() },
      { is: Joi.valid("SUV", "INNOVA"), then: Joi.number().min(6).max(8).required() },
      { is: "BUS", then: Joi.number().min(12).max(60).required() }
    ],
    otherwise: Joi.number().min(2).max(10).required()
  }),

  fuelType: Joi.string().valid("PETROL", "DIESEL", "CNG", "PETROL_CNG", "EV").required(),
  commercialRcNumber: Joi.string()
    .uppercase()
    .replace(/\s+/g, "")
    .pattern(commercialRcRegex)
    .required(),

  expectedPerKmRate: Joi.number().min(8).max(300).required(),

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
    .required(),

  features: Joi.object({
    hasAC: Joi.boolean().default(true),
    isPetFriendly: Joi.boolean().default(false),
    hasExtraLuggageCarrier: Joi.boolean().default(false),
    isNonSmoking: Joi.boolean().default(true)
  }).default(),

  languages: Joi.array().items(Joi.string().trim()).default(["HINDI", "ENGLISH"]),

  initialCoordinates: Joi.array()
    .items(
      Joi.number().min(-180).max(180).required(),
      Joi.number().min(-90).max(90).required()
    )
    .length(2)
    .optional()
});

module.exports = { createVehicleSchema };