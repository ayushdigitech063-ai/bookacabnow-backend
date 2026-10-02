const { createApiError } = require("../utils/apiError");

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false, 
    stripUnknown: true 
  });

  if (error) {
    const errorDetails = error.details.map((d) => d.message.replace(/['"]/g, ""));
    return next(createApiError(400, "Validation Error", errorDetails));
  }

  req.body = value; 
  next();
};

module.exports = { validate };