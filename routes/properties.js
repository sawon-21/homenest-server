const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();
const { verifyToken } = require("../middleware/verifyToken");

/**
 * Property Routes
 * Full CRUD operations for real estate property listings
 * Includes search, sort, filter, and featured properties
 */
module.exports = function (db) {
  const propertiesCollection = db.collection("properties");

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC ROUTES
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /api/properties/featured
   * Get the 6 most recently created properties
   * Used on the Home page Featured Real Estate section
   */
  router.get("/featured", async (req, res) => {
    try {
      const properties = await propertiesCollection
        .find({})
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();

      res.json({
        success: true,
        count: properties.length,
        data: properties,
      });
    } catch (error) {
      console.error("Error fetching featured properties:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  /**
   * GET /api/properties
   * Get all properties with optional search, sort, filter, and pagination
   *
   * Query params:
   *   search   - Search by property name (case-insensitive regex)
   *   category - Filter by category (Rent, Sale, Commercial, Land)
   *   sort     - Sort order: price_asc, price_desc, date_asc, date_desc
   *   page     - Page number (default: 1)
   *   limit    - Items per page (default: 12)
   */
  router.get("/", async (req, res) => {
    try {
      const {
        search,
        category,
        sort: sortParam,
        page = 1,
        limit = 12,
      } = req.query;

      // Build query filter
      const filter = {};

      // Search by property name (case-insensitive)
      if (search && search.trim()) {
        filter.propertyName = { $regex: search.trim(), $options: "i" };
      }

      // Filter by category
      if (category && category.trim()) {
        filter.category = category.trim();
      }

      // Build sort options
      let sortOptions = { createdAt: -1 }; // Default: newest first

      switch (sortParam) {
        case "price_asc":
          sortOptions = { price: 1 };
          break;
        case "price_desc":
          sortOptions = { price: -1 };
          break;
        case "date_asc":
          sortOptions = { createdAt: 1 };
          break;
        case "date_desc":
          sortOptions = { createdAt: -1 };
          break;
      }

      // Pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 12;
      const skip = (pageNum - 1) * limitNum;

      // Execute queries in parallel for performance
      const [properties, totalCount] = await Promise.all([
        propertiesCollection
          .find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .toArray(),
        propertiesCollection.countDocuments(filter),
      ]);

      res.json({
        success: true,
        count: properties.length,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: pageNum,
        data: properties,
      });
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // PROTECTED ROUTES (Require Authentication)
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /api/properties/user/:email
   * Get all properties posted by a specific user
   * Used on the "My Properties" page
   */
  router.get("/user/:email", verifyToken, async (req, res) => {
    try {
      const { email } = req.params;

      // Security: Users can only view their own properties via this route
      if (req.user.email !== email) {
        return res.status(403).json({
          success: false,
          message: "Forbidden. You can only view your own properties.",
        });
      }

      const properties = await propertiesCollection
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        success: true,
        count: properties.length,
        data: properties,
      });
    } catch (error) {
      console.error("Error fetching user properties:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  /**
   * GET /api/properties/:id
   * Get single property details by ID
   * Protected - only logged-in users can view full details
   */
  router.get("/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId format
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid property ID format.",
        });
      }

      const property = await propertiesCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!property) {
        return res.status(404).json({
          success: false,
          message: "Property not found.",
        });
      }

      res.json({
        success: true,
        data: property,
      });
    } catch (error) {
      console.error("Error fetching property:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  /**
   * POST /api/properties
   * Add a new property listing
   * Protected - only logged-in users can add properties
   *
   * Body: {
   *   propertyName, description, category, price,
   *   location, imageUrl, userEmail, userName, userPhoto
   * }
   */
  router.post("/", verifyToken, async (req, res) => {
    try {
      const {
        propertyName,
        description,
        category,
        price,
        location,
        imageUrl,
        userEmail,
        userName,
        userPhoto,
      } = req.body;

      // Validation
      if (!propertyName || !propertyName.trim()) {
        return res.status(400).json({
          success: false,
          message: "Property name is required.",
        });
      }
      if (!description || !description.trim()) {
        return res.status(400).json({
          success: false,
          message: "Description is required.",
        });
      }
      if (!category || !category.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category is required.",
        });
      }
      if (price === undefined || price === null || isNaN(Number(price))) {
        return res.status(400).json({
          success: false,
          message: "Valid price is required.",
        });
      }
      if (Number(price) < 0) {
        return res.status(400).json({
          success: false,
          message: "Price cannot be negative.",
        });
      }
      if (!location || !location.trim()) {
        return res.status(400).json({
          success: false,
          message: "Location is required.",
        });
      }
      if (!userEmail || !userEmail.trim()) {
        return res.status(400).json({
          success: false,
          message: "User email is required.",
        });
      }

      // Security: Ensure the token email matches the submitted userEmail
      if (req.user.email !== userEmail) {
        return res.status(403).json({
          success: false,
          message: "Forbidden. Email mismatch with authenticated user.",
        });
      }

      // Validate category
      const validCategories = [
        "Rent",
        "Sale",
        "Commercial",
        "Land",
        "Apartment",
        "Villa",
        "Townhouse",
        "Penthouse",
      ];
      if (!validCategories.includes(category.trim())) {
        return res.status(400).json({
          success: false,
          message: `Invalid category. Must be one of: ${validCategories.join(", ")}`,
        });
      }

      const newProperty = {
        propertyName: propertyName.trim(),
        description: description.trim(),
        category: category.trim(),
        price: Number(price),
        location: location.trim(),
        imageUrl: imageUrl?.trim() || "",
        userEmail: userEmail.trim(),
        userName: userName?.trim() || "",
        userPhoto: userPhoto?.trim() || "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await propertiesCollection.insertOne(newProperty);

      res.status(201).json({
        success: true,
        message: "Property added successfully!",
        data: {
          ...newProperty,
          _id: result.insertedId,
        },
      });
    } catch (error) {
      console.error("Error adding property:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  /**
   * PUT /api/properties/:id
   * Update an existing property
   * Protected - only the property owner can update
   *
   * Body: {
   *   propertyName, description, category, price,
   *   location, imageUrl
   * }
   */
  router.put("/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId format
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid property ID format.",
        });
      }

      // Find the existing property
      const existingProperty = await propertiesCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!existingProperty) {
        return res.status(404).json({
          success: false,
          message: "Property not found.",
        });
      }

      // Security: Verify ownership - only the owner can update
      if (existingProperty.userEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          message: "Forbidden. You can only update your own properties.",
        });
      }

      const { propertyName, description, category, price, location, imageUrl } =
        req.body;

      // Validation
      if (propertyName !== undefined && !propertyName.trim()) {
        return res.status(400).json({
          success: false,
          message: "Property name cannot be empty.",
        });
      }
      if (price !== undefined && (isNaN(Number(price)) || Number(price) < 0)) {
        return res.status(400).json({
          success: false,
          message: "Valid non-negative price is required.",
        });
      }

      // Validate category if provided
      if (category) {
        const validCategories = [
          "Rent",
          "Sale",
          "Commercial",
          "Land",
          "Apartment",
          "Villa",
          "Townhouse",
          "Penthouse",
        ];
        if (!validCategories.includes(category.trim())) {
          return res.status(400).json({
            success: false,
            message: `Invalid category. Must be one of: ${validCategories.join(", ")}`,
          });
        }
      }

      // Build update object (only include provided fields)
      const updateFields = {};
      if (propertyName !== undefined)
        updateFields.propertyName = propertyName.trim();
      if (description !== undefined)
        updateFields.description = description.trim();
      if (category !== undefined) updateFields.category = category.trim();
      if (price !== undefined) updateFields.price = Number(price);
      if (location !== undefined) updateFields.location = location.trim();
      if (imageUrl !== undefined) updateFields.imageUrl = imageUrl.trim();
      updateFields.updatedAt = new Date();

      const result = await propertiesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      if (result.modifiedCount === 0) {
        return res.json({
          success: true,
          message: "No changes were made.",
        });
      }

      // Fetch updated document to return
      const updatedProperty = await propertiesCollection.findOne({
        _id: new ObjectId(id),
      });

      res.json({
        success: true,
        message: "Property updated successfully!",
        data: updatedProperty,
      });
    } catch (error) {
      console.error("Error updating property:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  /**
   * DELETE /api/properties/:id
   * Delete a property
   * Protected - only the property owner can delete
   */
  router.delete("/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId format
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid property ID format.",
        });
      }

      // Find the existing property
      const existingProperty = await propertiesCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!existingProperty) {
        return res.status(404).json({
          success: false,
          message: "Property not found.",
        });
      }

      // Security: Verify ownership - only the owner can delete
      if (existingProperty.userEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          message: "Forbidden. You can only delete your own properties.",
        });
      }

      // Delete the property
      await propertiesCollection.deleteOne({ _id: new ObjectId(id) });

      // Also delete all reviews associated with this property
      const reviewsCollection = db.collection("reviews");
      await reviewsCollection.deleteMany({ propertyId: id });

      res.json({
        success: true,
        message: "Property and associated reviews deleted successfully!",
      });
    } catch (error) {
      console.error("Error deleting property:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  return router;
};
