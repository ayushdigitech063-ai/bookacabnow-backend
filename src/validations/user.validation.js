const Joi = require("joi");

const phoneRegex = /^[6-9]\d{9}$/;
const aadharRegex = /^\d{12}$/;

const registerUserSchema = Joi.object({
  fullName: Joi.string().trim().min(3).max(60).required(),
  phone: Joi.string().pattern(phoneRegex).required().messages({
    "string.pattern.base": "Enter a valid 10-digit Indian mobile number"
  }),
  email: Joi.string().email().lowercase().trim().optional(),
  password: Joi.string().min(6).max(32).required(),
  role: Joi.string()
    .valid("RIDER", "INDIVIDUAL_DRIVER", "FLEET_OWNER", "FLEET_DRIVER", "ADMIN")
    .default("RIDER"),

  driverProfile: Joi.object({
    licenseNumber: Joi.string().trim().uppercase().min(10).max(20).required(),
    licenseExpiry: Joi.date().greater("now").required().messages({
      "date.greater": "Driving License has expired"
    }),
    aadharNumber: Joi.string().pattern(aadharRegex).required(),
    operatingCity: Joi.string().trim().default("Jaipur"),
    experienceYears: Joi.number().min(0).max(40).default(0),
    payoutUpiId: Joi.string().trim().optional()
  }).when("role", {
    is: Joi.valid("INDIVIDUAL_DRIVER", "FLEET_DRIVER"),
    then: Joi.required(),
    otherwise: Joi.optional().allow(null)
  }),

  fleetCompanyId: Joi.string().hex().length(24).when("role", {
    is: "FLEET_DRIVER",
    then: Joi.required().messages({
      "any.required": "Fleet Driver must have an associated fleetCompanyId"
    }),
    otherwise: Joi.optional().allow(null)
  })
});

const loginUserSchema = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required(),
  password: Joi.string().required()
});

module.exports = {
  registerUserSchema,
  loginUserSchema
};