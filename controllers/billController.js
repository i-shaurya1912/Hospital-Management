const Bill = require("../models/Bill");
const Patient = require("../models/Patient");
const logger = require("../config/logger");

// GET /api/bills - admin sabko dekhe, patient sirf apna
exports.getBills = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === "patient") {
      const patient = await Patient.findOne({ user: req.user._id });
      if (!patient) return res.json([]);
      filter.patient = patient._id;
    }
    // admin ke liye filter khali - sab dikhega

    if (req.query.status) filter.status = req.query.status;

    const bills = await Bill.find(filter)
      .populate("patient", "name phone")
      .populate("appointment")
      .sort({ createdAt: -1 });

    res.json(bills);
  } catch (err) {
    logger.error(`Get bills error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch bills" });
  }
};

// GET /api/bills/:id
exports.getBill = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id).populate("patient").populate("appointment");
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    if (req.user.role === "patient") {
      const patient = await Patient.findOne({ user: req.user._id });
      if (!patient || bill.patient._id.toString() !== patient._id.toString()) {
        logger.warn(`Access denied: ${req.user.email} tried to read bill ${bill._id}`);
        return res.status(403).json({ message: "Access denied" });
      }
    }

    res.json(bill);
  } catch (err) {
    logger.error(`Get bill error: ${err.message}`);
    res.status(500).json({ message: "Failed to fetch bill" });
  }
};

// POST /api/bills - sirf admin
exports.createBill = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "At least one bill item is required" });
    }

    const totalAmount = items.reduce((sum, item) => sum + Number(item.amount), 0);
    const bill = await Bill.create({ ...req.body, totalAmount });

    logger.info(`Bill created: ${bill._id} (₹${totalAmount}) by ${req.user.email}`);
    res.status(201).json(bill);
  } catch (err) {
    logger.error(`Create bill error: ${err.message}`);
    res.status(400).json({ message: err.message });
  }
};

// PUT /api/bills/:id - sirf admin
exports.updateBill = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.items) {
      payload.totalAmount = payload.items.reduce((sum, item) => sum + Number(item.amount), 0);
    }

    const bill = await Bill.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    logger.info(`Bill updated: ${bill._id} (status: ${bill.status}) by ${req.user.email}`);
    res.json(bill);
  } catch (err) {
    logger.error(`Update bill error: ${err.message}`);
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/bills/:id - sirf admin
exports.deleteBill = async (req, res) => {
  try {
    const bill = await Bill.findByIdAndDelete(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });
    logger.warn(`Bill DELETED: ${bill._id} (₹${bill.totalAmount}) by ${req.user.email}`);
    res.json({ message: "Bill deleted" });
  } catch (err) {
    logger.error(`Delete bill error: ${err.message}`);
    res.status(500).json({ message: "Failed to delete bill" });
  }
};