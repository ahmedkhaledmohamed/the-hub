import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["chokidar", "marked", "marked-highlight", "highlight.js"],
};

export default nextConfig;
