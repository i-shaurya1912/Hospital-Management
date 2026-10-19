const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Patient = require("../models/Patient");
const logger = require("../config/logger");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const isText = (value) => typeof value === "string" && value.trim().length > 0;

// POST /api/auth/register - public signup sirf patient ke liye
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, age, gender } = req.body;

    if (![name, email, password, phone].every(isText)) {
      return res.status(400).json({ message: "Name, email, phone and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    const ageNum = Number(age);
    if (!Number.isInteger(ageNum) || ageNum < 0 || ageNum > 150) {
      return res.status(400).json({ message: "Please enter a valid age" });
    }
    if (!["male", "female", "other"].includes(gender)) {
      return res.status(400).json({ message: "Please select a gender" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Role body se kabhi nahi liya jata, public signup hamesha patient hota hai
    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password,
      role: "patient",
    });

    try {
      const patient = await Patient.create({
        user: user._id,
        name: user.name,
        age: ageNum,
        gender,
        phone: phone.trim(),
      });
      user.patientProfile = patient._id;
      await user.save();
    } catch (profileErr) {
      await user.deleteOne(); // profile na bane to adhura account na bache
      throw profileErr;
    }

    logger.info(`New patient registered: ${cleanEmail}`);

    res.status(201).json({
      token: signToken(user._id),
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    logger.error(`Register error: ${err.message}`);
    res.status(500).json({ message: "Something went wrong, please try again" });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isText(email) || !isText(password)) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Hamesha same generic message, taaki pata na chale email registered hai ya nahi
    if (!user || !(await user.comparePassword(password))) {
      logger.warn(`Failed login attempt for: ${email}`);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    logger.info(`User logged in: ${user.email}`);

    res.json({
      token: signToken(user._id),
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    res.status(500).json({ message: "Something went wrong, please try again" });
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};