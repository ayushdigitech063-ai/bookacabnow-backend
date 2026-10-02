const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { errorHandler } = require("./middlewares/error.middleware");
const { sendApiResponse } = require("./utils/apiResponse");

const app = express();


app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(morgan("dev"));


app.get("/health", (req, res) => {
  return sendApiResponse(res, 200, { uptime: process.uptime() }, "Server is up and healthy");
});


app.use(errorHandler);

module.exports = app;