import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";

// Build-time markers so screenshots can be matched to a deployed bundle.
// VITE_COMMIT_SHA / VITE_BUILD_TIME come from Vercel env vars when
// available (Vercel sets VERCEL_GIT_COMMIT_SHA automatically). We fall back
// to a local `git rev-parse` so dev builds still get a marker.
function resolveCommitSha(): string {
  if (process.env.VITE_COMMIT_SHA) return process.env.VITE_COMMIT_SHA;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const COMMIT_SHA = resolveCommitSha();
const BUILD_TIME = new Date().toISOString();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __BUILD_SHA__: JSON.stringify(COMMIT_SHA),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
}));
