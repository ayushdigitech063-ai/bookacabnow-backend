const {createApiError} =   require("../utils/apiError")

const errorHandler = (err,req,res, next) => {
    let customError = err; 
    if(!error.statusCode) {
        const statusCode = 500;
        const message = error.message || "Internal Server Error";
        error = createApiError(status , message ,customError.errors || []);
    }

    const response = {
        success :false,
        message : customError.message,
        error : customError.errors || [],
        ...(process.env.NODE_ENV === "development" && { stack: customError.stack })
    };

    return res.status(customError.statusCode).json(response); 
};
        
module.exports = {
    errorHandler
}