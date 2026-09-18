import mongoose from "mongoose";
import { getMongoUri } from "@/lib/env";

declare global {
  var mongooseConnection: Promise<typeof mongoose> | undefined;
}

export function connectDb(): Promise<typeof mongoose> {
  global.mongooseConnection ??= mongoose.connect(getMongoUri()).catch((error) => {
    global.mongooseConnection = undefined;
    throw error;
  });
  return global.mongooseConnection;
}
