const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const Patient = require("../models/Patient");
const logger = require("../config/logger");
const { createNotification } = require("./notificationController");
const { parseDate, todayString, getSlotsForDate } = require("../utils/schedule");

const STATUSES = ["scheduled", "completed", "cancelled"];

const isObjectId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

// "Dr. Priya" ke aage dobara "Dr." na lage
const withDr = (name) => (/^dr\.?\s/i.test(name) ? name : `Dr. ${name}`);

const dayOf = (appointment) => appointment.date.toISOString().slice(0, 10);

// Logged-in user ka patient/doctor profile (admin ka koi nahi)
const profileOf = (user) => {
  if (user.role === "patient") return Patient.findOne({ user: user._id });
  if (user.role === "doctor") return Doctor.findOne({ user: user._id });
  return null;
};

// Appointment (unpopulated) is user ki hai ya nahi
const ownsAppointment = (appointment, user, profile) => {
  if (user.role === "admin") return true;
  if (!profile) return false;
  const field = user.role === "patient" ? appointment.patient : appointment.doctor;
  return field.toString() === profile._id.toString();
};

// Notification fail ho to main kaam (booking/cancel) nahi rukna chahiye
const notifyParties = async (appointment, kind, skipUserId) => {
  try {
    const [patient, doctor] = await Promise.all([
      Patient.findById(appointment.patient),
      Doctor.findById(appointment.doctor),
    ]);
    if (!patient || !doctor) return;

    const when = `${appointment.date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })} at ${appointment.timeSlot}`;

    const text = {
      booked: {
        patient: `Your appointment with ${withDr(doctor.name)} is confirmed for ${when}`,
        doctor: `New appointment with ${patient.name} on ${when}`,
      },
      cancelled: {
        patient: `Your appointment with ${withDr(doctor.name)} on ${when} was cancelled`,
        doctor: `Appointment with ${patient.name} on ${when} was cancelled`,
      },
    }[kind];

    const targets = [
      { userId: patient.user, message: text.patient },
      { userId: doctor.user, message: text.doctor },
    ];

    for (const target of targets) {
      if (!target.userId) continue;
      if (skipUserId && target.userId.toString() === skipUserId.toString()) continue;
      await createNotification({
        userId: target.userId,
        message: target.message,
        type: "appointment",
        relatedId: appointment._id,
      });
    }
  } catch (err) {
    logger.error(`Appointment notification error: ${err.message}`);
  }
};

// GET /api/appointments?status=&page=&limit= - role ke hisaab se sirf apni
exports.getAppointments = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const filter = {};
    if (req.user.role !== "admin") {
      const profile = await profileOf(req.user);
      if (!profile) return res.json({ appointments: [], total: 0, page: 1, pages: 1 });
      filter[req.user.role] = profile._id; // role ka naam hi field ka naam hai: patient / doctor
    }

    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (STATUSES.includes(status)) filter.status = status;

    // Aane wali appointments me nearest pehle, baaki me latest pehle
    const sort = status === "scheduled" ? { date: 1, createdAt: 1 } : { date: -1, createdAt: -1 };

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("patient", "name age gender")
        .populate("doctor", "name specialization"),
      Appointment.countDocuments(filter),
    ]);

    res.json({ appointments, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    logger.error(`Get appointments error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch appointments" });
  }
};

// GET /api/appointments/:id
exports.getAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    const profile = await profileOf(req.user);
    if (!ownsAppointment(appointment, req.user, profile)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await appointment.populate([
      { path: "patient", select: "name age gender" },
      { path: "doctor", select: "name specialization" },
    ]);
    res.json(appointment);
  } catch (err) {
    logger.error(`Get appointment error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch appointment" });
  }
};

// POST /api/appointments - admin (kisi bhi patient ke liye) ya patient (apne liye)
exports.createAppointment = async (req, res) => {
  try {
    const { doctor: doctorId, date, timeSlot, reason } = req.body;

    // Patient ki pehchaan: patient role ke liye token se, admin ke liye body se
    let patient;
    if (req.user.role === "patient") {
      patient = await Patient.findOne({ user: req.user._id });
      if (!patient) {
        return res.status(403).json({ message: "No patient profile linked to this account" });
      }
    } else {
      if (!isObjectId(req.body.patient)) {
        return res.status(400).json({ message: "A valid patient is required" });
      }
      patient = await Patient.findById(req.body.patient);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
    }

    if (!isObjectId(doctorId)) {
      return res.status(400).json({ message: "A valid doctor is required" });
    }
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    const dateObj = parseDate(date);
    if (!dateObj) {
      return res.status(400).json({ message: "A valid date is required" });
    }
    if (date < todayString()) {
      return res.status(400).json({ message: "You cannot book an appointment in the past" });
    }

    if (typeof timeSlot !== "string") {
      return res.status(400).json({ message: "A time slot is required" });
    }
    if (reason !== undefined && (typeof reason !== "string" || reason.length > 300)) {
      return res.status(400).json({ message: "Reason must be text up to 300 characters" });
    }

    // Server khud check karta hai: din doctor ka working day ho, aur slot sach me free ho
    const { availableSlots, dayOff } = await getSlotsForDate(doctor, dateObj);
    if (dayOff) {
      return res.status(400).json({ message: "The doctor is not available on this day" });
    }
    if (!availableSlots.includes(timeSlot)) {
      return res
        .status(409)
        .json({ message: "This time slot is not available. Please pick another one." });
    }

    const appointment = await Appointment.create({
      patient: patient._id,
      doctor: doctor._id,
      date: dateObj,
      timeSlot,
      reason: typeof reason === "string" ? reason.trim() : undefined,
    });

    logger.info(
      `Appointment created: ${appointment._id} (patient ${patient._id}, doctor ${doctor._id}) by ${req.user.email}`
    );
    await notifyParties(appointment, "booked", null);

    res.status(201).json(appointment);
  } catch (err) {
    // Do log ek hi second me same slot maangein to database ka unique index rokta hai
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ message: "This time slot is not available. Please pick another one." });
    }
    logger.error(`Create appointment error: ${err.message}`);
    res.status(400).json({ message: "Failed to book the appointment" });
  }
};

// PUT /api/appointments/:id - sirf status aur notes badal sakte hain
exports.updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    const profile = await profileOf(req.user);
    if (!ownsAppointment(appointment, req.user, profile)) {
      logger.warn(`Access denied: ${req.user.email} tried to update appointment ${appointment._id}`);
      return res.status(403).json({ message: "Access denied" });
    }

    const isPatient = req.user.role === "patient";
    const allowed = isPatient ? ["status"] : ["status", "notes"];
    const keys = Object.keys(req.body);

    if (keys.length === 0 || keys.some((key) => !allowed.includes(key))) {
      return res.status(isPatient ? 403 : 400).json({
        message: isPatient
          ? "Patients can only cancel their own appointments"
          : "Only status and notes can be updated",
      });
    }

    const { status, notes } = req.body;
    if (isPatient && status !== "cancelled") {
      return res.status(403).json({ message: "Patients can only cancel their own appointments" });
    }

    const update = {};

    if (status !== undefined) {
      if (!["completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Status must be completed or cancelled" });
      }
      if (appointment.status !== "scheduled") {
        return res.status(400).json({ message: `This appointment is already ${appointment.status}` });
      }
      if (status === "completed" && dayOf(appointment) > todayString()) {
        return res
          .status(400)
          .json({ message: "An upcoming appointment cannot be marked as completed" });
      }
      update.status = status;
    }

    if (notes !== undefined) {
      if (typeof notes !== "string" || notes.length > 1000) {
        return res.status(400).json({ message: "Notes must be text up to 1000 characters" });
      }
      update.notes = notes.trim();
    }

    appointment.set(update);
    await appointment.save();

    logger.info(
      `Appointment ${appointment._id} updated (${Object.keys(update).join(", ")}) by ${req.user.email}`
    );
    if (update.status === "cancelled") {
      await notifyParties(appointment, "cancelled", req.user._id);
    }

    res.json(appointment);
  } catch (err) {
    logger.error(`Update appointment error: ${err.message}`);
    res.status(400).json({ message: "Failed to update the appointment" });
  }
};

// DELETE /api/appointments/:id - sirf admin (history ke liye normally cancel karte hain, delete nahi)
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