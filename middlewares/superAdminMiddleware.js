// middlewares/superAdminMiddleware.js — UPDATED ("superadmin" → "super_admin")
const jwt = require("jsonwebtoken");
const SuperAdmin = require("../models/SuperAdmin");
const Admin = require("../models/Admin");

const protectSuperAdmin = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // UPDATED: role check uses "super_admin" (was "superadmin")
      if (decoded.role && decoded.role !== "super_admin") {
        return res.status(403).json({ message: "Access denied: not a super_admin token" });
      }

      // Try Admin model first (new multi-tenant super_admin) — this is a
      // COMPANY-scoped super_admin, not the platform SuperAdmin. Routes that
      // manage every company at once must gate on req.isPlatformSuperAdmin
      // (via requirePlatformSuperAdmin below), not just on reaching this
      // middleware, or a company's own super_admin could read/modify every
      // other company's data.
      const adminDoc = await Admin.findById(decoded.id).select("-password");
      if (adminDoc && adminDoc.role === "super_admin") {
        req.superAdmin = adminDoc;
        req.isPlatformSuperAdmin = false;
        return next();
      }

      // Fallback: legacy SuperAdmin document — the real platform-wide account.
      const superAdmin = await SuperAdmin.findById(decoded.id).select("-password");
      if (!superAdmin) {
        return res.status(401).json({ message: "Not authorized as super_admin" });
      }

      req.superAdmin = superAdmin;
      req.isPlatformSuperAdmin = true;
      return next();
    } catch (error) {
      return res.status(401).json({ message: "Not authorized, invalid token" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

// ── Platform-only gate ────────────────────────────────────────────────────────
// Run AFTER protectSuperAdmin. Several /api/superadmin routes act across every
// company at once (list all companies, cross-tenant subscription-expiry
// report, create/suspend/delete a company) — those must never be reachable by
// a company's own Admin, even one with role "super_admin". Only the real
// platform SuperAdmin document may pass this gate.
const requirePlatformSuperAdmin = (req, res, next) => {
  if (req.isPlatformSuperAdmin) return next();
  return res.status(403).json({
    message: "Access denied: this action is restricted to the platform super admin",
  });
};

// ── Per-company ownership check ───────────────────────────────────────────────
// For routes a company's own super_admin legitimately needs on THEIR OWN
// company (e.g. viewing their own entitlement summary, toggling their own
// call-log-sync setting) — the platform SuperAdmin may target any company,
// but a company-scoped super_admin may only target the company they belong
// to. `getCompanyId` extracts the target company id from the request
// (params/query/body, whichever the route uses).
const requireOwnCompanyOrPlatform = (getCompanyId) => (req, res, next) => {
  if (req.isPlatformSuperAdmin) return next();
  const targetId = getCompanyId(req);
  const ownId = req.superAdmin?.company?.toString();
  if (targetId && ownId && targetId === ownId) return next();
  return res.status(403).json({ message: "Access denied: you can only manage your own company" });
};

module.exports = { protectSuperAdmin, requirePlatformSuperAdmin, requireOwnCompanyOrPlatform };