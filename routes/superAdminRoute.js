// routes/superAdminRoute.js — UPDATED
// Added: GET /expiring-subscriptions → superAdminController.getExpiringSubscriptions
// Added: GET /companies/:id/entitlements → superAdminController.getCompanyEntitlementDetails
// All existing routes are UNCHANGED.

const express = require("express");
const { validateObjectId } = require("../middlewares/validateObjectId");
const router  = express.Router();

const {
  registerSuperAdmin,
  loginSuperAdmin,
  verifySuperAdminOtp,
  resendSuperAdminOtp,
  createCompany,
  createAdmin,
  createMarketingUser,
  listMarketingUsers,
  toggleMarketingAccess,
  deleteMarketingUser,
  getCompanies,
  getCompany,
  toggleCompany,
  toggleCallLogSync,
  deleteCompany,
  getDashboardStats,
  getAdminDetails,
  getAllAdminsWithStats,
  getCompanyEntitlementDetails,
  getExpiringSubscriptions,
} = require("../controllers/superAdminController");

const { protectUnified, authorizeRoles } = require("../middlewares/authMiddleware");
const { protectSuperAdmin, requirePlatformSuperAdmin, requireOwnCompanyOrPlatform } = require("../middlewares/superAdminMiddleware");
const companyIsolation                   = require("../middlewares/companyIsolation");
const { authLimiter, ipFloodLimiter } = require("../middlewares/rateLimiter");

// Custom financial reports (per company, free-form fields, AI analysis).
const {
  createCustomReport,
  listCustomReports,
  getCustomReport,
  updateCustomReport,
  deleteCustomReport,
  getCustomReportTrends,
  getCustomReportLeadMetrics,
  analyzeCustomReport,
} = require("../controllers/customReportController");

// ── Auth (public) ─────────────────────────────────────────────────────────────
router.post("/register",   ipFloodLimiter, authLimiter, registerSuperAdmin);
router.post("/login",      ipFloodLimiter, authLimiter, loginSuperAdmin);
router.post("/verify-otp", ipFloodLimiter, authLimiter, verifySuperAdminOtp);
router.post("/resend-otp", ipFloodLimiter, authLimiter, resendSuperAdminOtp);

// ── Protected routes — unified middleware stack ───────────────────────────────
router.get("/dashboard",
  protectUnified, authorizeRoles("super_admin"), companyIsolation, getDashboardStats);

// ── Admin management ──────────────────────────────────────────────────────────
router.post("/admins",
  protectUnified, authorizeRoles("super_admin"), companyIsolation, createAdmin);
router.get("/admins",
  protectUnified, authorizeRoles("super_admin"), companyIsolation, getAllAdminsWithStats);
router.get("/admins/:adminId",
  protectUnified, authorizeRoles("super_admin"), companyIsolation, getAdminDetails);

// ── Expiring subscriptions — pre-populates NotificationProvider bell ──────────
// Cross-tenant report (every company's expiry date) — platform SuperAdmin
// only. A company's own super_admin-role Admin also reaches this endpoint
// (same auth prefix) but must never see other companies' subscription data;
// the frontend already swallows a 403 here silently (see NotificationProvider).
// Query param: ?days=N (default 30, max 90)
router.get("/expiring-subscriptions",
  protectSuperAdmin, requirePlatformSuperAdmin, getExpiringSubscriptions);

// ── Entitlement details for a company ────────────────────────────────────────
// A company's own super_admin may view THEIR OWN entitlement summary; the
// platform SuperAdmin may view any company's.
router.get("/companies/:id/entitlements",
  protectSuperAdmin, validateObjectId("id"), requireOwnCompanyOrPlatform(req => req.params.id), getCompanyEntitlementDetails);

// ── Company management ────────────────────────────────────────────────────────
// List/create/suspend/delete ANY company — platform SuperAdmin only. A
// company's own super_admin has no legitimate reason to list every company
// on the platform, create a new one, or flip another company's active flag.
router.get("/companies",        protectSuperAdmin, requirePlatformSuperAdmin, getCompanies);
router.post("/companies",       protectSuperAdmin, requirePlatformSuperAdmin, createCompany);
router.put("/companies/:id",    protectSuperAdmin, requirePlatformSuperAdmin, validateObjectId("id"), toggleCompany);
router.delete("/companies/:id", protectSuperAdmin, requirePlatformSuperAdmin, validateObjectId("id"), deleteCompany);

// Viewing a single company's details, and toggling call-log-sync, ARE used by
// a company's own super_admin for their own company (AttendancePage's
// CallLogSyncSettings) — allow own-company access, platform SuperAdmin can
// target any company.
router.get("/companies/:id",    protectSuperAdmin, validateObjectId("id"), requireOwnCompanyOrPlatform(req => req.params.id), getCompany);
router.put("/companies/:id/call-log-sync", protectSuperAdmin, validateObjectId("id"), requireOwnCompanyOrPlatform(req => req.params.id), toggleCallLogSync);

// ── Custom financial reports ──────────────────────────────────────────────────
// Per-company, free-form fields, generic analytics + AI suggestions.
// NOTE: specific paths (/trends, /analyze) are declared with their :id segment;
// list/create on the collection root.
// list/create target a company explicitly via query/body — gate those here.
// The per-report routes (:id) look up the report first to find ITS company,
// so ownership is checked inside customReportController.js instead.
router.post   ("/custom-reports",            protectSuperAdmin, requireOwnCompanyOrPlatform(req => req.body?.company), createCustomReport);
router.get    ("/custom-reports",            protectSuperAdmin, requireOwnCompanyOrPlatform(req => req.query?.company), listCustomReports);
router.get    ("/custom-reports/:id/trends", protectSuperAdmin, getCustomReportTrends);
router.get    ("/custom-reports/:id/lead-metrics", protectSuperAdmin, getCustomReportLeadMetrics);
router.post   ("/custom-reports/:id/analyze",protectSuperAdmin, analyzeCustomReport);
router.get    ("/custom-reports/:id",        protectSuperAdmin, getCustomReport);
router.put    ("/custom-reports/:id",        protectSuperAdmin, updateCustomReport);
router.delete ("/custom-reports/:id",        protectSuperAdmin, deleteCustomReport);


// ── Marketing Panel credential management ─────────────────────────────────────
router.post("/marketing-users",             protectUnified, authorizeRoles("super_admin"), companyIsolation, createMarketingUser);
router.get("/marketing-users",              protectUnified, authorizeRoles("super_admin"), companyIsolation, listMarketingUsers);
router.patch("/marketing-users/:id/toggle", protectUnified, authorizeRoles("super_admin"), companyIsolation, toggleMarketingAccess);
router.delete("/marketing-users/:id",       protectUnified, authorizeRoles("super_admin"), companyIsolation, deleteMarketingUser);

module.exports = router;