import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { parse } from "node:url";
import next from "next";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const httpsPort = parseInt(process.env.PORT || "9001", 10);
const httpPort = parseInt(process.env.HTTP_PORT || "9002", 10);
const dev = process.env.NODE_ENV !== "production";

const certDir = join(__dirname, "certs");
const certFile = join(certDir, "my-hub+2.pem");
const keyFile = join(certDir, "my-hub+2-key.pem");

const hasCerts = existsSync(certFile) && existsSync(keyFile);

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const handler = (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  };

  if (hasCerts) {
    const httpsOptions = {
      key: readFileSync(keyFile),
      cert: readFileSync(certFile),
    };
    createHttpsServer(httpsOptions, handler).listen(httpsPort, () => {
      console.log(`    https://my-hub:${httpsPort}`);
      console.log(`    https://localhost:${httpsPort}`);
    });
  }

  createHttpServer(handler).listen(httpPort, () => {
    console.log(`\n  ✓ The Hub ready at:`);
    if (!hasCerts) {
      console.log(`    (HTTPS disabled — certs not found)`);
    }
    console.log(`    http://localhost:${httpPort}  (Cursor extension)\n`);
  });
});
