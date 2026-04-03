import { afterAll } from "vitest";
import { closeDb } from "@/lib/db";

// Ensure SQLite connections are cleaned up after all tests
afterAll(() => {
  closeDb();
});
