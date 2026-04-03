import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { parse } from "node:url";
import next from "next";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const httpsPort = parseInt(process.env.PORT || "9001", 10);
const httpPort = parseInt(process.env.HTTP_PORT || "9002", 10);
const dev = process.env.NODE_ENV !== "production";

const certDir = join(__dirname, "certs");

function findCerts() {
  if (!existsSync(certDir)) return null;
  try {
    const files = readdirSync(certDir);
    const cert = files.find((f) => f.endsWith(".pem") && !f.includes("-key"));
    const key = files.find((f) => f.endsWith("-key.pem"));
    if (cert && key) return { cert: join(certDir, cert), key: join(certDir, key) };
  } catch { /* no certs */ }
  return null;
}

const certs = findCerts();
const hasCerts = certs !== null;

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const handler = (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  };

  if (hasCerts) {
    const httpsOptions = {
      key: readFileSync(certs.key),
      cert: readFileSync(certs.cert),
    };
    createHttpsServer(httpsOptions, handler).listen(httpsPort, () => {
      console.log(`    https://localhost:${httpsPort}`);
    });
  }

  createHttpServer(handler).listen(httpPort, () => {
    console.log(`\n  ✓ The Hub ready at:`);
    if (!hasCerts) {
      console.log(`    (HTTPS disabled — no certs found in ./certs/)`);
    }
    console.log(`    http://localhost:${httpPort}  (Cursor extension)\n`);
  });
});
