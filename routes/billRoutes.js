const express = require("express");
const router = express.Router();
const {
  getBills,
  getBill,
  createBill,
  updateBill,
  deleteBill,
} = require("../controllers/billController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.get("/", authorize("admin", "patient"), getBills);
router.get("/:id", authorize("admin", "patient"), getBill);
router.post("/", authorize("admin"), createBill);
router.put("/:id", authorize("admin"), updateBill);
router.delete("/:id", authorize("admin"), deleteBill);

module.exports = router;