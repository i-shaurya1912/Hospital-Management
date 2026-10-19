const mongoose = require("mongoose");
const logger = require("../config/logger");

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
    date: { type: Date, required: true },
    timeSlot: { type: String, required: true },
    reason: { type: String, maxlength: 300 },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled"],
      default: "scheduled",
    },
    notes: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

// Ek doctor, ek date, ek slot par sirf ek "scheduled" appointment ho sakti hai.
// Cancel hone par slot wapas free ho jata hai. ($ne partial index me allowed nahi, isliye equality)
appointmentSchema.index(
  { doctor: 1, date: 1, timeSlot: 1 },
  { unique: true, partialFilterExpression: { status: "scheduled" } }
);

const Appointment = mongoose.model("Appointment", appointmentSchema);

// Index banne me error aaye to chup-chap fail na ho
Appointment.on("index", (err) => {
  if (err) logger.error(`Appointment index error: ${err.message}`);
});

module.exports = Appointment;