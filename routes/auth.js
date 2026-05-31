const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

/**
 * Auth Routes
 * Handles JWT token generation and logout
 */
module.exports = function (db) {
  /**
   * POST /api/auth/token
   * Generate a JWT token and set it as an HTTP-only cookie
   * Called from client after Firebase authentication
   *
   * Body: { email, name, uid, picture }
   */
  router.post("/token", (req, res) => {
    try {
      const { email, name, uid, picture } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required to generate token.",
        });
      }

      // Create JWT payload
      const payload = {
        email,
        name: name || "",
        uid: uid || "",
        picture: picture || "",
      };

      // Sign JWT token (expires in 7 days)
      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      // Set HTTP-only cookie
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        })
        .json({
          success: true,
          message: "Token generated successfully.",
          token, // Also send in body for clients that prefer Authorization header
        });
    } catch (error) {
      console.error("Error generating token:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Clear the JWT cookie
   */
  router.post("/logout", (req, res) => {
    try {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        })
        .json({
          success: true,
          message: "Logged out successfully.",
        });
    } catch (error) {
      console.error("Error during logout:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  return router;
};
