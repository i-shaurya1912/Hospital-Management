const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const { getRecords, uploadRecord, deleteRecord } = require("../controllers/medicalRecordController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);



const handleUpload = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};




router.get("/", getRecords);
router.post("/", authorize("admin", "doctor"), upload.single("file"), uploadRecord);
router.delete("/:id", authorize("admin", "doctor"), deleteRecord);

module.exports = router;