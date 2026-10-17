const Appointment = require("../models/Appointment");
const Bill = require("../models/Bill");
const Doctor = require("../models/Doctor");
const Patient = require("../models/Patient");
const Prescription = require("../models/Prescription");
const logger = require("../config/logger");

const DAY_MS = 24 * 60 * 60 * 1000;

// Appointment dates UTC midnight par store hoti hain, isliye "aaj" bhi UTC midnight se naapte hain
const startOfToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const statusCounts = async (filter) => {
  const rows = await Appointment.aggregate([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const result = { scheduled: 0, completed: 0, cancelled: 0 };
  rows.forEach((r) => {
    result[r._id] = r.count;
  });
  return result;
};

const sumBills = async (match) => {
  const [row] = await Bill.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);
  return row ? row.total : 0;
};

// Pichhle 6 mahine ka paid revenue, jis mahine me bill nahi bana wahan 0 dikhega
const monthlyRevenue = async () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const rows = await Bill.aggregate([
    { $match: { status: "paid", issuedDate: { $gte: start } } },
    {
      $group: {
        _id: { y: { $year: "$issuedDate" }, m: { $month: "$issuedDate" } },
        total: { $sum: "$totalAmount" },
      },
    },
  ]);

  const series = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const hit = rows.find((r) => r._id.y === d.getUTCFullYear() && r._id.m === d.getUTCMonth() + 1);
    series.push({
      month: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      revenue: hit ? hit.total : 0,
    });
  }
  return series;
};

const countToday = (filter) => {
  const today = startOfToday();
  return Appointment.countDocuments({
    ...filter,
    status: { $ne: "cancelled" },
    date: { $gte: today, $lt: new Date(today.getTime() + DAY_MS) },
  });
};

const countUpcoming = (filter) =>
  Appointment.countDocuments({ ...filter, status: "scheduled", date: { $gte: startOfToday() } });

// Dashboard par sirf naam chahiye, isliye patient ka phone/address jaisa data populate nahi karte
const upcomingAppointments = (filter) =>
  Appointment.find({ ...filter, status: "scheduled", date: { $gte: startOfToday() } })
    .sort({ date: 1 })
    .limit(5)
    .populate("patient", "name")
    .populate("doctor", "name specialization");

const emptySummary = (stats) => ({
  stats,
  appointmentsByStatus: { scheduled: 0, completed: 0, cancelled: 0 },
  upcoming: [],
});

const adminSummary = async () => {
  const [patients, doctors, appointmentsToday, byStatus, revenue, pending, revenueByMonth, upcoming] =
    await Promise.all([
      Patient.countDocuments(),
      Doctor.countDocuments(),
      countToday({}),
      statusCounts({}),
      sumBills({ status: "paid" }),
      sumBills({ status: { $in: ["unpaid", "partial"] } }),
      monthlyRevenue(),
      upcomingAppointments({}),
    ]);

  return {
    stats: { patients, doctors, appointmentsToday, revenue, pending },
    appointmentsByStatus: byStatus,
    revenueByMonth,
    upcoming,
  };
};

const doctorSummary = async (user) => {
  const doctor = await Doctor.findOne({ user: user._id });
  if (!doctor) return emptySummary({ appointmentsToday: 0, upcoming: 0, completed: 0, patients: 0 });

  const filter = { doctor: doctor._id };
  const [appointmentsToday, upcomingCount, byStatus, upcoming, patientIds] = await Promise.all([
    countToday(filter),
    countUpcoming(filter),
    statusCounts(filter),
    upcomingAppointments(filter),
    Appointment.distinct("patient", filter),
  ]);

  return {
    stats: {
      appointmentsToday,
      upcoming: upcomingCount,
      completed: byStatus.completed,
      patients: patientIds.length,
    },
    appointmentsByStatus: byStatus,
    upcoming,
  };
};

const patientSummary = async (user) => {
  const patient = await Patient.findOne({ user: user._id });
  if (!patient) return emptySummary({ upcoming: 0, completed: 0, prescriptions: 0, pendingBills: 0 });

  const filter = { patient: patient._id };
  const [upcomingCount, byStatus, upcoming, prescriptions, pendingBills] = await Promise.all([
    countUpcoming(filter),
    statusCounts(filter),
    upcomingAppointments(filter),
    Prescription.countDocuments({ patient: patient._id }),
    sumBills({ patient: patient._id, status: { $in: ["unpaid", "partial"] } }),
  ]);

  return {
    stats: { upcoming: upcomingCount, completed: byStatus.completed, prescriptions, pendingBills },
    appointmentsByStatus: byStatus,
    upcoming,
  };
};

// GET /api/reports/summary - role ke hisaab se alag data
exports.getSummary = async (req, res) => {
  try {
    const { role } = req.user;
    let summary;
    if (role === "admin") summary = await adminSummary();
    else if (role === "doctor") summary = await doctorSummary(req.user);
    else summary = await patientSummary(req.user);
    res.json(summary);
  } catch (err) {
    logger.error(`Get summary error: ${err.message}`);
    res.status(500).json({ message: "Failed to load dashboard" });
  }
};