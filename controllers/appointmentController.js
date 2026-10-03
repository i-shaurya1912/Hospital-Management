const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const Patient = require("../models/Patient");
const logger = require("../config/logger");

// GET /api/appointments - role ke hisaab se filter
exports.getAppointments = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === "patient") {
      const patient = await Patient.findOne({ user: req.user._id });
      if (!patient) return res.json([]); // profile nahi bana to koi appointment ho hi nahi sakti
      filter.patient = patient._id;
    } else if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({ user: req.user._id });
      if (!doctor) return res.json([]);
      filter.doctor = doctor._id;
    }
    // admin ke liye filter khali rehta hai - sab dikhega

    if (req.query.status) filter.status = req.query.status;

    const appointments = await Appointment.find(filter)
      .populate("patient", "name age gender phone")
      .populate("doctor", "name specialization")
      .sort({ date: -1 });

    res.json(appointments);
  } catch (err) {
    logger.error(`Get appointments error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch appointments" });
  }
};

// GET /api/appointments/:id
exports.getAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("patient")
      .populate("doctor");
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    if (req.user.role === "patient") {
      const patient = await Patient.findOne({ user: req.user._id });
      if (!patient || appointment.patient._id.toString() !== patient._id.toString()) {
        return res.status(403).json({ message: "Access denied" });
      }
    } else if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({ user: req.user._id });
      if (!doctor || appointment.doctor._id.toString() !== doctor._id.toString()) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    res.json(appointment);
  } catch (err) {
    logger.error(`Get appointment error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch appointment" });
  }
};

// POST /api/appointments
exports.createAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.create(req.body);
    logger.info(`Appointment created: patient ${appointment.patient} with doctor ${appointment.doctor} by ${req.user.email}`);
    res.status(201).json(appointment);
  } catch (err) {
    // Duplicate slot booking - MongoDB ka unique index violation
    if (err.code === 11000) {
      return res.status(409).json({ message: "This time slot is already booked for this doctor" });
    }
    logger.error(`Create appointment error: ${err.message}`);
    res.status(400).json({ message: err.message });
  }
};

// PUT /api/appointments/:id - status update (complete/cancel)
exports.updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    // Patient sirf apni appointment cancel kar sakta hai, kuch aur edit nahi
    if (req.user.role === "patient") {
      const patient = await Patient.findOne({ user: req.user._id });
      const isOwn = patient && appointment.patient.toString() === patient._id.toString();
      if (!isOwn) return res.status(403).json({ message: "Access denied" });
      if (Object.keys(req.body).some((key) => key !== "status") || req.body.status !== "cancelled") {
        return res.status(403).json({ message: "Patients can only cancel their own appointments" });
      }
    }

    const updated = await Appointment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    logger.info(`Appointment updated: ${updated._id} by ${req.user.email}`);
    res.json(updated);
  } catch (err) {
    logger.error(`Update appointment error: ${err.message}`);
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/appointments/:id - sirf admin/doctor
exports.deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndDelete(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    logger.warn(`Appointment DELETED: ${appointment._id} by ${req.user.email}`);
    res.json({ message: "Appointment deleted" });
  } catch (err) {
    logger.error(`Delete appointment error: ${err.message}`);
    res.status(500).json({ message: "Failed to delete appointment" });
  }
};