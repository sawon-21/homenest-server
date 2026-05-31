const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/verifyToken");

/**
 * User Routes
 * Handles user profile creation and retrieval
 */
module.exports = function (db) {
  const usersCollection = db.collection("users");

  /**
   * POST /api/users
   * Save or update user profile on registration/login
   * Uses upsert to avoid duplicates
   *
   * Body: { name, email, photoURL }
   */
  router.post("/", async (req, res) => {
    try {
      const { name, email, photoURL } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required.",
        });
      }

      // Upsert user: insert if not exists, update lastLogin if exists
      const result = await usersCollection.updateOne(
        { email },
        {
          $set: {
            name: name || "",
            email,
            photoURL: photoURL || "",
            lastLogin: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      res.status(200).json({
        success: true,
        message:
          result.upsertedCount > 0
            ? "User registered successfully."
            : "User profile updated.",
        data: result,
      });
    } catch (error) {
      console.error("Error saving user:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  /**
   * GET /api/users/:email
   * Get user profile by email
   * Protected route - only authenticated users can access
   */
  router.get("/:email", verifyToken, async (req, res) => {
    try {
      const { email } = req.params;

      // Security: Users can only access their own profile
      if (req.user.email !== email) {
        return res.status(403).json({
          success: false,
          message: "Forbidden. You can only access your own profile.",
        });
      }

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  return router;
};
