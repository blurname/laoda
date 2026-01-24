import { Hono } from "hono";
import { cors } from "hono/cors";
import { watch } from "chokidar";
import { join, basename } from "path";
import { readFileSync, existsSync, readdirSync } from "fs";
import { execSync } from "child_process";

// --- OS Abstraction Layer ---

interface OSAdapter {
  pickFolder(): Promise<string | null>;
  openInIDE(ide: "cursor" | "trae" | "vscode", path: string): Promise<void>;
}

class MacOSAdapter implements OSAdapter {
  async pickFolder(): Promise<string | null> {
    const proc = Bun.spawn([
      "osascript",
      "-e",
      'POSIX path of (choose folder with prompt "Select a folder")',
    ]);
    const path = (await new Response(proc.stdout).text()).trim();
    return path || null;
  }

  async openInIDE(ide: "cursor" | "trae" | "vscode", path: string): Promise<void> {
    const appName = {
      cursor: "Cursor",
      trae: "Trae",
      vscode: "Visual Studio Code",
    }[ide];

    Bun.spawn(["open", "-a", appName, path], {
      stdout: "inherit",
      stderr: "inherit",
    });
  }
}

// Default to MacOS for now, but easily extendable
const os: OSAdapter = new MacOSAdapter();

// --- App Logic ---

const app = new Hono();

app.use("/*", cors());

const folders = new Map<string, { id: string; name: string; path: string; branch: string; diffCount: number; latestCommit: string }>();
const watchers = new Map<string, any>();

function getGitInfo(path: string) {
  try {
    const headPath = join(path, ".git", "HEAD");
    if (!existsSync(headPath)) return { branch: "no branch", diffCount: 0, latestCommit: "" };

    // Get Branch
    let branch = "unknown";
    const head = readFileSync(headPath, "utf8");
    if (head.startsWith("ref: ")) {
      branch = head.replace("ref: refs/heads/", "").trim();
    } else {
      branch = head.trim().substring(0, 7);
    }

    // Get Diff Count (modified + untracked)
    let diffCount = 0;
    try {
      const status = execSync("git status --porcelain", { cwd: path }).toString();
      diffCount = status.split("\n").filter(line => line.trim().length > 0).length;
    } catch {
      // ignore
    }

    // Get Latest Commit Info
    let latestCommit = "";
    try {
      latestCommit = execSync('git log -1 --format="%s (%h)"', { cwd: path }).toString().trim();
    } catch {
      // ignore
    }

    return { branch, diffCount, latestCommit };
  } catch {
    return { branch: "unknown", diffCount: 0, latestCommit: "" };
  }
}

function broadcastFolders() {
  const data = {
    type: "UPDATE_FOLDERS",
    folders: Array.from(folders.values()),
  };
  notifyClients(data);
}

// API to list directories for a folder picker (Fallback for non-GUI environments)
app.get("/api/ls", (c) => {
  const path = c.req.query("path") || process.cwd();
  try {
    const entries = readdirSync(path, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        path: join(path, e.name),
      }));
    return c.json({ currentPath: path, parent: join(path, ".."), dirs });
  } catch {
    return c.json({ error: "Cannot read directory" }, 500);
  }
});

// New API to call system folder picker
app.post("/api/pick-folder", async (c) => {
  try {
    const path = await os.pickFolder();
    if (!path) {
      return c.json({ error: "No folder selected" }, 400);
    }
    return c.json({ path });
  } catch (e) {
    console.error("Failed to open system picker:", e);
    return c.json({ error: "Failed to open system picker" }, 500);
  }
});

// API to open folder in IDEs
app.post("/api/open/:ide", async (c) => {
  const ide = c.req.param("ide") as "cursor" | "trae" | "vscode";
  const { path } = await c.req.json();
  
  if (!path || !existsSync(path)) return c.json({ error: "Invalid path" }, 400);
  
  console.log(`Opening ${ide} for path:`, path);
  try {
    await os.openInIDE(ide, path);
    return c.json({ success: true });
  } catch (e) {
    console.error(`Failed to open ${ide}:`, e);
    return c.json({ error: `Failed to open ${ide}` }, 500);
  }
});

app.post("/api/watch", async (c) => {
  const { path } = await c.req.json();
  if (!path || !existsSync(path)) return c.json({ error: "Invalid path" }, 400);

  const folder = startWatching(path);
  return c.json(folder);
});

// New API for bulk watching
app.post("/api/watch-bulk", async (c) => {
  const { paths } = await c.req.json();
  if (!Array.isArray(paths)) return c.json({ error: "Paths must be an array" }, 400);

  const results = [];
  for (const path of paths) {
    if (path && existsSync(path)) {
      results.push(startWatching(path, false)); // Don't broadcast for each folder
    }
  }

  if (results.length > 0) {
    broadcastFolders(); // Broadcast once at the end
  }

  return c.json({ imported: results.length, total: paths.length });
});

function startWatching(path: string, shouldBroadcast = true) {
  const id = Buffer.from(path).toString("base64");
  if (!folders.has(id)) {
    const name = basename(path);
    const gitInfo = getGitInfo(path);
    const folder = { id, name, path, ...gitInfo };
    folders.set(id, folder);

    const watcher = watch([path], {
      ignoreInitial: true,
      depth: 1,
      ignored: ["**/node_modules/**", "**/.git/**"],
    });

    // Also watch .git/HEAD and .git/index specifically for git changes
    const gitWatcher = watch([join(path, ".git/HEAD"), join(path, ".git/index")], {
      ignoreInitial: true,
    });

    const update = () => {
      const updatedGitInfo = getGitInfo(path);
      const updatedName = basename(path);
      const folderData = folders.get(id);
      if (folderData) {
        const updated = { ...folderData, ...updatedGitInfo, name: updatedName };
        folders.set(id, updated);
        broadcastFolders();
      }
    };

    watcher.on("all", update);
    gitWatcher.on("all", update);

    watchers.set(id, { watcher, gitWatcher });
    if (shouldBroadcast) {
      broadcastFolders();
    }
    return folder;
  }
  return folders.get(id)!;
}

app.get("/api/folders", (c) => {
  return c.json(Array.from(folders.values()));
});

const clients = new Set<any>();

function notifyClients(data: any) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    try {
      client.send(message);
    } catch {
      clients.delete(client);
    }
  }
}

Bun.serve({
  port: 3001,
  hostname: "0.0.0.0",
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      console.log("Attempting WebSocket upgrade...");
      if (server.upgrade(req)) {
        return;
      }
      console.error("WebSocket upgrade failed");
      return new Response("Upgrade failed", { status: 400 });
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      console.log("WebSocket Client connected");
      // Send initial state
      ws.send(
        JSON.stringify({
          type: "UPDATE_FOLDERS",
          folders: Array.from(folders.values()),
        }),
      );
    },
    close(ws) {
      clients.delete(ws);
      console.log("WebSocket Client disconnected");
    },
    message(_ws, _msg) {},
  },
});

console.log(`Server running at http://localhost:3001`);
