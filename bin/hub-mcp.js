#!/usr/bin/env node

/**
 * The Hub MCP Server — entry point
 *
 * Starts an MCP server over stdio that exposes The Hub's indexed workspace.
 * Add this to your AI tool's MCP configuration.
 *
 * Example Claude Code config (~/.claude.json):
 * {
 *   "mcpServers": {
 *     "the-hub": {
 *       "command": "node",
 *       "args": ["/path/to/the-hub/bin/hub-mcp.js"]
 *     }
 *   }
 * }
 */

const { resolve } = require("path");

// Ensure we're running from the hub root
const hubRoot = resolve(__dirname, "..");
process.chdir(hubRoot);

// Register tsx for TypeScript execution
try {
  require("tsx/cjs");
} catch {
  console.error(
    "[hub-mcp] tsx is required to run the MCP server.\n" +
    "Install it: npm install -D tsx\n" +
    "Or run directly: npx tsx src/mcp/server.ts"
  );
  process.exit(1);
}

require("../src/mcp/server.ts");
