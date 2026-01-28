#!/usr/bin/env node
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import projects from "./src/routes/projects";
import { clients } from "./src/services/websocket";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono();

// Parse CLI arguments
const args = process.argv;
let defaultPort = 26124;

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
laoda - Project Manager CLI

Usage:
  laoda [options]

Options:
  --port, -p <number>  Port to run the server on (default: 26124)
  --help, -h           Show this help message
  `);
  process.exit(0);
}

const portArgIdx =
  args.indexOf("--port") !== -1 ? args.indexOf("--port") : args.indexOf("-p");
if (portArgIdx !== -1) {
  const nextArg = args[portArgIdx + 1];
  if (nextArg) {
    defaultPort = parseInt(nextArg);
  }
}

app.use("/*", cors());

// Mount routes
app.route("/api", projects);

// Serve static files from dist folder
const possibleDistPaths = [
  join(process.cwd(), "apps/web/dist"),
  join(__dirname, "dist-web"), // For npm package structure (same dir as index.js)
  join(__dirname, "../web/dist"),
  "./apps/web/dist",
];

let distPath = "";
for (const p of possibleDistPaths) {
  if (existsSync(p)) {
    distPath = p;
    break;
  }
}

if (distPath) {
  console.log(`Serving static files from: ${distPath}`);
  app.use(
    "/*",
    serveStatic({
      root: relative(process.cwd(), distPath),
    }),
  );

  app.get("*", (c, next) => {
    if (c.req.path.startsWith("/api") || c.req.path === "/ws") {
      return next();
    }
    return serveStatic({ path: join(distPath, "index.html") })(c, next);
  });
}

const port = process.env.PORT ? parseInt(process.env.PORT) : defaultPort;

const server = serve({
  fetch: app.fetch,
  port,
});

const wss = new WebSocketServer({ server: server as any, path: "/ws" });

wss.on("connection", (ws: any) => {
  clients.add(ws);
  ws.on("close", () => {
    clients.delete(ws);
  });
});

console.log(`laoda Server running at http://localhost:${port}`);
