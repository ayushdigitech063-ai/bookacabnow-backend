const mongoose = require("mongoose");

const fleetCompanySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    companyName: {
      type: String,
      required: [true, "Company name is required"],
      trim: true
    },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: null
    },
    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: null
    },
    businessAddress: {
      street: { type: String, default: "" },
      city: { type: String, required: true },
      state: { type: String, default: "Rajasthan" },
      pincode: { type: String, default: "" }
    },
    bankDetails: {
      accountNumber: { type: String, default: null },
      ifscCode: { type: String, default: null },
      holderName: { type: String, default: null }
    },
    // SaaS Subscription Slots Tracking
    subscription: {
      planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
      status: { type: String, enum: ["TRIAL", "ACTIVE", "EXPIRED", "NONE"], default: "NONE" },
      maxCarSlots: { type: Number, default: 0 },
      expiresAt: { type: Date, default: null }
    },
    kycStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING"
    },
    rejectionReason: {
      type: String,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

const FleetCompany = mongoose.model("FleetCompany", fleetCompanySchema);

module.exports = FleetCompany;