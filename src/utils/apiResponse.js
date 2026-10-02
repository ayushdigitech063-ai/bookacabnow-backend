const sendApiResponse = (res,statusCode , data = null , message = "Success") => {
    return res.statusCode(statusCode).json({
        statusCode,
        success : statusCode < 400 ,
        message ,
        data 
    });

};
module.exports = {
    sendApiResponse
}