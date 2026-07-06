import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration files share one TEST_DATABASE_URL and truncate between tests —
    // parallel files would clobber each other's fixtures. Run files sequentially.
    fileParallelism: false,
  },
});
