const express = require("express");
const router = express.Router();
const {
  getDoctors,
  getDoctor,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getAvailableSlots,
} = require("../controllers/doctorController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.get("/", getDoctors);
router.get("/:id/slots", getAvailableSlots);
router.get("/:id", getDoctor);
router.post("/", authorize("admin"), createDoctor);
router.put("/:id", authorize("admin", "doctor"), updateDoctor);
router.delete("/:id", authorize("admin"), deleteDoctor);

module.exports = router;