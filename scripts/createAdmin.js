require("dotenv").config();
const readline = require("readline");
const mongoose = require("mongoose");
const User = require("../models/User");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

const isStrongPassword = (pw) =>
  pw.length >= 12 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw);

const run = async () => {
  try {
    const name = (await ask("Admin name: ")).trim();
    const email = (await ask("Admin email: ")).trim().toLowerCase();
    const password = (await ask("Password (min 12 chars, upper+lower+number): ")).trim();

    if (!name || !email) throw new Error("Name and email are required");
    if (!isStrongPassword(password)) {
      throw new Error("Password too weak: need 12+ chars with uppercase, lowercase and a number");
    }

    await mongoose.connect(process.env.MONGO_URI);

    const existing = await User.findOne({ email });
    if (existing) throw new Error("A user with this email already exists");

    await User.create({ name, email, password, role: "admin" });
    console.log(`\n✅ Admin created: ${email}`); 
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    process.exitCode = 1;
  } finally {
    rl.close();
    await mongoose.disconnect();
  }
};

run();