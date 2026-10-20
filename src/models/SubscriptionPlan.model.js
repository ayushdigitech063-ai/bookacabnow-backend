const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema(
  {
    planName: {
      type: String,
      required: [true, "Plan name is required"], // e.g., "Agency Starter", "Fleet Pro"
      trim: true,
      unique: true
    },
    tagline: {
      type: String,
      default: "Best for growing fleet agencies",
      trim: true
    },
    durationInDays: {
      type: Number,
      required: [true, "Plan duration in days is required"],
      default: 30 // 30 days, 90 days, 365 days
    },
    maxCarSlots: {
      type: Number,
      required: [true, "Car slot limit is required"], // Kitni cars list ho sakti hain (e.g., 5, 15, 100)
      min: [1, "Plan must allow at least 1 car slot"]
    },
    price: {
      type: Number,
      required: [true, "Plan price in INR is required"],
      min: [0, "Price cannot be negative"]
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    features: [
      {
        type: String,
        trim: true // e.g., ["Priority Dispatch", "24/7 Agency Support", "Detailed Fleet Analytics"]
      }
    ],
    isPopular: {
      type: Boolean,
      default: false // Pricing page par "Most Popular" highlight tag ke liye
    },
    isActive: {
      type: Boolean,
      default: true // Agar admin kisi plan ko disable/archive karna chahe
    }
  },
  {
    timestamps: true
  }
);

const SubscriptionPlan = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);

module.exports = SubscriptionPlan;