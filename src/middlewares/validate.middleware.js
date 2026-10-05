const { createApiError } = require("../utils/apiError");

const validate = (schema) => (req, res, next) => {
  // Guard clause: agar schema undefined pass ho gaya toh app crash nahi hoga
  if (!schema || typeof schema.validate !== "function") {
    return next(
      createApiError(500, "Validation schema is missing or undefined in route definition")
    );
  }

  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorDetails = error.details.map((d) => d.message.replace(/['"]/g, ""));
    console.log("❌ Joi Validation Failed:", errorDetails);
    return next(createApiError(400, "Validation Error", errorDetails));
  }

  req.body = value;
  return next();
};

module.exports = { validate };