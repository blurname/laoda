import { Hono } from "hono";
import { existsSync, readdirSync, rmSync, renameSync, mkdirSync, cpSync } from "fs";
import { join, basename } from "path";
import { osAdapter } from "../adapters/os";
import { notifyClients } from "../services/websocket";
import type { ServerMessage } from "@laoda/shared";
import { watchedPaths, watchers, startWatching } from "../services/watcher";
import { getGitInfo } from "../utils/git";
import { copyFolderRobustly } from "../utils/fs";

const projects = new Hono();

// API to list directories for a folder picker (Fallback for non-GUI environments)
projects.get("/ls", (c) => {
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
projects.post("/pick-folder", async (c) => {
  console.log("Request: /api/pick-folder");
  try {
    // Run picker in background to avoid HTTP timeout
    (async () => {
      const path = await osAdapter.pickFolder();
      notifyClients({
        type: "FOLDER_PICKED",
        path: path,
      });
    })();

    return c.json({ success: true, message: "Picker started" });
  } catch (e) {
    console.error("Failed to trigger system picker:", e);
    return c.json({ error: "Failed to trigger system picker" }, 500);
  }
});

// API to open folder in IDEs
projects.post("/open/vscode_family", async (c) => {
  const { path, appName } = await c.req.json();
  console.log(`Request: /api/open/vscode_family (IDE: ${appName}, Path: ${path})`);

  if (!path || !existsSync(path)) return c.json({ error: "Invalid path" }, 400);
  if (!appName) return c.json({ error: "Missing appName" }, 400);

  try {
    await osAdapter.openInIDE(appName, path);
    return c.json({ success: true });
  } catch (e) {
    console.error(`Failed to open ${appName}:`, e);
    return c.json({ error: `Failed to open ${appName}` }, 500);
  }
});

projects.post("/delete", async (c) => {
  const { path } = await c.req.json();
  console.log(`Request: /api/delete (Path: ${path})`);
  if (!path || !existsSync(path)) return c.json({ error: "Invalid path" }, 400);

  // Run in background
  (async () => {
    try {
      console.log(`[Background] Deleting folder: ${path}`);
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

      console.log(`[Success] Deleted: ${path}`);
      notifyClients({ type: "DELETION_COMPLETE", path, success: true });
    } catch (e: any) {
      console.error(`[Error] Deletion failed for ${path}:`, e);
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

projects.post("/write-file", async (c) => {
  const { path, filename, content } = await c.req.json();
  console.log(`Request: /api/write-file (Path: ${path}, Filename: ${filename})`);
  if (!path || !filename) return c.json({ error: "Missing parameters" }, 400);

  try {
    const fullPath = join(path, filename);
    const { writeFileSync } = await import("fs");
    writeFileSync(fullPath, content, "utf-8");
    console.log(`[Success] Managed file written: ${fullPath}`);
    return c.json({ success: true });
  } catch (e) {
    console.error(`[Error] Failed to write file ${filename} in ${path}:`, e);
    return c.json({ error: "Write failed" }, 500);
  }
});

projects.post("/move-bulk", async (c) => {
  const { paths, targetParent, includeFiles = [], mode = "move" } = await c.req.json();
  console.log(
    `Request: /api/move-bulk (Mode: ${mode}, Items: ${paths.length}, Target: ${targetParent})`,
  );

  // validation: targetParent is required, but it doesn't have to exist yet (e.g. for grouping)
  if (!Array.isArray(paths) || !targetParent) {
    console.error("[Move] Invalid parameters: paths must be array and targetParent is required");
    return c.json({ error: "Invalid parameters" }, 400);
  }

  // Run in background
  (async () => {
    const results = [];
    for (const src of paths) {
      if (!existsSync(src)) {
        console.warn(`[Move] Source does not exist: ${src}`);
        continue;
      }

      const folderName = basename(src);
      const dest = join(targetParent, folderName);

      if (existsSync(dest)) {
        console.warn(`[Move] Target already exists: ${dest}`);
        results.push({ path: src, success: false, error: "Target exists" });
        continue;
      }

      try {
        if (mode === "move") {
          console.log(`[Move] Instant move (rename) ${src} -> ${dest}`);
          try {
            // Try simple rename first (instant)
            if (!existsSync(join(dest, ".."))) {
              mkdirSync(join(dest, ".."), { recursive: true });
            }
            renameSync(src, dest);
          } catch (e) {
            console.warn(`[Move] Rename failed, falling back to copy+delete:`, e);
            // Fallback to copy everything (it's a move, so we want all files)
            cpSync(src, dest, { recursive: true });
            rmSync(src, { recursive: true, force: true });
          }
        } else {
          console.log(`[Move] Copy move (selective) ${src} -> ${dest}`);
          copyFolderRobustly(src, dest, includeFiles);
          // Cleanup original
          rmSync(src, { recursive: true, force: true });
        }

        // Cleanup internal state
        const id = Buffer.from(src).toString("base64");
        watchedPaths.delete(src);
        const watcherInfo = watchers.get(id);
        if (watcherInfo) {
          watcherInfo.watcher.close();
          watcherInfo.gitWatcher.close();
          watchers.delete(id);
        }

        console.log(`[Move] Successfully moved: ${src}`);
        results.push({ path: src, success: true, newPath: dest });
      } catch (e: any) {
        console.error(`[Move] Failed for ${src}:`, e);
        results.push({ path: src, success: false, error: e.message });
      }
    }

    console.log(`[Move] Finished bulk move. Results: ${results.length}`);
    notifyClients({ type: "MOVE_BULK_COMPLETE", results });
  })();

  return c.json({ success: true, message: "Move started" });
});

projects.post("/duplicate", async (c) => {
  const { path, includeFiles = [] } = await c.req.json();
  console.log(`Request: /api/duplicate (Path: ${path})`);
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

      console.log(`[Duplicate] Starting: ${path} -> ${newPath}`);
      copyFolderRobustly(path, newPath, includeFiles);

      console.log(`[Duplicate] Successfully duplicated: ${newPath}`);
      notifyClients({
        type: "DUPLICATION_COMPLETE",
        path,
        newPath,
        success: true,
      });
    } catch (e: any) {
      console.error(`[Duplicate] Failed for ${path}:`, e);
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

projects.post("/watch", async (c) => {
  const { path } = await c.req.json();
  console.log(`Request: /api/watch (Path: ${path})`);
  if (!path || !existsSync(path)) return c.json({ error: "Invalid path" }, 400);

  startWatching(path);
  const gitInfo = getGitInfo(path);
  return c.json({ path, ...gitInfo });
});

projects.post("/watch-bulk", async (c) => {
  const { paths } = await c.req.json();
  console.log(`Request: /api/watch-bulk (Items: ${paths.length})`);
  if (!Array.isArray(paths)) return c.json({ error: "Paths must be an array" }, 400);

  const results: Record<string, { branch: string; diffCount: number; latestCommit: string }> = {};
  for (const path of paths) {
    if (path && existsSync(path)) {
      startWatching(path, false); // Don't broadcast for each folder
      results[path] = getGitInfo(path);
    }
  }

  return c.json(results);
});

projects.post("/git-info", async (c) => {
  const { paths } = await c.req.json();
  console.log(`Request: /api/git-info (Items: ${paths.length})`);
  if (!Array.isArray(paths)) return c.json({ error: "Paths must be an array" }, 400);

  const results: Record<string, { branch: string; diffCount: number; latestCommit: string }> = {};
  for (const path of paths) {
    if (path && existsSync(path)) {
      results[path] = getGitInfo(path);
    }
  }

  return c.json(results);
});

export default projects;
