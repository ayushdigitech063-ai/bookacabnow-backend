const { createApiError } = require("../utils/apiError");

const errorHandler = (err, req, res, _next) => {
  let customError = err;
  console.error("DEBUG ERROR:", err);

  // Agar custom API error structure nahi hai (jaise unhandled exceptions)
  if (!customError.statusCode) {
    console.log(req.originalUrl);
    // console.log(customError)
    const statusCode = 500; 
    const message = customError.message || "Internal Server Error";
    customError = createApiError(statusCode, message, customError.errors || []);
  }

  const response = {
    success: false,
    message: customError.message,
    errors: customError.errors || [],
    ...(process.env.NODE_ENV === "development" && { stack: customError.stack })
  };

  return res.status(customError.statusCode || 500).json(response);
};

module.exports = {
  errorHandler
};