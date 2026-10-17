const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["appointment", "billing", "prescription", "general"],
      default: "general",
    },
    read: { type: Boolean, default: false },
    relatedId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);