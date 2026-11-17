import type { NextConfig } from "next";

const pages = process.env.NEXT_PUBLIC_GITHUB_PAGES === "1";
const basePath = process.env.NEXT_PUBLIC_PAGES_BASE_PATH ?? "";

const config: NextConfig = pages ? {
  output: "export",
  basePath,
  // Pages has no server. The export script supplies the bank as static JSON.
  pageExtensions: ["tsx"],
} : {
  outputFileTracingIncludes: {
    "/api/tests/*": ["./data/tests/*.json", "./data/adaptive/*.json"],
    "/api/tests/*/v1": ["./data/archive/v1/*.json"],
  },
};

export default config;