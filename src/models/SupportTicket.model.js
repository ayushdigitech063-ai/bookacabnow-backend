const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
  {
    ticketCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true
    },
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null
    },
    category: {
      type: String,
      enum: [
        "FARE_DISPUTE",
        "LOST_ITEM",
        "DRIVER_BEHAVIOR",
        "VEHICLE_BREAKDOWN",
        "SAFETY_ISSUE",
        "SUBSCRIPTION_BILLING",
        "OTHER"
      ],
      required: true
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM"
    },
    subject: {
      type: String,
      required: [true, "Ticket subject is required"],
      trim: true
    },
    description: {
      type: String,
      required: [true, "Issue description is required"],
      trim: true
    },
    attachments: [
      {
        type: String
      }
    ],
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
      default: "OPEN",
      index: true
    },
    conversationThread: [
      {
        senderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true
        },
        senderRole: {
          type: String,
          enum: ["RIDER", "INDIVIDUAL_DRIVER", "FLEET_DRIVER", "FLEET_OWNER", "ADMIN"],
          required: true
        },
        message: {
          type: String,
          required: true,
          trim: true
        },
        sentAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    resolvedAt: {
      type: Date,
      default: null
    },
    resolutionNotes: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

supportTicketSchema.index({ status: 1, priority: -1 });

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);

module.exports = SupportTicket;