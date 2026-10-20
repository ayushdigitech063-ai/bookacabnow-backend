// src/middlewares/validate.middleware.js
const { createApiError } = require("../utils/apiError");

const validate = (schema, source = "body") => (req, res, next) => {
  if (!schema || typeof schema.validate !== "function") {
    return next(
      createApiError(500, "Validation schema is missing or undefined in route definition")
    );
  }

  // Safe fallback: defaults strictly to 'body' if not specified
  const dataToValidate = req[source] || {};

  const { error, value } = schema.validate(dataToValidate, {
    abortEarly: false,
    stripUnknown: true,
    convert: true, // Auto-typecasting
  });

  if (error) {
    const errorDetails = error.details.map((d) => d.message.replace(/['"]/g, ""));
    return next(createApiError(400, "Validation Error", errorDetails));
  }

  // Sanitized data wapas usi source par assign ho jayega (req.body ya req.params)
  req[source] = value;
  return next();
};

module.exports = { validate };