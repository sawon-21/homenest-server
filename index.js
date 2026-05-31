const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

// Import Firebase Admin initialization
const { initializeFirebaseAdmin } = require("./config/firebase");

const app = express();
const port = process.env.PORT || 5000;

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

// Security headers
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    // Add your production client URLs here
    process.env.CLIENT_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

// Parse JSON bodies
app.use(express.json());

// Parse cookies
app.use(cookieParser());

// Initialize Firebase Admin SDK
initializeFirebaseAdmin();

// ═══════════════════════════════════════════════════════════════
// MONGODB CONNECTION
// ═══════════════════════════════════════════════════════════════

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ MONGODB_URI is not set in environment variables!");
  process.exit(1);
}

// Create MongoClient
const client = new MongoClient(uri);

async function startServer() {
  try {
    // Connect to MongoDB
    await client.connect();

    // Verify connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "✅ Connected to MongoDB successfully!"
    );

    // Get database reference
    const db = client.db("homenestDB");

    // Create indexes for better query performance
    await createIndexes(db);

    // ═══════════════════════════════════════════════════════════
    // ROUTES
    // ═══════════════════════════════════════════════════════════

    // Import and register route modules
    const authRoutes = require("./routes/auth")(db);
    const userRoutes = require("./routes/users")(db);
    const propertyRoutes = require("./routes/properties")(db);
    const reviewRoutes = require("./routes/reviews")(db);

    app.use("/api/auth", authRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/properties", propertyRoutes);
    app.use("/api/reviews", reviewRoutes);

    // ═══════════════════════════════════════════════════════════
    // HEALTH CHECK & ROOT
    // ═══════════════════════════════════════════════════════════

    // Root route
    app.get("/", (req, res) => {
      res.json({
        success: true,
        message: "🏠 HomeNest API Server is running!",
        version: "1.0.0",
        endpoints: {
          auth: "/api/auth",
          users: "/api/users",
          properties: "/api/properties",
          reviews: "/api/reviews",
        },
      });
    });

    // Health check endpoint
    app.get("/health", async (req, res) => {
      try {
        await client.db("admin").command({ ping: 1 });
        res.json({
          success: true,
          status: "healthy",
          database: "connected",
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(503).json({
          success: false,
          status: "unhealthy",
          database: "disconnected",
          error: error.message,
        });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // 404 HANDLER
    // ═══════════════════════════════════════════════════════════

    app.use("*", (req, res) => {
      res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found on this server.`,
      });
    });

    // ═══════════════════════════════════════════════════════════
    // ERROR HANDLER
    // ═══════════════════════════════════════════════════════════

    app.use((err, req, res, next) => {
      console.error("Unhandled error:", err);
      res.status(500).json({
        success: false,
        message: "Internal server error.",
        ...(process.env.NODE_ENV === "development" && {
          error: err.message,
          stack: err.stack,
        }),
      });
    });

    // Start the Express server
    app.listen(port, () => {
      console.log(`\n🏠 HomeNest Server is running on port ${port}`);
      console.log(`   Local:  http://localhost:${port}`);
      console.log(`   Health: http://localhost:${port}/health\n`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

/**
 * Create MongoDB indexes for optimized queries
 */
async function createIndexes(db) {
  try {
    const propertiesCollection = db.collection("properties");
    const reviewsCollection = db.collection("reviews");
    const usersCollection = db.collection("users");

    // Properties indexes
    await propertiesCollection.createIndex({ createdAt: -1 }); // Featured & date sort
    await propertiesCollection.createIndex({ price: 1 }); // Price sort
    await propertiesCollection.createIndex({ userEmail: 1 }); // My Properties
    await propertiesCollection.createIndex({ category: 1 }); // Category filter
    await propertiesCollection.createIndex(
      { propertyName: "text" },
      { name: "property_name_text" }
    ); // Text search

    // Reviews indexes
    await reviewsCollection.createIndex({ propertyId: 1 }); // Reviews by property
    await reviewsCollection.createIndex({ reviewerEmail: 1 }); // My Ratings
    await reviewsCollection.createIndex({ createdAt: -1 }); // Sort by date

    // Users indexes
    await usersCollection.createIndex({ email: 1 }, { unique: true }); // Unique email

    console.log("✅ MongoDB indexes created successfully");
  } catch (error) {
    console.log("⚠️  Index creation warning:", error.message);
    // Don't fail startup if indexes already exist or have conflicts
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  await client.close();
  console.log("   MongoDB connection closed.");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 SIGTERM received. Shutting down...");
  await client.close();
  process.exit(0);
});

// Start the server
startServer();

// Export for Vercel serverless deployment
module.exports = app;
