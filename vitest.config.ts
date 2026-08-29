import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    fileParallelism: false,
    sequence: { concurrent: false },
    env: {
      AUTH_SECRET: "test-only-secret-that-is-at-least-32-characters",
      AUTH_URL: "http://localhost:3000",
      ADMIN_EMAIL: "admin@example.test",
      ADMIN_PASSWORD_HASH: "scrypt$00$00",
      MONGODB_URI: "mongodb://127.0.0.1:27017/travel_cards_phase1_test",
    },
  },
});
