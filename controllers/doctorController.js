const Doctor = require("../models/Doctor");
const Appointment = require("../models/Appointment");
const User = require("../models/User");
const logger = require("../config/logger");

const { parseDate, getSlotsForDate } = require("../utils/schedule");

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_REGEX = /^(0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Doctor khud sirf ye fields badal sakta hai. Name, specialization, fee sirf admin.
const DOCTOR_SELF_EDITABLE = ["phone", "experienceYears", "availableDays", "timeSlots"];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isText = (value, max) =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

// "02:00 PM" ko minutes me badalta hai, taaki slots time ke hisaab se sort ho sakein
const slotToMinutes = (slot) => {
  const [time, meridiem] = slot.split(" ");
  const [hours, minutes] = time.split(":").map(Number);
  return ((hours % 12) + (meridiem === "PM" ? 12 : 0)) * 60 + minutes;
};

// Role ke hisaab se doctor ka kitna data dikhana hai
const shapeQuery = (query, role) => {
  if (role === "admin") return query.populate("user", "email");
  if (role === "patient") return query.select("-user -phone"); // patient ko personal number nahi
  return query.select("-user");
};

// Body se sirf allowed fields lo aur validate karo
const cleanDoctorInput = (body, { requireAll }) => {
  const data = {};

  if (body.name !== undefined || requireAll) {
    if (!isText(body.name, 100)) return { error: "Name is required (max 100 characters)" };
    data.name = body.name.trim();
  }
  if (body.specialization !== undefined || requireAll) {
    if (!isText(body.specialization, 100)) {
      return { error: "Specialization is required (max 100 characters)" };
    }
    data.specialization = body.specialization.trim();
  }
  if (body.phone !== undefined || requireAll) {
    if (!isText(body.phone, 20)) return { error: "Phone is required (max 20 characters)" };
    data.phone = body.phone.trim();
  }
  if (body.consultationFee !== undefined || requireAll) {
    const fee = body.consultationFee;
    if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0 || fee > 100000) {
      return { error: "Consultation fee must be between 0 and 100000" };
    }
    data.consultationFee = fee;
  }
  if (body.experienceYears !== undefined) {
    const years = body.experienceYears;
    if (!Number.isInteger(years) || years < 0 || years > 70) {
      return { error: "Experience must be a whole number between 0 and 70" };
    }
    data.experienceYears = years;
  }
  if (body.availableDays !== undefined) {
    const days = body.availableDays;
    if (!Array.isArray(days) || !days.every((day) => DAYS.includes(day))) {
      return { error: "Invalid available days" };
    }
    data.availableDays = DAYS.filter((day) => days.includes(day)); // duplicate hatao, week ke order me
  }
  if (body.timeSlots !== undefined) {
    const slots = body.timeSlots;
    const valid =
      Array.isArray(slots) &&
      slots.length >= 1 &&
      slots.length <= 20 &&
      slots.every((slot) => typeof slot === "string" && SLOT_REGEX.test(slot));
    if (!valid) return { error: "Time slots must look like 09:00 AM (1 to 20 slots)" };
    data.timeSlots = [...new Set(slots)].sort((a, b) => slotToMinutes(a) - slotToMinutes(b));
  }

  return { data };
};

// GET /api/doctors?search=&page=&limit=
exports.getDoctors = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 9, 1), 50);

    const filter = {};
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 50) : "";
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: regex }, { specialization: regex }];
    }

    const query = Doctor.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const [doctors, total] = await Promise.all([
      shapeQuery(query, req.user.role),
      Doctor.countDocuments(filter),
    ]);

    res.json({ doctors, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    logger.error(`Get doctors error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch doctors" });
  }
};

// GET /api/doctors/:id
exports.getDoctor = async (req, res) => {
  try {
    const doctor = await shapeQuery(Doctor.findById(req.params.id), req.user.role);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    res.json(doctor);
  } catch (err) {
    logger.error(`Get doctor error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch doctor" });
  }
};

// GET /api/doctors/:id/slots?date=YYYY-MM-DD
exports.getAvailableSlots = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    const date = parseDate(req.query.date);
    if (!date) {
      return res.status(400).json({ message: "date must be a valid date in YYYY-MM-DD format" });
    }

    res.json(await getSlotsForDate(doctor, date));
  } catch (err) {
    logger.error(`Get slots error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch available slots" });
  }
};

// POST /api/doctors - sirf admin. Doctor ka profile aur login account ek sath banta hai.
exports.createDoctor = async (req, res) => {
  let user = null;
  let doctor = null;

  try {
    const { data, error } = cleanDoctorInput(req.body, { requireAll: true });
    if (error) return res.status(400).json({ message: error });

    const { email, password } = req.body;
    if (typeof email !== "string" || email.trim().length > 100 || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ message: "A valid email is required" });
    }
    // 72 se upar bcrypt password ko chup-chap kaat deta hai, isliye limit
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 72 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      return res.status(400).json({
        message: "Password must be 10-72 characters and include a letter and a number",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (await User.findOne({ email: cleanEmail })) {
      return res.status(400).json({ message: "Email already registered" });
    }

    user = await User.create({ name: data.name, email: cleanEmail, password, role: "doctor" });
    doctor = await Doctor.create({ ...data, user: user._id });
    user.doctorProfile = doctor._id;
    await user.save();

    logger.info(`Doctor created: ${doctor._id} (${cleanEmail}) by ${req.user.email}`);
    res.status(201).json(doctor);
  } catch (err) {
    // Beech me kuch fail ho to adhura account na bache
    if (doctor) await doctor.deleteOne().catch(() => {});
    if (user) await user.deleteOne().catch(() => {});

    if (err.code === 11000) {
      return res.status(400).json({ message: "Email already registered" });
    }
    logger.error(`Create doctor error: ${err.message}`);
    res.status(400).json({ message: "Failed to create doctor" });
  }
};

// PUT /api/doctors/:id - admin sab kuch, doctor sirf apna limited profile
exports.updateDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    if (req.user.role === "doctor") {
      const isOwnProfile = doctor.user && doctor.user.toString() === req.user._id.toString();
      if (!isOwnProfile) {
        logger.warn(`Access denied: ${req.user.email} tried to edit doctor ${doctor._id}`);
        return res.status(403).json({ message: "Access denied" });
      }
      const blocked = Object.keys(req.body).filter((key) => !DOCTOR_SELF_EDITABLE.includes(key));
      if (blocked.length > 0) {
        return res.status(403).json({
          message: "Doctors can only update phone, experience, available days and time slots",
        });
      }
    }

    const { data, error } = cleanDoctorInput(req.body, { requireAll: false });
    if (error) return res.status(400).json({ message: error });
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const updated = await Doctor.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );

    // Naam login account me bhi hai, dono jagah same rehna chahiye
    if (data.name && updated.user) {
      await User.findByIdAndUpdate(updated.user, { name: data.name });
    }

    logger.info(`Doctor updated: ${updated._id} by ${req.user.email}`);
    res.json(updated);
  } catch (err) {
    logger.error(`Update doctor error: ${err.message}`);
    res.status(400).json({ message: "Failed to update doctor" });
  }
};

// DELETE /api/doctors/:id - sirf admin
exports.deleteDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    const scheduled = await Appointment.countDocuments({ doctor: doctor._id, status: "scheduled" });
    if (scheduled > 0) {
      return res.status(409).json({
        message: `This doctor has ${scheduled} scheduled appointment${scheduled === 1 ? "" : "s"}. Cancel or complete them first.`,
      });
    }

    // Pehle login account hatao (access band), phir profile
    if (doctor.user) await User.findByIdAndDelete(doctor.user);
    await doctor.deleteOne();

    logger.warn(`Doctor DELETED: ${doctor._id} (${doctor.name}) by ${req.user.email}`);
    res.json({ message: "Doctor deleted" });
  } catch (err) {
    logger.error(`Delete doctor error: ${err.message}`);
    res.status(500).json({ message: "Failed to delete doctor" });
  }
};