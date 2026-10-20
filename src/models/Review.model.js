const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    targetDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    targetVehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating cannot be less than 1"],
      max: [5, "Rating cannot exceed 5"]
    },
    feedbackTags: [
      {
        type: String,
        enum: [
          "CLEAN_CAR",
          "POLITE_DRIVER",
          "ON_TIME",
          "AC_WORKING_GREAT",
          "RASH_DRIVING",
          "AC_NOT_COOLING",
          "DIRTY_CAR",
          "ROUTE_ISSUES"
        ]
      }
    ],
    comment: {
      type: String,
      maxlength: [500, "Comment cannot exceed 500 characters"],
      trim: true,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

reviewSchema.index({ targetDriverId: 1, rating: -1 });

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;