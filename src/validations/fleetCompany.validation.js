const Joi = require("joi");

const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const registerFleetCompanySchema = Joi.object({
  companyName: Joi.string().trim().min(3).max(100).required(),
  contactEmail: Joi.string().email().lowercase().trim().required(),
  supportPhone: Joi.string().pattern(/^[6-9]\d{9}$/).required(),
  operatingCities: Joi.array().items(Joi.string().trim()).min(1).required(),
  businessAddress: Joi.object({
    street: Joi.string().trim().required(),
    city: Joi.string().trim().required(),
    state: Joi.string().trim().required(),
    pincode: Joi.string().pattern(/^\d{6}$/).required()
  }).required(),
  gstNumber: Joi.string().pattern(gstRegex).required().messages({
    "string.pattern.base": "Invalid GST format (e.g. 08AAAAA0000A1Z5)"
  }),
  panNumber: Joi.string().pattern(panRegex).required().messages({
    "string.pattern.base": "Invalid PAN format (e.g. AAAAA0000A)"
  })
});

const updateDriverApprovalSchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED", "SUSPENDED").required()
});

module.exports = {
  registerFleetCompanySchema,
  updateDriverApprovalSchema
};