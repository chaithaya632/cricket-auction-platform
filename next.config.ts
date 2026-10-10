import type { NextConfig } from "next";

const commitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ||
  (() => {
    try {
      return require("child_process")
        .execSync("git rev-parse --short HEAD")
        .toString()
        .trim();
    } catch {
      return "1ff2e49";
    }
  })();

const shortSha = commitSha ? commitSha.slice(0, 7) : "1ff2e49";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_HASH: shortSha,
  },
};

export default nextConfig;
