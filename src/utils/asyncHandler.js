const asyncHandler = (fn) => {
    return (reqq,res ,next ) => {
        Promise.resolve (fn(req,res,next)).catch((err) => next(err))
    };
};

module.exports = {
    asyncHandler
}