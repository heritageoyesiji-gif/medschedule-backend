import rateLimit, { type RateLimitExceededEventHandler } from "express-rate-limit";

const json429: RateLimitExceededEventHandler = (_req, res) => {
  res.status(429).json({
    success: false,
    data: null,
    error: { code: "RATE_LIMITED", message: "Too many requests. Please wait and try again." },
  });
};

// Strict: login and password reset — brute-force targets
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

// Moderate: magic-link and forgot-password — prevents email flooding
export const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

// Strict: single-use token verification (magic-link, password reset, QR login).
// These consume tokens and can mint sessions, so cap brute-force attempts.
export const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

// Moderate: staff invite — prevents invite spam from compromised admin accounts
export const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

// Loose: signup — new accounts are rare, token peek is read-only
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});
