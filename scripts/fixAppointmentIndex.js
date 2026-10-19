require("dotenv").config();
const mongoose = require("mongoose");

const INDEX_NAME = "doctor_1_date_1_timeSlot_1";

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const collection = mongoose.connection.collection("appointments");

    const indexes = await collection.indexes();
    if (indexes.some((i) => i.name === INDEX_NAME)) {
      await collection.dropIndex(INDEX_NAME);
      console.log("Dropped the old index");
    }

    await collection.createIndex(
      { doctor: 1, date: 1, timeSlot: 1 },
      { name: INDEX_NAME, unique: true, partialFilterExpression: { status: "scheduled" } }
    );
    console.log("✅ New index created: unique only for scheduled appointments");
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();