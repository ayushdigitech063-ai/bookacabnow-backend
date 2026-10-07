const Joi = require("joi");
// const { updateDriverShiftSchema } = require("./fleetCompany.validation");

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

  // driverDetails block:
  driverDetails: Joi.object({
    licenseNumber: Joi.string().trim().uppercase().min(10).max(20).required(),
    licenseExpiry: Joi.date().greater("now").required().messages({
      "date.greater": "Driving License has expired"
    }),
    aadharNumber: Joi.string().pattern(aadharRegex).required(),

    // ✅ fleetCompanyId yahan andar hona chahiye!
    fleetCompanyId: Joi.string()
      .hex()
      .length(24)
      .when("$role", {
        is: "FLEET_DRIVER",
        then: Joi.required().messages({
          "any.required": "Fleet Driver must have an associated fleetCompanyId"
        }),
        otherwise: Joi.optional().allow(null)
      })
  }).when("role", {
    is: Joi.valid("INDIVIDUAL_DRIVER", "FLEET_DRIVER"),
    then: Joi.required(),
    otherwise: Joi.forbidden()
  })
});

const loginUserSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .messages({
      "string.pattern.base": "Phone number must be a valid 10-digit Indian mobile number"
    }),

  email: Joi.string()
    .email()
    .lowercase()
    .trim(),

  password: Joi.string().required().messages({
    "any.required": "Password is required"
  })
})
  // 👈 Yeh line rule enforce karti hai ki phone aur email me se AT LEAST ek zaroor ho:
  .or("phone", "email")
  .messages({
    "object.missing": "Please provide either phone number or email to login"
  });

//   const updateDriverShiftSchema = Joi.object({
//   isShiftActive: Joi.boolean().required().messages({
//     "boolean.base": "isShiftActive must be a boolean (true or false)",
//     "any.required": "isShiftActive is required"
//   }),
//   isAvailable: Joi.boolean().default(false)
// });

module.exports = {
  registerUserSchema,
  loginUserSchema,
  // updateDriverShiftSchema
};