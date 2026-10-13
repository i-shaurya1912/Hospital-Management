const Prescription = require("../models/Prescription");
const Doctor = require("../models/Doctor");
const Patient = require("../models/Patient");
const logger = require("../config/logger");

exports.getPrescriptions = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === "patient") {
      const patient = await Patient.findOne({ user: req.user._id });
      if (!patient) return res.json([]);
      filter.patient = patient._id;
    } else if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({ user: req.user._id });
      if (!doctor) return res.json([]);
      filter.doctor = doctor._id;
    }

    const prescriptions = await Prescription.find(filter)
      .populate("patient", "name age gender")
      .populate("doctor", "name specialization")
      .sort({ createdAt: -1 });

    res.json(prescriptions);
  } catch (err) {
    logger.error(`Get prescriptions error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch prescriptions" });
  }
};

exports.createPrescription = async (req, res) => {
  try {
    const payload = { ...req.body };

    if (req.user.role === "doctor") {
      // Doctor ki identity token se aati hai, body se nahi
      const doctor = await Doctor.findOne({ user: req.user._id });
      if (!doctor) {
        return res.status(403).json({ message: "No doctor profile linked to this account" });
      }
      payload.doctor = doctor._id;
    } else if (!payload.doctor) {
      return res.status(400).json({ message: "doctor is required" });
    }

    const prescription = await Prescription.create(payload);
    logger.info(`Prescription created: ${prescription._id} by ${req.user.email}`);
    res.status(201).json(prescription);
  } catch (err) {
    logger.error(`Create prescription error: ${err.message}`);
    res.status(400).json({ message: err.message });
  }
};

exports.deletePrescription = async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id);
    if (!prescription) return res.status(404).json({ message: "Prescription not found" });

    if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({ user: req.user._id });
      const isOwn = doctor && prescription.doctor.toString() === doctor._id.toString();
      if (!isOwn) return res.status(403).json({ message: "Access denied" });
    }

    await prescription.deleteOne();
    logger.warn(`Prescription DELETED: ${prescription._id} by ${req.user.email}`);
    res.json({ message: "Prescription deleted" });
  } catch (err) {
    logger.error(`Delete prescription error: ${err.message}`);
    res.status(500).json({ message: "Failed to delete prescription" });
  }
};