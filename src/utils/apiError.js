const createApiError = (statusCode , message = "Something Went Wrong" ,error =[]) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.data = null;
    err.success = false;
    err.error = error;

    if(Error.captureStackTrace){
        Error.captureStackTrace(err , createApiError)
    }
    return err;
};

module.exports = {
    createApiError
}