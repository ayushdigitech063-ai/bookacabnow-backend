const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    // --- 1. Dynamic Ownership (refPath) ---
    ownerType: {
      type: String,
      enum: ["INDIVIDUAL", "FLEET"],
      required: true,
    },
    ownerModel: {
      type: String,
      enum: ["User", "FleetCompany"],
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "ownerModel",
      required: true,
    },
    ownerContact: {
      fullName: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
    },

    // --- 2. Fleet Shift Roster & Driver Lock ---
    assignedDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // Currently operating driver
    },
    isAssigned: {
      type: Boolean,
      default: false, // True if car is currently occupied/locked by a driver
    },

    // --- 3. Vehicle Specifications (Form 1:1 Mapping) ---
    brand: {
      type: String,
      required: [true, "Vehicle brand is required"], // e.g., Maruti Suzuki, Toyota, Hyundai
      trim: true,
    },
    model: {
      type: String,
      required: [true, "Car model name is required"], // e.g., Dzire, Ertiga, Innova Crysta
      trim: true,
    },
    category: {
      type: String,
      enum: ["HATCHBACK", "SEDAN", "SUV", "INNOVA", "LUXURY", "BUS"],
      required: true,
    },
    baseCity: {
      type: String,
      required: [true, "Base operating city is required"], // e.g., Jaipur, Delhi, Mumbai
      trim: true,
      index: true,
    },
    seatingCapacity: {
      type: Number,
      required: [true, "Seating capacity is required"], // e.g., 4, 6, 7
    },
    fuelType: {
      type: String,
      enum: ["PETROL", "DIESEL", "CNG", "PETROL_CNG", "EV"],
      required: true,
    },

    // Transmission filter & badge (Manual / Automatic)
    transmission: {
      type: String,
      enum: ["MANUAL", "AUTOMATIC"],
      default: "MANUAL",
    },

    // Showcase photos for marketplace cards
    images: {
      type: [String],
      default: [],
    },

    commercialRcNumber: {
      type: String,
      required: [true, "Commercial RC Number is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "BLOCKED"],
      default: "INACTIVE",
    },

    // --- 4. Legal Compliance & Verification Documents ---
    complianceDocuments: {
      rcUrl: { type: String, default: null },
      insuranceExpiry: { type: Date, default: null },
      insuranceUrl: { type: String, default: null },
      fitnessExpiry: { type: Date, default: null },
      documentStatus: {
        type: String,
        enum: ["PENDING", "SUBMITTED", "APPROVED", "REJECTED"],
        default: "PENDING",
      },
      rejectionReason: {
        type: String,
        default: null,
      },
      verifiedAt: {
        type: Date,
        default: null,
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },

    // --- 5. Pricing Structure (Per-Km & Per-Day) ---
    expectedPerKmRate: {
      type: Number,
      required: [true, "Expected per-km rate is required"], // e.g., 12, 14, 16
      min: [5, "Per-km rate must be valid"],
    },
    dailyRate: {
      type: Number,
      default: 0, // e.g., 2100, 3200 for daily package
      min: [0, "Daily rate cannot be negative"],
    },

    // --- 6. Multi-Vertical Offerings ---
    enabledServices: {
      type: [String],
      enum: [
        "LOCAL_RIDE",
        "OUTSTATION",
        "AIRPORT_TRANSFER",
        "HOURLY_RENTAL",
        "WEDDING",
        "CORPORATE",
      ],
      default: ["LOCAL_RIDE"],
    },

    // --- 7. Search Filter Amenities ---
    features: {
      hasAC: { type: Boolean, default: true },
      isPetFriendly: { type: Boolean, default: false },
      hasExtraLuggageCarrier: { type: Boolean, default: false },
      isNonSmoking: { type: Boolean, default: true },
    },
    languages: {
      type: [String],
      default: ["HINDI", "ENGLISH"],
    },

    // Rating display on card (e.g., ★ 4.8)
    rating: {
      average: { type: Number, default: 4.8 },
      totalReviews: { type: Number, default: 0 },
    },

    // Card tag label (e.g., "Verified Cab", "Most Booked")
    badgeText: {
      type: String,
      default: "Verified Cab",
    },

    // --- 8. Availability & Telemetry ---
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    currentLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [75.7873, 26.9124], // Jaipur default coordinates
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for filters and performance
vehicleSchema.index({ currentLocation: "2dsphere" });
vehicleSchema.index({ baseCity: 1, category: 1, isAvailable: 1 });
vehicleSchema.index({ expectedPerKmRate: 1, dailyRate: 1 });

const Vehicle = mongoose.model("Vehicle", vehicleSchema);

module.exports = Vehicle;