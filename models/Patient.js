const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    age: { type: Number, required: true, min: 0, max: 150 },
    gender: { type: String, enum: ["male", "female", "other"], required: true },
    phone: { type: String, required: true },
    address: { type: String },
    bloodGroup: { type: String },
    medicalHistory: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Patient", patientSchema);