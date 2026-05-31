const jwt = require("jsonwebtoken");
const { admin } = require("../config/firebase");

/**
 * Middleware to verify authentication tokens
 *
 * Supports two modes:
 * 1. Firebase Admin SDK verification (if configured)
 * 2. JWT verification (fallback)
 *
 * The token is read from:
 * - HTTP-only cookie named "token"
 * - Authorization header: "Bearer <token>"
 */
const verifyToken = async (req, res, next) => {
  // Extract token from cookie or Authorization header
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No authentication token provided.",
    });
  }

  try {
    // Try Firebase Admin SDK verification first (if configured)
    if (admin.apps.length > 0) {
      try {
        const decodedFirebase = await admin.auth().verifyIdToken(token);
        req.user = {
          email: decodedFirebase.email,
          uid: decodedFirebase.uid,
          name: decodedFirebase.name || "",
          picture: decodedFirebase.picture || "",
        };
        return next();
      } catch (firebaseError) {
        // Firebase verification failed, fall through to JWT
        console.log(
          "Firebase token verification failed, trying JWT:",
          firebaseError.message
        );
      }
    }

    // Fallback: JWT verification
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      email: decoded.email,
      uid: decoded.uid || "",
      name: decoded.name || "",
      picture: decoded.picture || "",
    };
    next();
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

/**
 * Middleware to verify that the logged-in user owns the resource
 * Must be used AFTER verifyToken middleware
 * Checks that req.user.email matches the userEmail in the request
 */
const verifyOwner = (req, res, next) => {
  const userEmail = req.user?.email;
  const resourceEmail = req.body?.userEmail || req.query?.userEmail;

  if (resourceEmail && userEmail !== resourceEmail) {
    return res.status(403).json({
      success: false,
      message: "Forbidden. You can only modify your own resources.",
    });
  }

  next();
};

module.exports = { verifyToken, verifyOwner };
