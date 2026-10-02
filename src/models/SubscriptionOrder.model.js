const mongoose = require("mongoose");

const subscriptionOrder = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true // e.g. "ORD-SUB-1024"
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true // e.g. "INV-SUB-1024"
    },

    fleetCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FleetCompany",
      required: true,
      index: true
    },
    orderedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Freeze details of the fleet owner placing the order
    buyerDetails: {
      companyName: { type: String, required: true },
      ownerName: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true },
      gstNumber: { type: String, default: "N/A" },
      billingAddress: {
        city: { type: String, required: true },
        state: { type: String, default: "Rajasthan" },
        pincode: { type: String, default: "" }
      }
    },

    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true
    },
    planSnapshot: {
      planName: { type: String, required: true },
      maxCarSlots: { type: Number, required: true },
      durationInDays: { type: Number, required: true }
    },

    amountPaid: {
      type: Number,
      required: true
    },
    gstAmount: {
      type: Number,
      default: 0
    },

    startsAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },

    orderStatus: {
      type: String,
      enum: ["PLACED", "COMPLETED", "FAILED", "CANCELLED"],
      default: "PLACED"
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
      index: true
    },
    paymentGateway: {
      type: String,
      enum: ["RAZORPAY", "CASHFREE", "PHONEPE", "MANUAL"],
      default: "RAZORPAY"
    },
    gatewayOrderId: {
      type: String,
      default: null
    },
    gatewayPaymentId: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

planOrderSchema.index({ fleetCompanyId: 1, paymentStatus: 1 });

const SubscriptionOrder = mongoose.model("PlanOrder", subscriptionOrder);

module.exports = SubscriptionOrder;