const Patient = require("../models/Patient");
const logger = require("../config/logger");

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Search text me regex ke special characters ( . * ( [ ) ko normal text bana deta hai
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isText = (value, max) =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

// Body se sirf allowed fields lo aur validate karo. "user" jaisa field kabhi aage nahi jayega.
const cleanPatientInput = (body, { requireAll }) => {
  const data = {};

  if (body.name !== undefined || requireAll) {
    if (!isText(body.name, 100)) return { error: "Name is required (max 100 characters)" };
    data.name = body.name.trim();
  }
  if (body.age !== undefined || requireAll) {
    const { age } = body;
    if (typeof age !== "number" || !Number.isInteger(age) || age < 0 || age > 150) {
      return { error: "Please enter a valid age (0-150)" };
    }
    data.age = age;
  }
  if (body.gender !== undefined || requireAll) {
    if (!["male", "female", "other"].includes(body.gender)) {
      return { error: "Please select a valid gender" };
    }
    data.gender = body.gender;
  }
  if (body.phone !== undefined || requireAll) {
    if (!isText(body.phone, 20)) return { error: "Phone is required (max 20 characters)" };
    data.phone = body.phone.trim();
  }
  if (body.bloodGroup !== undefined) {
    if (body.bloodGroup !== "" && !BLOOD_GROUPS.includes(body.bloodGroup)) {
      return { error: "Invalid blood group" };
    }
    data.bloodGroup = body.bloodGroup;
  }
  if (body.address !== undefined) {
    if (typeof body.address !== "string" || body.address.length > 300) {
      return { error: "Address is too long (max 300 characters)" };
    }
    data.address = body.address.trim();
  }
  if (body.medicalHistory !== undefined) {
    const list = body.medicalHistory;
    if (!Array.isArray(list) || list.length > 30 || !list.every((item) => isText(item, 100))) {
      return { error: "Medical history must be a list of short text items" };
    }
    data.medicalHistory = list.map((item) => item.trim());
  }

  return { data };
};

// GET /api/patients?search=&page=&limit= - admin/doctor
exports.getPatients = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const filter = {};
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 50) : "";
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: regex }, { phone: regex }];
    }

    const [patients, total] = await Promise.all([
      Patient.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Patient.countDocuments(filter),
    ]);

    res.json({ patients, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
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

    if (req.user.role === "patient") {
      const isOwnRecord = patient.user && patient.user.toString() === req.user._id.toString();
      if (!isOwnRecord) {
        logger.warn(`Access denied: ${req.user.email} tried to read patient ${patient._id}`);
        return res.status(403).json({ message: "Access denied" });
      }
    }

    res.json(patient);
  } catch (err) {
    logger.error(`Get patient error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch patient" });
  }
};

// POST /api/patients - admin/doctor (walk-in patient, login account ke bina)
exports.createPatient = async (req, res) => {
  try {
    const { data, error } = cleanPatientInput(req.body, { requireAll: true });
    if (error) return res.status(400).json({ message: error });

    const patient = await Patient.create(data);
    logger.info(`Patient created: ${patient._id} by user ${req.user.email}`);
    res.status(201).json(patient);
  } catch (err) {
    logger.error(`Create patient error: ${err.message}`);
    res.status(400).json({ message: "Failed to create patient" });
  }
};

// PUT /api/patients/:id - admin/doctor
exports.updatePatient = async (req, res) => {
  try {
    const { data, error } = cleanPatientInput(req.body, { requireAll: false });
    if (error) return res.status(400).json({ message: error });
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    logger.info(`Patient updated: ${patient._id} by user ${req.user.email}`);
    res.json(patient);
  } catch (err) {
    logger.error(`Update patient error: ${err.message}`);
    res.status(400).json({ message: "Failed to update patient" });
  }
};

// DELETE /api/patients/:id - sirf admin
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