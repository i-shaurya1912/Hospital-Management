const Doctor = require("../models/Doctor");
const Appointment = require("../models/Appointment");
const logger = require("../config/logger");

// GET /api/doctors - sabko dikh sakta hai (patients ko doctor list dekhni hi hoti hai booking ke liye)
exports.getDoctors = async (req, res) => {
  try {
    const filter = {};
    if (req.query.search) {
      const regex = new RegExp(req.query.search, "i");
      filter.$or = [{ name: regex }, { specialization: regex }];
    }
    const doctors = await Doctor.find(filter).sort({ createdAt: -1 });
    res.json(doctors);
  } catch (err) {
    logger.error(`Get doctors error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch doctors" });
  }
};

// GET /api/doctors/:id
exports.getDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    res.json(doctor);
  } catch (err) {
    logger.error(`Get doctor error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch doctor" });
  }
};

// GET /api/doctors/:id/slots?date=YYYY-MM-DD - available time slots
exports.getAvailableSlots = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date query param is required" });

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const bookedAppointments = await Appointment.find({
      doctor: doctor._id,
      date: { $gte: dayStart, $lte: dayEnd },
      status: { $ne: "cancelled" },
    });

    const bookedSlots = bookedAppointments.map((a) => a.timeSlot);
    const availableSlots = doctor.timeSlots.filter((slot) => !bookedSlots.includes(slot));

    res.json({ availableSlots, bookedSlots });
  } catch (err) {
    logger.error(`Get slots error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch available slots" });
  }
};

// POST /api/doctors - sirf admin
exports.createDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.create(req.body);
    logger.info(`Doctor created: ${doctor.name} by user ${req.user.email}`);
    res.status(201).json(doctor);
  } catch (err) {
    logger.error(`Create doctor error: ${err.message}`);
    res.status(400).json({ message: err.message });
  }
};

// PUT /api/doctors/:id - admin, ya doctor khud apna profile
exports.updateDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    // Ownership check: ek doctor sirf apna hi profile edit kar sakta hai, kisi aur ka nahi
    if (req.user.role === "doctor") {
      const isOwnProfile = doctor.user && doctor.user.toString() === req.user._id.toString();
      if (!isOwnProfile) {
        logger.warn(`Access denied: ${req.user.email} tried to edit doctor ${doctor._id}`);
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const updated = await Doctor.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    logger.info(`Doctor updated: ${updated._id} by user ${req.user.email}`);
    res.json(updated);
  } catch (err) {
    logger.error(`Update doctor error: ${err.message}`);
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/doctors/:id - sirf admin
exports.deleteDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findByIdAndDelete(req.params.id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    logger.warn(`Doctor DELETED: ${doctor._id} (${doctor.name}) by user ${req.user.email}`);
    res.json({ message: "Doctor deleted" });
  } catch (err) {
    logger.error(`Delete doctor error: ${err.message}`);
    res.status(500).json({ message: "Failed to delete doctor" });
  }
};