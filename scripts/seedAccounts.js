// scripts/seedAccounts.js
// ─────────────────────────────────────────────────────────────────────────────
// Seeds a Company + SuperAdmin (Admin role:"super_admin") + Admin + Employee
// for local development / first-time setup.
//
// Run:
//   node server/scripts/seedAccounts.js
//
// All values can be overridden via environment variables (see CONFIG block).
// Safe to run multiple times — each entity is created only if it doesn't exist.
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

// ── Models ───────────────────────────────────────────────────────────────────
const Company    = require("../models/Company");
const Admin      = require("../models/Admin");
const User       = require("../models/Users");
const SuperAdmin = require("../models/SuperAdmin");

// ── CONFIG — override any value via env vars ──────────────────────────────────
const CONFIG = {
  company: {
    name:  process.env.SEED_COMPANY_NAME  || "Launcherdesk Demo",
    email: process.env.SEED_COMPANY_EMAIL || "company@launcherdesk.com",
    phone: process.env.SEED_COMPANY_PHONE || "9000000000",
    plan:  process.env.SEED_COMPANY_PLAN  || "pro",   // trial|basic|pro|advance|enterprise
  },

  superAdmin: {
    name:     process.env.SEED_SUPERADMIN_NAME     || "Super Admin",
    email:    process.env.SEED_SUPERADMIN_EMAIL    || "superadmin@launcherdesk.com",
    password: process.env.SEED_SUPERADMIN_PASSWORD || "SuperAdmin@123",
  },

  admin: {
    name:     process.env.SEED_ADMIN_NAME     || "Admin User",
    email:    process.env.SEED_ADMIN_EMAIL    || "admin@launcherdesk.com",
    password: process.env.SEED_ADMIN_PASSWORD || "Admin@12345",
  },

  employee: {
    name:     process.env.SEED_EMPLOYEE_NAME     || "Employee User",
    email:    process.env.SEED_EMPLOYEE_EMAIL    || "employee@launcherdesk.com",
    password: process.env.SEED_EMPLOYEE_PASSWORD || "Employee@12345",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const log  = (msg) => console.log(`  ✅ ${msg}`);
const info = (msg) => console.log(`  ℹ️  ${msg}`);
const warn = (msg) => console.log(`  ⚠️  ${msg}`);

// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  // ── 1. Connect ──────────────────────────────────────────────────────────────
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is not set in .env");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  log("Connected to MongoDB");

  // ── 2. Company ──────────────────────────────────────────────────────────────
  console.log("\n── Company ──");
  let company = await Company.findOne({ email: CONFIG.company.email });
  if (company) {
    info(`Company already exists → ${company.name} (${company._id})`);
  } else {
    company = await Company.create({
      name:               CONFIG.company.name,
      email:              CONFIG.company.email,
      phone:              CONFIG.company.phone,
      plan:               CONFIG.company.plan,
      isActive:           true,
      subscriptionStatus: "active",
      subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    });
    log(`Company created → ${company.name} (${company._id})`);
  }

  // ── 3. SuperAdmin (Admin doc with role: "super_admin") ─────────────────────
  // Architecture note:
  //   • The platform-level SuperAdmin model is for the developer/platform owner.
  //   • Per-company super admins live in the Admin collection with role "super_admin".
  //   • This script creates the per-company super admin (the correct approach).
  console.log("\n── Super Admin (per-company) ──");
  let superAdminDoc = await Admin.findOne({ email: CONFIG.superAdmin.email });
  if (superAdminDoc) {
    info(`Super Admin already exists → ${superAdminDoc.email}`);
  } else {
    superAdminDoc = await Admin.create({
      name:     CONFIG.superAdmin.name,
      email:    CONFIG.superAdmin.email,
      password: CONFIG.superAdmin.password,
      company:  company._id,
      role:     "super_admin",
      isActive: true,
    });
    log(`Super Admin created → ${superAdminDoc.email}`);
  }

  // Also create/update the legacy SuperAdmin shadow document so the OTP login
  // flow (loginSuperAdmin in superAdminController.js) can look it up.
  const legacyShadow = await SuperAdmin.findOne({ email: CONFIG.superAdmin.email });
  if (!legacyShadow) {
    // Use bcrypt directly to avoid double-hashing — the SuperAdmin pre-save hook
    // hashes for us, so we just pass plaintext here.
    await SuperAdmin.create({
      name:     CONFIG.superAdmin.name,
      email:    CONFIG.superAdmin.email,
      password: CONFIG.superAdmin.password,
    });
    log(`Legacy SuperAdmin OTP shadow created → ${CONFIG.superAdmin.email}`);
  } else {
    info(`Legacy SuperAdmin OTP shadow already exists → ${legacyShadow.email}`);
  }

  // ── 4. Admin ────────────────────────────────────────────────────────────────
  console.log("\n── Admin ──");
  let adminDoc = await Admin.findOne({ email: CONFIG.admin.email });
  if (adminDoc) {
    info(`Admin already exists → ${adminDoc.email}`);
  } else {
    adminDoc = await Admin.create({
      name:     CONFIG.admin.name,
      email:    CONFIG.admin.email,
      password: CONFIG.admin.password,
      company:  company._id,
      role:     "admin",
      isActive: true,
    });
    log(`Admin created → ${adminDoc.email}`);
  }

  // ── 5. Employee (User) ──────────────────────────────────────────────────────
  console.log("\n── Employee ──");
  let employeeDoc = await User.findOne({ email: CONFIG.employee.email });
  if (employeeDoc) {
    info(`Employee already exists → ${employeeDoc.email}`);
  } else {
    employeeDoc = await User.create({
      name:      CONFIG.employee.name,
      email:     CONFIG.employee.email,
      password:  CONFIG.employee.password,
      company:   company._id,
      createdBy: adminDoc._id,
      role:      "user",
    });
    log(`Employee created → ${employeeDoc.email}`);
  }

  // ── 6. Summary ──────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              Launcherdesk CRM — Seed Summary                 ║
╠══════════════════════════════════════════════════════════════╣
║  Company                                                     ║
║    Name   : ${company.name.padEnd(46)}║
║    Email  : ${company.email.padEnd(46)}║
║    Plan   : ${company.plan.padEnd(46)}║
╠══════════════════════════════════════════════════════════════╣
║  Super Admin  (role: super_admin, collection: Admin)         ║
║    Email  : ${CONFIG.superAdmin.email.padEnd(46)}║
║    Pass   : ${CONFIG.superAdmin.password.padEnd(46)}║
╠══════════════════════════════════════════════════════════════╣
║  Admin        (role: admin,       collection: Admin)         ║
║    Email  : ${CONFIG.admin.email.padEnd(46)}║
║    Pass   : ${CONFIG.admin.password.padEnd(46)}║
╠══════════════════════════════════════════════════════════════╣
║  Employee     (role: user,        collection: User)          ║
║    Email  : ${CONFIG.employee.email.padEnd(46)}║
║    Pass   : ${CONFIG.employee.password.padEnd(46)}║
╠══════════════════════════════════════════════════════════════╣
║  ⚠️  Change these credentials before deploying to production ║
╚══════════════════════════════════════════════════════════════╝
`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("\n❌ Seed failed:", err.message);
  if (err.code === 11000) {
    console.error(
      "   Duplicate key — one of the emails already exists under a different role.\n" +
      "   Either drop the existing document or change the seed email via env vars:\n" +
      "     SEED_SUPERADMIN_EMAIL, SEED_ADMIN_EMAIL, SEED_EMPLOYEE_EMAIL"
    );
  }
  process.exit(1);
});