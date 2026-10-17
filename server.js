require("dotenv").config();

// Startup check: zaroori environment variables na hon to server start hi na ho
const requiredEnv = ["MONGO_URI", "JWT_SECRET", "CLIENT_URL"];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`❌ Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("❌ JWT_SECRET is too short (minimum 32 characters)");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const compression = require("compression");
const morgan = require("morgan");
const path = require("path");

const connectDB = require("./config/db");
const logger = require("./config/logger");

const authRoutes = require("./routes/authRoutes");
const patientRoutes = require("./routes/patientRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const billRoutes = require("./routes/billRoutes");
const medicalRecordRoutes = require("./routes/medicalRecordRoutes");
const prescriptionRoutes = require("./routes/prescriptionRoutes");
const notificationRoutes = require("./routes/notificationRoutes");


const reportRoutes = require("./routes/reportRoutes");



const app = express();

// 1. Security headers sabse pehle
app.use(helmet());

// 2. CORS - sirf apni frontend URL se requests accept karo
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

// 3. Body parsing - 10kb se bada JSON body reject ho jayega
app.use(express.json({ limit: "10kb" }));

// 4. Malicious MongoDB operators ($gt, $ne waghera) input se hatao
app.use(mongoSanitize());

// 5. HTTP Parameter Pollution se bachao
app.use(hpp());

// 6. Response compression
app.use(compression());

// 7. Request logging - Morgan ko Winston se jodo
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// 8. Poore API pe general rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute
  max: 200, // har IP se max 200 requests / 15 min
  message: { message: "Too many requests, please try again later" },
});
app.use("/api", generalLimiter);

// 9. Login/register pe strict limit (brute-force se bachne ke liye)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 10 : 100, // production me 10, local testing me 100
  message: { message: "Too many login attempts, please try again after 15 minutes" },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// Uploaded medical records ki files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Health check
app.get("/", (req, res) => res.send("Verma Hospital API is running"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/medical-records", medicalRecordRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
app.use("/api/notifications", notificationRoutes);


app.use("/api/reports", reportRoutes);



// 404 handler - koi route match na ho
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler - kahin bhi koi unexpected error ho, clean JSON jaye (stack trace nahi)
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ message: "Something went wrong on the server" });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
});
