const Appointment = require("../models/Appointment");

const HOSPITAL_TZ = "Asia/Kolkata";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 24 * 60 * 60 * 1000;

// Hospital ke timezone me aaj ki date ("YYYY-MM-DD"). Server UTC me ho tab bhi sahi din milta hai.
const todayString = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: HOSPITAL_TZ }).format(new Date());

// Hospital ke timezone me abhi midnight se kitne minute hue
const nowMinutes = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOSPITAL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return get("hour") * 60 + get("minute");
};

// "02:00 PM" -> 840
const slotToMinutes = (slot) => {
  const [time, meridiem] = slot.split(" ");
  const [hours, minutes] = time.split(":").map(Number);
  return ((hours % 12) + (meridiem === "PM" ? 12 : 0)) * 60 + minutes;
};

// "2026-12-15" ko UTC midnight Date me badalta hai. Galat date (jaise 2026-02-31) par null.
const parseDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
};

const weekdayOf = (date) => DAYS[(date.getUTCDay() + 6) % 7];

// Ek doctor ke liye ek date par kaun se slots free hain. Booking aur slots-endpoint dono yahi use karte hain.
const getSlotsForDate = async (doctor, date) => {
  const dateStr = date.toISOString().slice(0, 10);
  const today = todayString();

  if (dateStr < today) return { availableSlots: [], bookedSlots: [], dayOff: false };

  if (doctor.availableDays.length > 0 && !doctor.availableDays.includes(weekdayOf(date))) {
    return { availableSlots: [], bookedSlots: [], dayOff: true };
  }

  const booked = await Appointment.find({
    doctor: doctor._id,
    date: { $gte: date, $lt: new Date(date.getTime() + DAY_MS) },
    status: { $ne: "cancelled" },
  }).select("timeSlot");

  const bookedSlots = booked.map((a) => a.timeSlot);
  const cutoff = dateStr === today ? nowMinutes() : -1; // aaj ke nikal chuke slots mat dikhao
  const availableSlots = doctor.timeSlots.filter(
    (slot) => !bookedSlots.includes(slot) && slotToMinutes(slot) > cutoff
  );

  return { availableSlots, bookedSlots, dayOff: false };
};

module.exports = { todayString, parseDate, getSlotsForDate };