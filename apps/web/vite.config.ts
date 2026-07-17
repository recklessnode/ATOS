import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rootPackage = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8")) as { version?: string };

function gitValue(command: string, fallback: string): string {
  try {
    return execSync(command, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const commitSha = process.env.VITE_COMMIT_SHA ?? process.env.GITHUB_SHA ?? gitValue("git rev-parse HEAD", "unknown");
const commitDate = process.env.VITE_COMMIT_DATE ?? gitValue("git show -s --format=%cI HEAD", "unknown");
const buildMetadata = {
  version: process.env.VITE_ATOS_VERSION ?? rootPackage.version ?? "0.0.0",
  shortSha: commitSha === "unknown" ? "unknown" : commitSha.slice(0, 7),
  commitSha,
  commitDate,
  repositoryUrl: "https://github.com/recklessnode/ATOS",
  source: process.env.GITHUB_ACTIONS ? "github-pages" : "local",
};

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  define: {
    __ATOS_BUILD_METADATA__: JSON.stringify(buildMetadata),
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
