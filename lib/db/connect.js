import mongoose from "mongoose";

let cached = globalThis._mongooseConn;
if (!cached) {
  cached = globalThis._mongooseConn = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.");
  }
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, { bufferCommands: false })
      .then((m) => m);
  }
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Don't cache a failed connection attempt, or every later request fails until restart.
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}
