require("dotenv").config();
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



const app = express();

// 1.  Security headers sabse pehle
app.use(helmet());

// 2. CORS - sirf apni frontend URL se requests accept karo
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

// 3. Body parsing - JSON data samajhne ke liye
app.use(express.json({ limit: "10kb" })); // 10kb se bada JSON body reject ho jayega

// 4. Data sanitization - malicious MongoDB operators hatao input se
app.use(mongoSanitize());

// 5. HTTP Parameter Pollution se bachao
app.use(hpp());

// 6. Response compression - faster loading
app.use(compression());

// 7. Request logging - Morgan ko Winston se jodo
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// 8. Rate limiting - poore API pe general limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute
  max: 200, // har IP se max 200 requests / 15 min
  message: { message: "Too many requests, please try again later" },
});
app.use("/api", generalLimiter);

// 9. Stricter limit sirf login/register pe (brute-force se bachne ke liye)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // sirf 10 login/register attempts / 15 min per IP
  message: { message: "Too many login attempts, please try again after 15 minutes" },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// Static file serving (medical records)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/medical-records", medicalRecordRoutes);

app.get("/", (req, res) => res.send("Verma Hospital API is running"));


app.use("/api/auth", authRoutes);

app.use("/api/patients", patientRoutes);


app.use("/api/doctors", doctorRoutes);

app.use("/api/appointments", appointmentRoutes);
app.use("/api/bills", billRoutes);


app.use("/api/prescriptions", prescriptionRoutes);


const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
});