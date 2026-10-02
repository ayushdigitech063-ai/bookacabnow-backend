const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    // --- 1. Dynamic Ownership (refPath) ---
    ownerType: {
      type: String,
      enum: ["INDIVIDUAL", "FLEET"],
      required: true
    },
    ownerModel: {
      type: String,
      enum: ["User", "FleetCompany"],
      required: true // Tells Mongoose whether to look in "User" or "FleetCompany"
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "ownerModel", // Dynamically resolves to User or FleetCompany model
      required: true
    },
    ownerContact: {
      fullName: { type: String, required: true, trim: true }, // From form: Owner Full Name
      phone: { type: String, required: true, trim: true }      // From form: Contact Phone Number
    },

    // --- 2. Fleet Shift Roster & Driver Lock ---
    assignedDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null // Currently operating driver
    },
    isAssigned: {
      type: Boolean,
      default: false // True if car is currently occupied/locked by a driver
    },

    // --- 3. Vehicle Specifications (Form 1:1 Mapping) ---
    brand: {
      type: String,
      required: [true, "Vehicle brand is required"], // e.g., Maruti Suzuki, Toyota
      trim: true
    },
    model: {
      type: String,
      required: [true, "Car model name is required"], // e.g., Swift Dzire, Innova Crysta
      trim: true
    },
    category: {
      type: String,
      enum: ["HATCHBACK", "SEDAN", "SUV", "INNOVA", "LUXURY", "BUS"], // Matches UI Category tabs[cite: 1]
      required: true
    },
    baseCity: {
      type: String,
      required: [true, "Base operating city is required"], // e.g., Jaipur, Delhi
      trim: true,
      index: true
    },
    seatingCapacity: {
      type: Number,
      required: [true, "Seating capacity is required"] // e.g., 4, 6, 7
    },
    fuelType: {
      type: String,
      enum: ["PETROL", "DIESEL", "CNG", "PETROL_CNG", "EV"], // Handles hybrid Petrol/CNG option
      required: true
    },

    // --- 4. Commercial Registration & Legal Compliance ---
    commercialRcNumber: {
      type: String,
      required: [true, "Commercial RC Number is required"], // e.g., RJ-14-TA-1234
      unique: true,
      uppercase: true,
      trim: true
    },
    complianceDocuments: {
      rcUrl: { type: String, default: null },
      insuranceExpiry: { type: Date, default: null },
      insuranceUrl: { type: String, default: null },
      fitnessExpiry: { type: Date, default: null },
      documentStatus: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED"],
        default: "PENDING"
      }
    },

    // --- 5. 0% Platform Model: Dynamic Rate Per Km ---
    expectedPerKmRate: {
      type: Number,
      required: [true, "Expected per-km rate is required"], // e.g., 14
      min: [5, "Per-km rate must be valid"]
    },

    // --- 6. Multi-Vertical Offerings ---
    enabledServices: {
      type: [String],
      enum: ["LOCAL_RIDE", "OUTSTATION", "AIRPORT_TRANSFER", "HOURLY_RENTAL", "WEDDING", "CORPORATE"],
      default: ["LOCAL_RIDE"]
    },

    // --- 7. Search Filter Amenities ---
    features: {
      hasAC: { type: Boolean, default: true },
      isPetFriendly: { type: Boolean, default: false },
      hasExtraLuggageCarrier: { type: Boolean, default: false },
      isNonSmoking: { type: Boolean, default: true }
    },
    languages: {
      type: [String],
      default: ["HINDI", "ENGLISH"]
    },

    // --- 8. Pay-Per-Car Trending Boost System ---
    promotion: {
      isTrending: { type: Boolean, default: false },
      badgeText: { type: String, default: null }, // "TOP TRENDING"
      boostExpiresAt: { type: Date, default: null },
      boostOrderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BoostOrder",
        default: null
      }
    },

    // --- 9. Real-Time Telemetry & Availability ---
    isAvailable: {
      type: Boolean,
      default: true // Switches to false during active passenger trips
    },
    isOnline: {
      type: Boolean,
      default: false // Driver shift online/offline switch
    },
    currentLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point"
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [75.7873, 26.9124] // Jaipur default coordinates
      }
    }
  },
  {
    timestamps: true
  }
);

// High-performance geospatial and compound indexes
vehicleSchema.index({ currentLocation: "2dsphere" });
vehicleSchema.index({ baseCity: 1, category: 1, isAvailable: 1 });
vehicleSchema.index({ "promotion.isTrending": -1 });

const Vehicle = mongoose.model("Vehicle", vehicleSchema);

module.exports = Vehicle;