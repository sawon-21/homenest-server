const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { MongoClient } = require("mongodb");
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
// MONGODB CONNECTION & SYNCHRONOUS ROUTE REGISTRATION
// ═══════════════════════════════════════════════════════════════

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ MONGODB_URI is not set in environment variables!");
  process.exit(1);
}

// Create MongoClient and synchronously reference the DB
const client = new MongoClient(uri);
const db = client.db("homenestDB");

// Synchronously import and register route factories
const authRoutes = require("./routes/auth")(db);
const userRoutes = require("./routes/users")(db);
const propertyRoutes = require("./routes/properties")(db);
const reviewRoutes = require("./routes/reviews")(db);

// Lazy connection state
let isConnected = false;

// Middleware to establish lazy MongoDB connection on first request
app.use(async (req, res, next) => {
  if (!isConnected) {
    try {
      await client.connect();
      isConnected = true;
      console.log("✅ Lazily connected to MongoDB successfully!");
      // Initialize indexes in the background
      createIndexes(db).catch(err => {
        console.log("⚠️ Index creation warning:", err.message);
      });
    } catch (error) {
      console.error("❌ Lazy database connection failed:", error);
      return res.status(500).json({
        success: false,
        message: "Database connection failed. Please try again."
      });
    }
  }
  next();
});

// Register routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/reviews", reviewRoutes);

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    if (!isConnected) {
      await client.connect();
      isConnected = true;
    }
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

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found on this server.`,
  });
});

// Error handler
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

// Start Express port listener ONLY when running locally (not inside Vercel serverless)
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`\n🏠 HomeNest Server is running on port ${port}`);
    console.log(`   Local:  http://localhost:${port}`);
    console.log(`   Health: http://localhost:${port}/health\n`);
  });
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
    console.log("⚠️ Index creation warning:", error.message);
  }
}

// Handle graceful shutdown for local processes
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

module.exports = app;
