#!/usr/bin/env node
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { watch } from "chokidar";
import { join, basename, relative, dirname } from "path";
import { fileURLToPath } from "url";
import {
  readFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
  rmSync,
  writeFileSync,
} from "fs";
import { execSync, spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface OSAdapter {
  pickFolder(): Promise<string | null>;
  openInIDE(appName: string, path: string): Promise<void>;
}

class MacOSAdapter implements OSAdapter {
  private isPickerOpen = false;

  async pickFolder(): Promise<string | null> {
    if (this.isPickerOpen) {
      console.log("Picker already open, ignoring request.");
      return null;
    }

    this.isPickerOpen = true;
    try {
      const proc = spawn("osascript", [
        "-e",
        'POSIX path of (choose folder with prompt "Select a folder")',
      ]);

      let output = "";
      if (proc.stdout) {
        for await (const chunk of proc.stdout) {
          output += chunk;
        }
      }
      return output.trim() || null;
    } finally {
      this.isPickerOpen = false;
    }
  }

  async openInIDE(appName: string, path: string): Promise<void> {
    spawn("open", ["-a", appName, path], {
      stdio: "inherit",
    });
  }
}

// Default to MacOS for now, but easily extendable
const os: OSAdapter = new MacOSAdapter();

// --- App Logic ---

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

// Only track which paths are being watched, not full folder data
// Frontend localStorage is the source of truth for folder data
const watchedPaths = new Set<string>();
const watchers = new Map<string, any>();

function getGitInfo(path: string) {
  try {
    const headPath = join(path, ".git", "HEAD");
    if (!existsSync(headPath))
      return { branch: "no branch", diffCount: 0, latestCommit: "" };

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
      const status = execSync("git status --porcelain", {
        cwd: path,
      }).toString();
      diffCount = status
        .split("\n")
        .filter((line) => line.trim().length > 0).length;
    } catch {
      // ignore
    }

    // Get Latest Commit Info
    let latestCommit = "";
    try {
      latestCommit = execSync('git log -1 --format="%s (%h)"', { cwd: path })
        .toString()
        .trim();
    } catch {
      // ignore
    }

    return { branch, diffCount, latestCommit };
  } catch {
    return { branch: "unknown", diffCount: 0, latestCommit: "" };
  }
}

// Removed broadcastFolders - frontend localStorage is the source of truth
// Backend only provides Git info updates via GIT_INFO_UPDATE messages

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
    // Run picker in background to avoid HTTP timeout
    (async () => {
      const path = await os.pickFolder();
      notifyClients({
        type: "FOLDER_PICKED",
        path: path,
      });
    })();

    return c.json({ success: true, message: "Picker started" });
  } catch (e) {
    console.error("Failed to open system picker:", e);
    return c.json({ error: "Failed to open system picker" }, 500);
  }
});

// API to open folder in IDEs
app.post("/api/open/vscode_family", async (c) => {
  const { path, appName } = await c.req.json();

  if (!path || !existsSync(path)) return c.json({ error: "Invalid path" }, 400);
  if (!appName) return c.json({ error: "Missing appName" }, 400);

  console.log(`Opening ${appName} for path:`, path);
  try {
    await os.openInIDE(appName, path);
    return c.json({ success: true });
  } catch (e) {
    console.error(`Failed to open ${appName}:`, e);
    return c.json({ error: `Failed to open ${appName}` }, 500);
  }
});

app.post("/api/delete", async (c) => {
  const { path } = await c.req.json();
  if (!path || !existsSync(path)) return c.json({ error: "Invalid path" }, 400);

  // Run in background
  (async () => {
    try {
      console.log(`Deleting folder: ${path}`);
      rmSync(path, { recursive: true, force: true });

      // Cleanup internal state
      const id = Buffer.from(path).toString("base64");
      watchedPaths.delete(path);
      const watcherInfo = watchers.get(id);
      if (watcherInfo) {
        watcherInfo.watcher.close();
        watcherInfo.gitWatcher.close();
        watchers.delete(id);
      }

      notifyClients({ type: "DELETION_COMPLETE", path, success: true });
    } catch (e: any) {
      console.error("Deletion failed:", e);
      notifyClients({
        type: "DELETION_COMPLETE",
        path,
        success: false,
        error: e.message,
      });
    }
  })();

  return c.json({ success: true, message: "Deletion started" });
});

app.post("/api/write-file", async (c) => {
  const { path, filename, content } = await c.req.json();
  if (!path || !filename) return c.json({ error: "Missing parameters" }, 400);

  try {
    const fullPath = join(path, filename);
    console.log(`Writing managed file to: ${fullPath}`);
    writeFileSync(fullPath, content, "utf-8");
    return c.json({ success: true });
  } catch (e) {
    console.error("Failed to write file:", e);
    return c.json({ error: "Write failed" }, 500);
  }
});

function copyFolderRobustly(src: string, dest: string) {
  if (!existsSync(src)) return;

  // 1. Create target dir
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  // 2. Capture local git config
  const getLocalGitConfig = (key: string, cwd: string) => {
    try {
      return execSync(`git config --local ${key}`, { cwd }).toString().trim();
    } catch {
      return null;
    }
  };

  const localName = getLocalGitConfig("user.name", src);
  const localEmail = getLocalGitConfig("user.email", src);

  // 3. Copy .git folder (explicitly requested)
  if (existsSync(join(src, ".git"))) {
    cpSync(join(src, ".git"), join(dest, ".git"), { recursive: true });
  }

  // 4. Copy non-ignored files using git ls-files
  const filesToCopy = execSync(`git ls-files -z -co --exclude-standard`, {
    cwd: src,
  })
    .toString()
    .split("\0")
    .filter((f) => f.trim().length > 0);

  for (const file of filesToCopy) {
    const srcFile = join(src, file);
    const destFile = join(dest, file);
    const destDir = join(destFile, "..");

    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    if (existsSync(srcFile) || lstatSync(srcFile).isSymbolicLink()) {
      try {
        const stats = lstatSync(srcFile);
        if (stats.isSymbolicLink()) {
          const target = readlinkSync(srcFile);
          symlinkSync(target, destFile);
        } else {
          copyFileSync(srcFile, destFile);
        }
      } catch (err) {
        console.error(`Failed to copy file/link ${srcFile}:`, err);
      }
    }
  }

  // 5. Apply captured git config
  if (localName) {
    execSync(`git config --local user.name "${localName}"`, { cwd: dest });
  }
  if (localEmail) {
    execSync(`git config --local user.email "${localEmail}"`, { cwd: dest });
  }
}

app.post("/api/move-bulk", async (c) => {
  const { paths, targetParent } = await c.req.json();
  if (!Array.isArray(paths) || !targetParent || !existsSync(targetParent)) {
    return c.json({ error: "Invalid parameters" }, 400);
  }

  // Run in background
  (async () => {
    const results = [];
    for (const src of paths) {
      if (!existsSync(src)) continue;

      const folderName = basename(src);
      const dest = join(targetParent, folderName);

      if (existsSync(dest)) {
        results.push({ path: src, success: false, error: "Target exists" });
        continue;
      }

      try {
        console.log(`Moving ${src} to ${dest}`);
        copyFolderRobustly(src, dest);

        // Cleanup original
        rmSync(src, { recursive: true, force: true });

        // Cleanup internal state
        const id = Buffer.from(src).toString("base64");
        watchedPaths.delete(src);
        const watcherInfo = watchers.get(id);
        if (watcherInfo) {
          watcherInfo.watcher.close();
          watcherInfo.gitWatcher.close();
          watchers.delete(id);
        }

        results.push({ path: src, success: true, newPath: dest });
      } catch (e: any) {
        console.error(`Move failed for ${src}:`, e);
        results.push({ path: src, success: false, error: e.message });
      }
    }

    notifyClients({ type: "MOVE_BULK_COMPLETE", results });
  })();

  return c.json({ success: true, message: "Move started" });
});

app.post("/api/duplicate", async (c) => {
  const { path } = await c.req.json();
  if (!path || !existsSync(path)) return c.json({ error: "Invalid path" }, 400);

  // Run in background
  (async () => {
    try {
      const parentDir = join(path, "..");
      const fullName = basename(path);

      // Check if name already ends with "-number"
      const match = fullName.match(/^(.*?)-(\d+)$/);
      const baseName = match ? match[1] || fullName : fullName;
      let counter = match ? parseInt(match[2] || "0") + 1 : 1;

      let newPath = "";
      while (true) {
        const newName = `${baseName}-${counter}`;
        newPath = join(parentDir, newName);
        if (!existsSync(newPath)) break;
        counter++;
      }

      console.log(`Duplicating ${path} to ${newPath}`);
      copyFolderRobustly(path, newPath);

      notifyClients({
        type: "DUPLICATION_COMPLETE",
        path,
        newPath,
        success: true,
      });
    } catch (e: any) {
      console.error("Duplication failed:", e);
      notifyClients({
        type: "DUPLICATION_COMPLETE",
        path,
        success: false,
        error: e.message,
      });
    }
  })();

  return c.json({ success: true, message: "Duplication started" });
});

app.post("/api/watch", async (c) => {
  const { path } = await c.req.json();
  if (!path || !existsSync(path)) return c.json({ error: "Invalid path" }, 400);

  startWatching(path);
  const gitInfo = getGitInfo(path);
  return c.json({ path, ...gitInfo });
});

// New API for bulk watching - returns Git info for paths that exist
app.post("/api/watch-bulk", async (c) => {
  const { paths } = await c.req.json();
  if (!Array.isArray(paths))
    return c.json({ error: "Paths must be an array" }, 400);

  const results: Record<
    string,
    { branch: string; diffCount: number; latestCommit: string }
  > = {};
  for (const path of paths) {
    if (path && existsSync(path)) {
      startWatching(path, false); // Don't broadcast for each folder
      results[path] = getGitInfo(path);
    }
  }

  return c.json(results); // Return path -> gitInfo mapping
});

function startWatching(path: string, shouldBroadcast = true) {
  const id = Buffer.from(path).toString("base64");
  if (!watchedPaths.has(path)) {
    watchedPaths.add(path);

    const watcher = watch([path], {
      ignoreInitial: true,
      depth: 1,
      ignored: ["**/node_modules/**", "**/.git/**"],
    });

    // Also watch .git/HEAD and .git/index specifically for git changes
    const gitWatcher = watch(
      [join(path, ".git/HEAD"), join(path, ".git/index")],
      {
        ignoreInitial: true,
      },
    );

    const update = () => {
      const updatedGitInfo = getGitInfo(path);
      // Notify clients about Git info update for this specific path
      notifyClients({
        type: "GIT_INFO_UPDATE",
        path,
        ...updatedGitInfo,
      });
    };

    watcher.on("all", update);
    gitWatcher.on("all", update);

    watchers.set(id, { watcher, gitWatcher });
  }
}

// API to get Git info for paths - frontend sends paths, backend returns Git info
app.post("/api/git-info", async (c) => {
  const { paths } = await c.req.json();
  if (!Array.isArray(paths))
    return c.json({ error: "Paths must be an array" }, 400);

  const results: Record<
    string,
    { branch: string; diffCount: number; latestCommit: string }
  > = {};
  for (const path of paths) {
    if (path && existsSync(path)) {
      results[path] = getGitInfo(path);
    }
  }

  return c.json(results);
});

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

const clients = new Set<any>();

const port = process.env.PORT ? parseInt(process.env.PORT) : defaultPort;

const server = serve({
  fetch: app.fetch,
  port,
});

const wss = new WebSocketServer({ server: server as any, path: "/ws" });

wss.on("connection", (ws: any) => {
  clients.add(ws);
  // Don't send folder data - frontend is the source of truth
  // Frontend will request Git info for its stored paths

  ws.on("close", () => {
    clients.delete(ws);
  });
});

function notifyClients(data: any) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    try {
      if (client.readyState === 1) {
        // 1 is OPEN in ws library
        client.send(message);
      }
    } catch {
      clients.delete(client);
    }
  }
}

console.log(`laoda Server running at http://localhost:${port}`);
