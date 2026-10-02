const Joi = require("joi");

const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const phoneRegex = /^[6-9]\d{9}$/;

const registerFleetCompanySchema = Joi.object({
  companyName: Joi.string().trim().min(3).max(100).required(),
  contactEmail: Joi.string().email().lowercase().trim().required(),
  supportPhone: Joi.string().pattern(phoneRegex).required(),
  operatingCities: Joi.array().items(Joi.string().trim()).min(1).default(["Jaipur"]),
  businessAddress: Joi.object({
    street: Joi.string().trim().default(""),
    city: Joi.string().trim().required(),
    state: Joi.string().trim().default("Rajasthan"),
    pincode: Joi.string().pattern(/^\d{6}$/).required()
  }).required(),
  gstNumber: Joi.string().uppercase().pattern(gstRegex).optional().allow(null, ""),
  panNumber: Joi.string().uppercase().pattern(panRegex).optional().allow(null, "")
});

module.exports = { registerFleetCompanySchema };