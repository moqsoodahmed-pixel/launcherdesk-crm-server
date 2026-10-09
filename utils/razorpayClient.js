// utils/razorpayClient.js
// ─────────────────────────────────────────────────────────────────────────────
// Safe Razorpay client factory and proxy.
// Avoids crashing server startup when RAZORPAY_KEY_ID/KEY_SECRET are missing
// or placeholder in local development.
// ─────────────────────────────────────────────────────────────────────────────

const Razorpay = require("razorpay");

function getRazorpayClient() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (
    !key_id ||
    !key_secret ||
    key_id.trim() === "" ||
    key_id.startsWith("your_") ||
    key_id === "dummy"
  ) {
    return null;
  }

  try {
    return new Razorpay({ key_id, key_secret });
  } catch (err) {
    console.warn("⚠️  Razorpay initialization failed:", err.message);
    return null;
  }
}

// Proxied razorpay instance:
// Calls to razorpay.orders.create(...) work seamlessly when configured.
// When not configured, it gracefully throws a catchable error instead of crashing on boot.
const razorpay = new Proxy(
  {},
  {
    get(_, prop) {
      const client = getRazorpayClient();
      if (!client) {
        return new Proxy(
          {},
          {
            get(__, method) {
              return async () => {
                const err = new Error(
                  "Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are not configured."
                );
                err.code = "RAZORPAY_NOT_CONFIGURED";
                throw err;
              };
            },
          }
        );
      }
      return client[prop];
    },
  }
);

module.exports = {
  getRazorpayClient,
  razorpay,
};
