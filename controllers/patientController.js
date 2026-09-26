const Patient = require("../models/Patient");
const logger = require("../config/logger");

// GET /api/patients - list all (with optional search)
exports.getPatients = async (req, res) => {
  try {
    const filter = {};
    if (req.query.search) {
      const regex = new RegExp(req.query.search, "i");
      filter.$or = [{ name: regex }, { phone: regex }];
    }
    const patients = await Patient.find(filter).sort({ createdAt: -1 });
    res.json(patients);
  } catch (err) {
    logger.error(`Get patients error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch patients" });
  }
};

// GET /api/patients/:id
exports.getPatient = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: "Patient not found" });
    res.json(patient);
  } catch (err) {
    logger.error(`Get patient error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch patient" });
  }
};

// POST /api/patients
exports.createPatient = async (req, res) => {
  try {
    const patient = await Patient.create(req.body);
    logger.info(`Patient created: ${patient.name} by user ${req.user.email}`);
    res.status(201).json(patient);
  } catch (err) {
    logger.error(`Create patient error: ${err.message}`);
    res.status(400).json({ message: err.message });
  }
};

// PUT /api/patients/:id
exports.updatePatient = async (req, res) => {
  try {
    const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!patient) return res.status(404).json({ message: "Patient not found" });
    logger.info(`Patient updated: ${patient._id} by user ${req.user.email}`);
    res.json(patient);
  } catch (err) {
    logger.error(`Update patient error: ${err.message}`);
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/patients/:id
exports.deletePatient = async (req, res) => {
  try {
    const patient = await Patient.findByIdAndDelete(req.params.id);
    if (!patient) return res.status(404).json({ message: "Patient not found" });
    logger.warn(`Patient DELETED: ${patient._id} (${patient.name}) by user ${req.user.email}`);
    res.json({ message: "Patient deleted" });
  } catch (err) {
    logger.error(`Delete patient error: ${err.message}`);
    res.status(500).json({ message: "Failed to delete patient" });
  }
};