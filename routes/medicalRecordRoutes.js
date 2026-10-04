const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const { getRecords, uploadRecord, deleteRecord } = require("../controllers/medicalRecordController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.get("/", getRecords);
router.post("/", authorize("admin", "doctor"), upload.single("file"), uploadRecord);
router.delete("/:id", authorize("admin", "doctor"), deleteRecord);

module.exports = router;