const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    specialization: { type: String, required: true },
    phone: { type: String, required: true },
    experienceYears: { type: Number, default: 0, min: 0 },
    consultationFee: { type: Number, required: true, default: 500, min: 0 },
    availableDays: [{ type: String }],
    timeSlots: {
      type: [String],
      default: ["09:00 AM", "10:00 AM", "11:00 AM", "02:00 PM", "03:00 PM", "04:00 PM"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Doctor", doctorSchema);