const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // Random naam generate karte hain - original filename kabhi bharosa nahi karte
    const randomName = crypto.randomBytes(16).toString("hex");
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomName}${ext}`);
  },
});

const allowedTypes = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const expectedExt = allowedTypes[file.mimetype];

  if (!expectedExt) {
    return cb(new Error("Only PDF, PNG, JPG files are allowed"));
  }
  // Extension aur actual MIME type dono match karne chahiye - koi .exe ko .pdf naam de ke bhej raha ho wo pakdne ke liye
  if (ext !== expectedExt && !(expectedExt === ".jpg" && ext === ".jpeg")) {
    return cb(new Error("File extension does not match file type"));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

module.exports = upload;