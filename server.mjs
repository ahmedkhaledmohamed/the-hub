import { createServer } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { parse } from "node:url";
import next from "next";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = parseInt(process.env.PORT || "9001", 10);
const dev = process.env.NODE_ENV !== "production";

const certDir = join(__dirname, "certs");
const certFile = join(certDir, "ahmed-hub+2.pem");
const keyFile = join(certDir, "ahmed-hub+2-key.pem");

if (!existsSync(certFile) || !existsSync(keyFile)) {
  console.error(
    "TLS certs not found. Run:\n" +
      "  mkcert -install\n" +
      '  mkdir -p certs && cd certs && mkcert ahmed-hub localhost 127.0.0.1\n\n' +
      "Falling back to plain HTTP via `next start`."
  );
  process.exit(1);
}

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpsOptions = {
    key: readFileSync(keyFile),
    cert: readFileSync(certFile),
  };

  createServer(httpsOptions, (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, () => {
    console.log(`\n  ✓ Ahmed's Hub ready at:`);
    console.log(`    https://ahmed-hub:${port}`);
    console.log(`    https://localhost:${port}\n`);
  });
});
