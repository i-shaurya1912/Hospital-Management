const MedicalRecord = require("../models/MedicalRecord");
const Patient = require("../models/Patient");
const logger = require("../config/logger");
const fs = require("fs");
const path = require("path");

exports.getRecords = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === "patient") {
      const patient = await Patient.findOne({ user: req.user._id });
      if (!patient) return res.json([]);
      filter.patient = patient._id;
    } else if (req.query.patient) {
      filter.patient = req.query.patient; // admin/doctor kisi specific patient ke records maang sakte hain
    }

    const records = await MedicalRecord.find(filter).sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    logger.error(`Get records error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch records" });
  }
};

exports.uploadRecord = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    if (!req.body.patient || !req.body.title) {
      // Agar validation fail ho, upload ho chuki file ko bhi delete kar do (orphan file na bache)
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: "patient and title are required" });
    }

    const record = await MedicalRecord.create({
      patient: req.body.patient,
      title: req.body.title,
      description: req.body.description,
      fileName: req.file.originalname,
      filePath: `/uploads/${req.file.filename}`,
      fileType: req.file.mimetype,
      uploadedBy: req.user._id,
    });

    logger.info(`Medical record uploaded: ${record._id} by ${req.user.email}`);
    res.status(201).json(record);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    logger.error(`Upload record error: ${err.message}`);
    res.status(400).json({ message: err.message });
  }
};

exports.deleteRecord = async (req, res) => {
  try {
    const record = await MedicalRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Record not found" });

    const filePath = path.join(__dirname, "..", record.filePath);
    fs.unlink(filePath, () => {});

    await record.deleteOne();
    logger.warn(`Medical record DELETED: ${record._id} (${record.title}) by ${req.user.email}`);
    res.json({ message: "Record deleted" });
  } catch (err) {
    logger.error(`Delete record error: ${err.message}`);
    res.status(500).json({ message: "Failed to delete record" });
  }
};