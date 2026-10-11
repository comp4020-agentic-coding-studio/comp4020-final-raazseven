import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // All spec files share one real dev server + one SQLite file (there's no
    // way to isolate them --- the app under test is a single process).
    // Vitest's default is to run files in parallel worker processes, which
    // under the fuller accounts/memberships query shape started pushing some
    // requests past the 5000ms default test timeout under real concurrent
    // load --- not a server bug (confirmed: every test passes with this same
    // 5000ms budget once file parallelism is off), just several files
    // legitimately queuing behind each other's requests at once. Running
    // files one at a time keeps the suite's pass/fail deterministic.
    fileParallelism: false,
  },
});
