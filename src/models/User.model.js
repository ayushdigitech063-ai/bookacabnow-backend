// src/models/User.model.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // --- 1. Basic Account Credentials ---
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true, // Null hone par duplicate key error nahi dega
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
      select: false,
    },

    // --- 2. System Role Management ---
    role: {
      type: String,
      enum: ["RIDER", "INDIVIDUAL_DRIVER", "FLEET_DRIVER", "FLEET_OWNER", "ADMIN", "SUPER_ADMIN"],
      default: "RIDER",
    },

    // --- 3. Driver Profile & Shift Tracking ---
    driverDetails: {
      licenseNumber: {
        type: String,
        default: null,
        trim: true,
        uppercase: true,
      },
      licenseExpiry: {
        type: Date,
        default: null,
      },
      licenseUrl: {
        type: String,
        default: null,
      },
      aadharNumber: {
        type: String,
        default: null,
        trim: true,
      },
      aadharUrl: {
        type: String,
        default: null,
      },
      kycStatus: {
        type: String,
        enum: ["NOT_APPLIED", "PENDING", "APPROVED", "REJECTED"],
        default: "NOT_APPLIED",
      },
      rejectionReason: {
        type: String,
        default: null,
      },
      rating: {
        type: Number,
        default: 5.0,
        min: 1.0,
        max: 5.0,
      },
      totalTripsCompleted: {
        type: Number,
        default: 0,
      },
      walletBalance: {
        type: Number,
        default: 0,
        min: 0,
      },
      // Fixed: cashDuesToPlatform is now inside driverDetails
      cashDuesToPlatform: {
        type: Number,
        default: 0,
        min: 0,
      },
      fleetCompanyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FleetCompany",
        default: null,
      },
      activeVehicleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vehicle",
        default: null,
      },
      isShiftActive: {
        type: Boolean,
        default: false,
      },
      isAvailable: {
        type: Boolean,
        default: false,
      },
    },

    riderDetails: {
      totalRides: {
        type: Number,
        default: 0,
      },
      outstandingDues: {
        type: Number,
        default: 0,
      },
      rating: {
        type: Number,
        default: 5.0,
        min: 1.0,
        max: 5.0,
      },
    },

    // --- 4. Saved Addresses ---
    savedAddresses: [
      {
        label: {
          type: String,
          enum: ["HOME", "WORK", "OTHER"],
          default: "HOME",
        },
        address: {
          type: String,
          required: true,
        },
        coordinates: {
          type: [Number],
          default: [0, 0],
        },
      },
    ],

    // --- 5. Push Notification Token ---
    fcmToken: {
      type: String,
      default: null,
    },

    // --- 6. Account Status ---
    isSuspended: {
      type: Boolean,
      default: false,
    },
    suspensionReason: {
      type: String,
      default: null,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save password hashing
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;