require("dotenv").config();
const mongoose  = require("mongoose");
const Developer = require("../models/Developer");

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const exists = await Developer.findOne({ email: "dev@launcherdesk.com" });
  if (exists) {
    console.log("✅ Already exists:", exists.email);
    process.exit(0);
  }

  await Developer.create({
    name:     "Platform Developer",
    email:    "dev@launcherdesk.com",
    password: "Dev@1234",
  });

  console.log("✅ Developer created: dev@launcherdesk.com / Dev@1234");
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });