import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve("."),
  serverExternalPackages: ["chokidar", "marked", "marked-highlight", "highlight.js", "better-sqlite3", "pdf-parse"],
  webpack: (config) => {
    config.resolve.alias["@hub-config"] = path.resolve("./hub.config");
    return config;
  },
};

export default nextConfig;
