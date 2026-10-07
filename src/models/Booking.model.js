const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    bookingCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true
    },

    // --- Core Relationships ---
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null
    },
    fleetCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FleetCompany",
      default: null
    },

    // --- Vertical & Trip Types ---
    serviceCategory: {
      type: String,
      enum: ["LOCAL_RIDE", "OUTSTATION", "AIRPORT_TRANSFER", "HOURLY_RENTAL", "WEDDING", "CORPORATE"],
      required: true
    },
    tripType: {
      type: String,
      enum: ["ONE_WAY", "ROUND_TRIP", "AIRPORT_TRANSFER", "HOURLY_RENTAL", "MULTI_DAY"],
      required: true
    },

    // --- Geolocation & Routing ---
    pickup: {
      address: { type: String, required: true },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    },
    dropoff: {
      address: { type: String, required: true },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    },
    pickupDateTime: {
      type: Date,
      required: true
    },
    returnDateTime: {
      type: Date,
      default: null // Multi-day ya round-trip me required
    },

    // --- 🚀 DAY-WISE MANAGEMENT ENGINE ---
    multiDayDetails: {
      isMultiDay: {
        type: Boolean,
        default: false
      },
      totalDays: {
        type: Number,
        default: 1 // Calculated based on returnDateTime - pickupDateTime
      },
      minKmPerDay: {
        type: Number,
        default: 250 // Industry standard: 250 km / 300 km daily minimum
      },
      totalMinKmCovered: {
        type: Number,
        default: 250 // totalDays * minKmPerDay
      },
      driverAllowancePerDay: {
        type: Number,
        default: 300 // e.g., ₹300 per day driver food/stay bata
      },
      nightStayChargePerNight: {
        type: Number,
        default: 250 // If driving continues after 10 PM
      },
      // Har din ka itinerary track karne ke liye
      dayWiseSchedule: [
        {
          dayNumber: { type: Number, required: true }, // Day 1, Day 2, etc.
          date: { type: Date, required: true },
          startCity: { type: String, default: "" },
          destinationCity: { type: String, default: "" },
          startOdometerReading: { type: Number, default: 0 },
          endOdometerReading: { type: Number, default: 0 },
          dailyDistanceCoveredKm: { type: Number, default: 0 },
          isCompleted: { type: Boolean, default: false }
        }
      ]
    },

    // --- Hourly Rental Addon (Agar tripType === HOURLY_RENTAL ho) ---
    rentalPackage: {
      packageType: {
        type: String,
        enum: ["4HR_40KM", "8HR_80KM", "12HR_120KM", null],
        default: null
      },
      extraHourRate: { type: Number, default: 0 },
      extraKmRate: { type: Number, default: 0 }
    },

    // --- Airport Transfer Specifics ---
    airportDetails: {
      flightNumber: { type: String, default: null },
      terminal: { type: String, default: null }
    },

    // --- Dynamic Fare Breakdown (0% Platform Fee Model) ---
    pricing: {
      baseFare: { type: Number, required: true },
      perKmRate: { type: Number, required: true },
      estimatedDistanceKm: { type: Number, default: 0 },
      distanceCharge: { type: Number, default: 0 },
      previousDues: { type: Number, default: 0 }, // <--- Add this field
      totalDriverAllowance: { type: Number, default: 0 }, // totalDays * driverAllowancePerDay[cite: 1]
      nightStayAllowance: { type: Number, default: 0 },
      tollAndTaxes: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 }, // 0 under zero-commission architecture
      totalFare: { type: Number, required: true }
    },

    // --- Trip Security OTPs ---
    startOtp: {
      type: String,
default: () => Math.floor(1000 + Math.random() * 9000).toString(),
      select: false
    },
    endOtp: {
      type: String,
      default: null,
      select: false
    },

    // --- Lifecycle State Machine ---
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "ACCEPTED",
        "DRIVER_ARRIVED",
        "IN_TRANSIT",
        "COMPLETED",
        "CANCELLED"
      ],
      default: "REQUESTED",
      index: true
    },

    payment: {
      method: {
        type: String,
        enum: ["CASH", "ONLINE_UPI", "WALLET"],
        default: "CASH"
      },
      status: {
        type: String,
        enum: ["PENDING", "COMPLETED", "FAILED"],
        default: "PENDING"
      },
      transactionId: { type: String, default: null }
    },

    cancellation: {
      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },
      reason: { type: String, default: null },
      cancellationFee: { type: Number, default: 0 }
    }
  },
  {
    timestamps: true
  }
);

bookingSchema.index({ status: 1, serviceCategory: 1 });
bookingSchema.index({ "pickup.coordinates": "2dsphere" });
bookingSchema.index({ "multiDayDetails.isMultiDay": 1 });

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;