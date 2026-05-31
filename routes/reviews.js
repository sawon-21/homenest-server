const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();
const { verifyToken } = require("../middleware/verifyToken");

/**
 * Review/Rating Routes
 * Handles property reviews and ratings (1-5 stars)
 */
module.exports = function (db) {
  const reviewsCollection = db.collection("reviews");
  const propertiesCollection = db.collection("properties");

  /**
   * POST /api/reviews
   * Add a review/rating for a property
   * Protected - only logged-in users can add reviews
   *
   * Body: {
   *   propertyId, rating, reviewText
   * }
   */
  router.post("/", verifyToken, async (req, res) => {
    try {
      const { propertyId, rating, reviewText } = req.body;

      // Validation
      if (!propertyId || !propertyId.trim()) {
        return res.status(400).json({
          success: false,
          message: "Property ID is required.",
        });
      }
      if (!ObjectId.isValid(propertyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid property ID format.",
        });
      }
      if (
        rating === undefined ||
        rating === null ||
        isNaN(Number(rating))
      ) {
        return res.status(400).json({
          success: false,
          message: "Rating is required.",
        });
      }
      if (Number(rating) < 1 || Number(rating) > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5.",
        });
      }
      if (!reviewText || !reviewText.trim()) {
        return res.status(400).json({
          success: false,
          message: "Review text is required.",
        });
      }

      // Verify the property exists
      const property = await propertiesCollection.findOne({
        _id: new ObjectId(propertyId),
      });

      if (!property) {
        return res.status(404).json({
          success: false,
          message: "Property not found.",
        });
      }

      // Prevent users from reviewing their own property
      if (property.userEmail === req.user.email) {
        return res.status(400).json({
          success: false,
          message: "You cannot review your own property.",
        });
      }

      const newReview = {
        propertyId: propertyId.trim(),
        propertyName: property.propertyName,
        propertyImage: property.imageUrl || "",
        reviewerName: req.user.name || "Anonymous",
        reviewerEmail: req.user.email,
        reviewerPhoto: req.user.picture || "",
        rating: Number(rating),
        reviewText: reviewText.trim(),
        createdAt: new Date(),
      };

      const result = await reviewsCollection.insertOne(newReview);

      res.status(201).json({
        success: true,
        message: "Review added successfully!",
        data: {
          ...newReview,
          _id: result.insertedId,
        },
      });
    } catch (error) {
      console.error("Error adding review:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  /**
   * GET /api/reviews/property/:propertyId
   * Get all reviews for a specific property
   * Public route - anyone can view reviews on property details page
   */
  router.get("/property/:propertyId", async (req, res) => {
    try {
      const { propertyId } = req.params;

      if (!ObjectId.isValid(propertyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid property ID format.",
        });
      }

      const reviews = await reviewsCollection
        .find({ propertyId })
        .sort({ createdAt: -1 })
        .toArray();

      // Calculate average rating
      const totalRatings = reviews.reduce(
        (sum, review) => sum + review.rating,
        0
      );
      const averageRating =
        reviews.length > 0
          ? Math.round((totalRatings / reviews.length) * 10) / 10
          : 0;

      res.json({
        success: true,
        count: reviews.length,
        averageRating,
        data: reviews,
      });
    } catch (error) {
      console.error("Error fetching property reviews:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  /**
   * GET /api/reviews/user/:email
   * Get all reviews by a specific user
   * Used on the "My Ratings" page
   * Protected - only authenticated users can access
   */
  router.get("/user/:email", verifyToken, async (req, res) => {
    try {
      const { email } = req.params;

      // Security: Users can only view their own ratings
      if (req.user.email !== email) {
        return res.status(403).json({
          success: false,
          message: "Forbidden. You can only view your own ratings.",
        });
      }

      const reviews = await reviewsCollection
        .find({ reviewerEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        success: true,
        count: reviews.length,
        data: reviews,
      });
    } catch (error) {
      console.error("Error fetching user reviews:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  /**
   * DELETE /api/reviews/:id
   * Delete a review
   * Protected - only the review author can delete
   */
  router.delete("/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid review ID format.",
        });
      }

      const review = await reviewsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Review not found.",
        });
      }

      // Security: Only the reviewer can delete their review
      if (review.reviewerEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          message: "Forbidden. You can only delete your own reviews.",
        });
      }

      await reviewsCollection.deleteOne({ _id: new ObjectId(id) });

      res.json({
        success: true,
        message: "Review deleted successfully!",
      });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  return router;
};
