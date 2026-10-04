const express = require("express");
const router = express.Router();
const {
  getPrescriptions,
  createPrescription,
  deletePrescription,
} = require("../controllers/prescriptionController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.get("/", getPrescriptions);
router.post("/", authorize("admin", "doctor"), createPrescription);
router.delete("/:id", authorize("admin", "doctor"), deletePrescription);

module.exports = router;