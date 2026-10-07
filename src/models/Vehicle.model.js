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
      required: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "ownerModel", 
      required: true
    },
    ownerContact: {
      fullName: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true }  
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
      required: [true, "Car model name is required"],
      trim: true
    },
    category: {
      type: String,
      enum: ["HATCHBACK", "SEDAN", "SUV", "INNOVA", "LUXURY", "BUS"],
      required: true
    },
    baseCity: {
      type: String,
      required: [true, "Base operating city is required"], 
      trim: true,
      index: true
    },
    seatingCapacity: {
      type: Number,
      required: [true, "Seating capacity is required"] 
    },
    fuelType: {
      type: String,
      enum: ["PETROL", "DIESEL", "CNG", "PETROL_CNG", "EV"],
      required: true
    },

  
    commercialRcNumber: {
      type: String,
      required: [true, "Commercial RC Number is required"], 
      unique: true,
      uppercase: true,
      trim: true
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "BLOCKED"],
      default: "INACTIVE"
    },
    complianceDocuments: {
      rcUrl: { type: String, default: null },
      insuranceExpiry: { type: Date, default: null },
      insuranceUrl: { type: String, default: null },
      fitnessExpiry: { type: Date, default: null },
      documentStatus: {
        type: String,
        enum: ["PENDING", "SUBMITTED","APPROVED", "REJECTED"],
        default: "PENDING"
      },
      rejectionReason: { 
    type: String, 
    default: null 
  },
  verifiedAt: { 
    type: Date, 
    default: null 
  },
  verifiedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        default: null 
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