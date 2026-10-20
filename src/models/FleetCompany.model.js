// src/models/FleetCompany.model.js
const mongoose = require("mongoose");

const fleetCompanySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    companyName: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
    },
    // Required for dynamic routing: /company/:slug
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    tagline: {
      type: String,
      default: "Premier taxi service operator offering clean cars and route-expert drivers.",
      trim: true,
    },
    aboutUs: {
      type: String,
      default: "Premier taxi service operator based in Jaipur offering clean cars and route-expert drivers.",
      trim: true,
    },
    logoUrl: {
      type: String,
      default: null,
    },
    bannerUrl: {
      type: String,
      default: null,
    },

    // Business Legal & Tax Information
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    businessAddress: {
      street: { type: String, default: "" },
      city: { type: String, required: true },
      state: { type: String, default: "Rajasthan" },
      pincode: { type: String, default: "" },
    },
    bankDetails: {
      accountNumber: { type: String, default: null },
      ifscCode: { type: String, default: null },
      holderName: { type: String, default: null },
    },

    // Operating Cities Filter (e.g. ["Jaipur", "Delhi"])
    operatingCities: {
      type: [String],
      default: ["Jaipur", "Rajasthan"],
    },

    // Direct Booking Desk (Powers "Call Operator" & "WhatsApp" buttons)
    contactDesk: {
      helplinePhone: {
        type: String,
        default: "+91 98765 43210",
      },
      whatsappNumber: {
        type: String,
        default: "+91 98765 43210",
      },
      officeAddress: {
        type: String,
        default: "Main Transport Hub, Jaipur, Rajasthan",
      },
      operatingHours: {
        type: String,
        default: "24 Hours / 7 Days a Week",
      },
    },

    // Marketplace Stats & Trust Counters
    stats: {
      successfulRidesCount: {
        type: String,
        default: "12,500+",
      },
      punctualityRecord: {
        type: String,
        default: "100% On-Time",
      },
      averageRating: {
        type: Number,
        default: 4.9,
      },
      customerReviewsCount: {
        type: Number,
        default: 180,
      },
    },

    // SaaS Subscription Slots Tracking
    subscription: {
      planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubscriptionPlan",
        default: null,
      },
      status: {
        type: String,
        enum: ["TRIAL", "ACTIVE", "EXPIRED", "NONE"],
        default: "ACTIVE",
      },
      maxCarSlots: {
        type: Number,
        default: 50,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
    },

    kycStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "APPROVED",
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    isVerifiedOperator: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// High-speed lookup indexes
fleetCompanySchema.index({ slug: 1 });
fleetCompanySchema.index({ operatingCities: 1 });

const FleetCompany = mongoose.model("FleetCompany", fleetCompanySchema);

module.exports = FleetCompany;