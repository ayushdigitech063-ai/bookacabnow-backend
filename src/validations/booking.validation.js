const Joi = require("joi");

const coordinateSchema = Joi.array()
  .items(
    Joi.number().min(-180).max(180).required(), // Longitude
    Joi.number().min(-90).max(90).required()     // Latitude
  )
  .length(2)
  .required();

const locationPointSchema = Joi.object({
  address: Joi.string().trim().min(3).max(250).required(),
  coordinates: coordinateSchema
});

const createBookingSchema = Joi.object({
  serviceCategory: Joi.string()
    .valid("LOCAL_RIDE", "OUTSTATION", "AIRPORT_TRANSFER", "HOURLY_RENTAL", "WEDDING", "CORPORATE")
    .required(),
  tripType: Joi.string()
    .valid("ONE_WAY", "ROUND_TRIP", "AIRPORT_TRANSFER", "HOURLY_RENTAL", "MULTI_DAY")
    .required(),

  pickup: locationPointSchema.required(),

  dropoff: locationPointSchema.when("serviceCategory", {
    is: "HOURLY_RENTAL",
    then: Joi.optional().allow(null),
    otherwise: Joi.required()
  }),

  pickupDateTime: Joi.date().min("now").required(),
  returnDateTime: Joi.date().greater(Joi.ref("pickupDateTime")).when("tripType", {
    is: Joi.valid("ROUND_TRIP", "MULTI_DAY"),
    then: Joi.required(),
    otherwise: Joi.optional().allow(null)
  }),

  vehicleId: Joi.string().hex().length(24).optional().allow(null),

  multiDayDetails: Joi.object({
    totalDays: Joi.number().integer().min(2).max(30).required(),
    minKmPerDay: Joi.number().min(200).default(250),
    driverAllowancePerDay: Joi.number().min(200).default(300),
    nightStayChargePerNight: Joi.number().min(0).default(250)
  }).when("tripType", {
    is: "MULTI_DAY",
    then: Joi.required(),
    otherwise: Joi.optional()
  }),

  rentalPackage: Joi.object({
    packageType: Joi.string().valid("4HR_40KM", "8HR_80KM", "12HR_120KM").required(),
    extraHourRate: Joi.number().min(0).required(),
    extraKmRate: Joi.number().min(0).required()
  }).when("serviceCategory", {
    is: "HOURLY_RENTAL",
    then: Joi.required(),
    otherwise: Joi.optional().allow(null)
  }),

  airportDetails: Joi.object({
    flightNumber: Joi.string().trim().uppercase().optional().allow(null, ""),
    terminal: Joi.string().trim().optional().allow(null, "")
  }).optional(),

  paymentMethod: Joi.string().valid("CASH", "ONLINE_UPI", "WALLET").default("CASH")
}).custom((value, helpers) => {
  // Edge Case: Check pickup and dropoff coordinates are not identical
  if (value.dropoff && value.pickup) {
    const [pLng, pLat] = value.pickup.coordinates;
    const [dLng, dLat] = value.dropoff.coordinates;
    if (pLng === dLng && pLat === dLat) {
      return helpers.message({ custom: "Pickup and Dropoff locations cannot be identical" });
    }
  }
  return value;
});

module.exports = { createBookingSchema };