const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    
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
      default: null,
    },
    isAssigned: {
      type: Boolean,
      default: false,
    },

   
    brand: {
      type: String,
      required: [true, "Vehicle brand is required"],
      trim: true,
    },
    model: {
      type: String,
      required: [true, "Car model name is required"],
      trim: true,
    },
   
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      index: true,
    },
    category: {
      type: String,
      enum: ["HATCHBACK", "SEDAN", "SUV", "INNOVA", "LUXURY", "BUS"],
      required: true,
    },
    baseCity: {
      type: String,
      required: [true, "Base operating city is required"],
      trim: true,
      index: true,
    },
    seatingCapacity: {
      type: Number,
      required: [true, "Seating capacity is required"],
    },
    fuelType: {
      type: String,
      enum: ["PETROL", "DIESEL", "CNG", "PETROL_CNG", "EV"],
      required: true,
    },
    transmission: {
      type: String,
      enum: ["MANUAL", "AUTOMATIC"],
      default: "MANUAL",
    },

    
    images: {
      type: [String],
      default: [],
    },

    aboutVehicle: {
      type: String,
      default:
        "Clean, AC sedan driven by professional polite driver. Ideal for outstation trips, city tours, and airport transfers.",
    },

    
    specs: {
      luggageCapacity: {
        type: String,
        default: "2 Large + 2 Medium Bags",
      },
      climateControl: {
        type: String,
        default: "Front & Rear AC Vents",
      },
      safetyRating: {
        type: String,
        default: "ABS + Dual Airbags • 5★ Rated",
      },
      mileage: {
        type: String,
        default: "24.1 km/l",
      },
    },

   
    amenities: {
      type: [String],
      default: [
        "Music System & Bluetooth",
        "Mobile Charger & GPS",
        "Commercial Tourist Permit",
        "Clean Tissue & Water Bottle",
      ],
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

    expectedPerKmRate: {
      type: Number,
      required: [true, "Expected per-km rate is required"],
      min: [5, "Per-km rate must be valid"],
    },
    dailyRate: {
      type: Number,
      default: 0,
      min: [0, "Daily rate cannot be negative"],
    },


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
    rating: {
      average: { type: Number, default: 4.8 },
      totalReviews: { type: Number, default: 0 },
    },
    badgeText: {
      type: String,
      default: "Verified Cab",
    },

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
        default: [75.7873, 26.9124],
      },
    },
  },
  {
    timestamps: true,
  }
);


vehicleSchema.pre("save", function () {
  if (!this.slug && this.brand && this.model) {
    const raw = `${this.brand}-${this.model}-${Math.floor(1000 + Math.random() * 9000)}`;
    this.slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }
});


vehicleSchema.index({ currentLocation: "2dsphere" });
vehicleSchema.index({ baseCity: 1, category: 1, isAvailable: 1 });
vehicleSchema.index({ expectedPerKmRate: 1, dailyRate: 1 });

const Vehicle = mongoose.model("Vehicle", vehicleSchema);

module.exports = Vehicle;