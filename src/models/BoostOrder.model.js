const mongoose = require("mongoose");

const boostOrderSchema = new mongoose.Schema(
  {
    boostOrderId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true // e.g. "BOOST-9810"
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

    // Freeze details of the agency placing the boost order
    buyerDetails: {
      companyName: { type: String, required: true },
      ownerName: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true }
    },

    // Multi-car selection with snapshots for fast frontend rendering
    boostedCars: [
      {
        vehicleId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Vehicle",
          required: true
        },
        brand: { type: String, required: true },
        model: { type: String, required: true },
        category: {
          type: String,
          enum: ["HATCHBACK", "SEDAN", "SUV", "INNOVA", "LUXURY", "BUS"],
          required: true
        },
        plateNumber: { type: String, required: true },
        seatingCapacity: { type: Number, required: true },
        fuelType: { type: String, required: true },
        expectedPerKmRate: { type: Number, required: true },
        imageUrl: { type: String, default: null },
        badgeText: { type: String, default: "TOP TRENDING" }
      }
    ],

    totalCarsCount: {
      type: Number,
      required: true
    },
    ratePerCar: {
      type: Number,
      required: true,
      default: 299
    },
    totalAmountPaid: {
      type: Number,
      required: true
    },
    durationDays: {
      type: Number,
      default: 30
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
    isActive: {
      type: Boolean,
      default: false
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

boostOrderSchema.index({ fleetCompanyId: 1, paymentStatus: 1 });
boostOrderSchema.index({ isActive: 1, expiresAt: 1 });

const BoostOrder = mongoose.model("BoostOrder", boostOrderSchema);

module.exports = BoostOrder;