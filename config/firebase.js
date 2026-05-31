const admin = require("firebase-admin");

/**
 * Initialize Firebase Admin SDK
 * Used for verifying Firebase ID tokens on protected API routes
 *
 * To set up:
 * 1. Go to Firebase Console > Project Settings > Service Accounts
 * 2. Click "Generate new private key"
 * 3. Copy the project_id, client_email, and private_key to .env
 *
 * If Firebase Admin env vars are not set, the server still runs
 * but falls back to JWT-only verification
 */
function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log("✅ Firebase Admin SDK initialized");
  } else {
    console.log(
      "⚠️  Firebase Admin SDK not configured - using JWT-only auth"
    );
    console.log(
      "   Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env"
    );
  }

  return admin;
}

module.exports = { initializeFirebaseAdmin, admin };
