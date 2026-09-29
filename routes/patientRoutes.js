const express = require("express");
const router = express.Router();
const {
  getPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
} = require("../controllers/patientController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.get("/", authorize("admin", "doctor"), getPatients);
router.get("/:id", getPatient);
router.post("/", authorize("admin", "doctor"), createPatient);
router.put("/:id", authorize("admin", "doctor"), updatePatient);
router.delete("/:id", authorize("admin"), deletePatient);

module.exports = router;