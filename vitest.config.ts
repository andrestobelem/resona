import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    exclude: [...configDefaults.exclude, "**/*.integration.test.{ts,tsx}"],
    include: [
      "apps/**/*.test.{ts,tsx}",
      "examples/**/*.test.{ts,tsx}",
      "packages/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],
  },
});
