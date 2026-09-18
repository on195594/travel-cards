import mongoose from "mongoose";
import { getMongoUri } from "@/lib/env";

declare global {
  var mongooseConnection: Promise<typeof mongoose> | undefined;
}

export function connectDb(): Promise<typeof mongoose> {
  const state = mongoose.connection.readyState;
  if (state === 1) return Promise.resolve(mongoose);
  if (state !== 2) global.mongooseConnection = undefined;

  if (!global.mongooseConnection) {
    if (state === 2) {
      global.mongooseConnection = mongoose.connection.asPromise().then(() => mongoose);
    } else if (state === 3) {
      global.mongooseConnection = new Promise<void>((resolve) => {
        mongoose.connection.once("disconnected", resolve);
      }).then(() => mongoose.connect(getMongoUri(), { serverSelectionTimeoutMS: 5000 }));
    } else {
      global.mongooseConnection = mongoose.connect(getMongoUri(), { serverSelectionTimeoutMS: 5000 });
    }
    global.mongooseConnection = global.mongooseConnection.catch((error) => {
      global.mongooseConnection = undefined;
      throw error;
    });
  }
  return global.mongooseConnection;
}

async function within<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Database readiness timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function isDbReady(timeoutMs = 2000): Promise<boolean> {
  try {
    await within(connectDb(), timeoutMs);
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
    await within(mongoose.connection.db.admin().ping(), timeoutMs);
    return true;
  } catch {
    return false;
  }
}
