const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // --- 1. Basic Account Credentials ---
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true
    },
    email: {
      type: String,
      required: [true, "Email address is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      index: true
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
      select: false // Password queries mein by-default leak nahi hoga
    },

    // --- 2. System Role Management ---
    role: {
      type: String,
      enum: ["USER", "INDIVIDUAL_DRIVER", "FLEET_DRIVER", "FLEET_OWNER", "ADMIN", "SUPER_ADMIN"],
      default: "USER"
    },

    // --- 3. Driver Profile & Shift Tracking ---
    // (Ye block sirf tab populate/use hoga jab role INDIVIDUAL_DRIVER ya FLEET_DRIVER ho)
    driverDetails: {
      licenseNumber: {
        type: String,
        default: null,
        trim: true,
        uppercase: true
      },
      licenseExpiry: {
        type: Date,
        default: null
      },
      licenseUrl: {
        type: String,
        default: null // Cloudinary URL
      },
      aadharNumber: {
        type: String,
        default: null,
        trim: true
      },
      aadharUrl: {
        type: String,
        default: null
      },
      kycStatus: {
        type: String,
        enum: ["NOT_APPLIED", "PENDING", "APPROVED", "REJECTED"],
        default: "NOT_APPLIED"
      },
      rejectionReason: {
        type: String,
        default: null
      },
      rating: {
        type: Number,
        default: 5.0,
        min: 1.0,
        max: 5.0
      },
      totalTripsCompleted: {
        type: Number,
        default: 0
      },

      // Fleet Company Relationship
      fleetCompanyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FleetCompany",
        default: null // Kaunsi agency ka driver hai
      },

      // Active Vehicle & Shift State
      activeVehicleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vehicle",
        default: null // Abhi kaunsi car assign/selected hai
      },
      isShiftActive: {
        type: Boolean,
        default: false // Duty Start / Stop toggle
      },
      isAvailable: {
        type: Boolean,
        default: false // Live ride receive karne ke liye ready hai ya nahi
      }
    },

    // --- 4. Saved Addresses (For Riders) ---
    savedAddresses: [
      {
        label: {
          type: String,
          enum: ["HOME", "WORK", "OTHER"],
          default: "HOME"
        },
        address: {
          type: String,
          required: true
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          default: [0, 0]
        }
      }
    ],

    // --- 5. Push Notification Token ---
    fcmToken: {
      type: String,
      default: null // Mobile background notification sound/alerts ke liye
    },

    // --- 6. Account Status & Moderation ---
    isSuspended: {
      type: Boolean,
      default: false
    },
    suspensionReason: {
      type: String,
      default: null
    },
    isPhoneVerified: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true // createdAt aur updatedAt auto manage honge
  }
);

// --- Password Hashing Pre-Save Hook ---
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// --- Helper Method: Compare Password ---
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;