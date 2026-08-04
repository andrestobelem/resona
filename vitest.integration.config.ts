import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    include: [
      "apps/**/*.integration.test.{ts,tsx}",
      "examples/**/*.integration.test.{ts,tsx}",
      "packages/**/*.integration.test.{ts,tsx}",
      "tests/**/*.integration.test.{ts,tsx}",
    ],
  },
});
