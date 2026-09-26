const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const logger = require("../config/logger");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// @route POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, extra } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Security: kabhi bhi client se seedha "admin" role accept mat karo public registration me
    const safeRole = role === "doctor" ? "doctor" : "patient";

    const user = await User.create({ name, email, password, role: safeRole });

    if (user.role === "patient") {
      const patient = await Patient.create({
        user: user._id,
        name,
        age: extra?.age || 0,
        gender: extra?.gender || "other",
        phone: extra?.phone || "N/A",
      });
      user.patientProfile = patient._id;
      await user.save();
    } else if (user.role === "doctor") {
      const doctor = await Doctor.create({
        user: user._id,
        name,
        specialization: extra?.specialization || "General",
        phone: extra?.phone || "N/A",
        consultationFee: extra?.consultationFee || 500,
      });
      user.doctorProfile = doctor._id;
      await user.save();
    }

    logger.info(`New user registered: ${email} (${user.role})`);

    const token = signToken(user._id);
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    logger.error(`Register error: ${err.message}`);
    res.status(500).json({ message: "Something went wrong, please try again" });
  }
};

// @route POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });

    // Security: hamesha same generic message do, chahe email na mile ya password galat ho
    if (!user || !(await user.comparePassword(password))) {
      logger.warn(`Failed login attempt for: ${email}`);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    logger.info(`User logged in: ${email}`);

    const token = signToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    res.status(500).json({ message: "Something went wrong, please try again" });
  }
};

// @route GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};