const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { errorHandler } = require("./middlewares/error.middleware");
const { sendApiResponse } = require("./utils/apiResponse");
const authRoutes = require("./routes/auth.routes");
const fleetRoutes = require("./routes/fleet.routes");
const vehicleRoutes = require("./routes/vehicle.routes");
const driverRouter = require("./routes/driver.routes");
const bookingRouter = require("./routes/booking.routes");

const app = express();


app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(morgan("dev"));


app.get("/health", (req, res) => {
  return sendApiResponse(res, 200, { uptime: process.uptime() }, "Server is up and healthy");
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/fleet", fleetRoutes);
app.use("/api/v1/vehicles", vehicleRoutes);
app.use("/api/v1/driver", driverRouter);
app.use("/api/v1/bookings", bookingRouter);



app.use(errorHandler);

module.exports = app;