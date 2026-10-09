// utils/sanitizeHtml.js
// ─────────────────────────────────────────────────────────────────────────────
// Server-side HTML sanitizer — strips XSS vectors from HTML that will later be
// rendered in a browser (e.g. email bodies stored in EmailLog and shown in the
// Communications / Email History panels).
//
// This is the "clean on the way IN" layer: any body sanitized here is safe in
// the database going forward. The frontend also sanitizes on render, which
// covers data stored BEFORE this was added — the two layers are complementary.
//
// What it removes: <script>, event handlers (onerror, onclick, …), javascript:
// URLs, <iframe>/<object>/<embed>, and anything not on the allowlist below.
// What it keeps: normal email formatting — text styling, links, images, tables,
// inline styles — so legitimate marketing/nurture emails still render correctly.
//
//   npm install sanitize-html
// ─────────────────────────────────────────────────────────────────────────────

const sanitizeHtml = require("sanitize-html");

const EMAIL_OPTIONS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "img", "span", "center", "font",
    "table", "thead", "tbody", "tfoot", "tr", "td", "th",
    "h1", "h2", "h3", "h4", "h5", "h6",
  ]),
  allowedAttributes: {
    "*": ["style", "class", "align", "valign", "width", "height", "color", "bgcolor", "dir"],
    a:   ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "style"],
    font:["color", "face", "size"],
    table: ["border", "cellpadding", "cellspacing", "role"],
  },
  // Only safe URL schemes — this is what removes javascript: and data: (except images)
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: true,
  // <script>, <iframe>, on* handlers, etc. are dropped by default (discard mode).
  // Force any target=_blank link to also carry rel=noopener (anti tab-nabbing).
  transformTags: {
    a: (tagName, attribs) => {
      if (attribs.target === "_blank") {
        attribs.rel = (attribs.rel ? attribs.rel + " " : "") + "noopener noreferrer";
      }
      return { tagName, attribs };
    },
  },
};

/**
 * Sanitize an HTML string (e.g. an email body) for safe browser rendering.
 * Returns the value unchanged if it is null/empty/non-string.
 */
function sanitizeEmailHtml(dirty) {
  if (dirty == null || dirty === "" || typeof dirty !== "string") return dirty;
  return sanitizeHtml(dirty, EMAIL_OPTIONS);
}

// ── Plain-text branding fields (brandName, headerName, …) ────────────────────
// These are short display-only strings (shown verbatim in the header bar / UI
// chrome), not rich HTML, so the correct sanitization is to strip ALL tags —
// not just the dangerous ones. allowedTags: [] drops every tag (and its
// content for <script>/<style>, text content kept for everything else) and
// decodes entities, closing off stored-XSS via <script>, <img onerror>, etc.
const PLAIN_TEXT_OPTIONS = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
};

/**
 * Strip all HTML/script tags from a free-text display field (e.g. a company's
 * brandName/headerName) before it is persisted. Returns the value unchanged if
 * it is null/empty/non-string.
 */
function sanitizePlainText(dirty) {
  if (dirty == null || dirty === "" || typeof dirty !== "string") return dirty;
  return sanitizeHtml(dirty, PLAIN_TEXT_OPTIONS).trim();
}

module.exports = { sanitizeEmailHtml, EMAIL_OPTIONS, sanitizePlainText };