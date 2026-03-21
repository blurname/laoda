import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import projects from "./src/routes/projects";
import { clients } from "./src/services/websocket";

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

const portArgIdx = args.indexOf("--port") !== -1 ? args.indexOf("--port") : args.indexOf("-p");
if (portArgIdx !== -1) {
  const nextArg = args[portArgIdx + 1];
  if (nextArg) {
    defaultPort = parseInt(nextArg);
  }
}

app.use("/*", cors());

// Mount routes
app.route("/api", projects);

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
