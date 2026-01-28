import { registerResolver } from "../hooks/useSocket";
import type { MoveResult, ServerMessagePayload } from "@laoda/shared";

const isProd = import.meta.env.PROD;
const API_BASE = isProd ? window.location.origin : "http://localhost:26124";

export const api = {
  async pickFolder(): Promise<string | null> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(null); // 超时也按取消处理
      }, 60000);

      registerResolver("FOLDER_PICKED", (data: ServerMessagePayload<"FOLDER_PICKED">) => {
        clearTimeout(timeout);
        resolve(data.path);
        return true;
      });

      try {
        const res = await fetch(`${API_BASE}/api/pick-folder`, { method: "POST" });
        if (!res.ok) {
          clearTimeout(timeout);
          reject(new Error("Failed to pick folder"));
        }
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  },

  async watchFolder(path: string) {
    const res = await fetch(`${API_BASE}/api/watch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error("Failed to watch folder");
    // Returns: { path, branch, diffCount, latestCommit }
    return res.json();
  },

  async watchBulk(paths: string[]) {
    const res = await fetch(`${API_BASE}/api/watch-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    if (!res.ok) throw new Error("Failed to watch folders in bulk");
    // Returns: { [path]: { branch, diffCount, latestCommit } }
    return res.json();
  },

  async getGitInfo(paths: string[]): Promise<Record<string, { branch: string; diffCount: number; latestCommit: string }>> {
    const res = await fetch(`${API_BASE}/api/git-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    if (!res.ok) throw new Error("Failed to get Git info");
    // Returns: { [path]: { branch, diffCount, latestCommit } }
    return res.json();
  },

  async openInIDE(appName: string, path: string) {
    const res = await fetch(`${API_BASE}/api/open/vscode_family`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, appName }),
    });
    if (!res.ok) throw new Error(`Failed to open in ${appName}`);
    return res.json();
  },

  async duplicateFolder(path: string, includeFiles: string[] = []): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Duplication timeout: No response from server"));
      }, 30000); // 30秒超时
      
      registerResolver("DUPLICATION_COMPLETE", (data: ServerMessagePayload<"DUPLICATION_COMPLETE">) => {
        if (data.path === path) {
          clearTimeout(timeout);
          if (data.success) resolve(data.newPath!);
          else reject(new Error(data.error || "Duplication failed"));
          return true;
        }
        return false;
      });

      try {
        const res = await fetch(`${API_BASE}/api/duplicate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, includeFiles }),
        });
        if (!res.ok) {
          clearTimeout(timeout);
          reject(new Error("Failed to duplicate folder"));
        }
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  },

  async moveBulk(paths: string[], targetParent: string, includeFiles: string[] = [], mode: "move" | "copy" = "move"): Promise<MoveResult[]> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Move operation timeout"));
      }, 60000);

      registerResolver("MOVE_BULK_COMPLETE", (data: ServerMessagePayload<"MOVE_BULK_COMPLETE">) => {
        clearTimeout(timeout);
        // Since MOVE_BULK_COMPLETE usually happens once for the entire request,
        // we can resolve it directly.
        resolve(data.results);
        return true;
      });

      try {
        const res = await fetch(`${API_BASE}/api/move-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths, targetParent, includeFiles, mode }),
        });
        if (!res.ok) {
          clearTimeout(timeout);
          reject(new Error("Failed to move folders"));
        }
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  },

  async writeFile(path: string, filename: string, content: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/api/write-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, filename, content }),
    });
    if (!res.ok) throw new Error("Failed to write file");
    return res.json();
  },

  async deleteFolder(path: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Deletion timeout: No response from server"));
      }, 30000); // 30秒超时
      
      registerResolver("DELETION_COMPLETE", (data: ServerMessagePayload<"DELETION_COMPLETE">) => {
        if (data.path === path) {
          clearTimeout(timeout);
          if (data.success) resolve();
          else reject(new Error(data.error || "Deletion failed"));
          return true;
        }
        return false;
      });

      try {
        const res = await fetch(`${API_BASE}/api/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        if (!res.ok) {
          clearTimeout(timeout);
          reject(new Error("Failed to delete folder"));
        }
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  },

  getWsUrl() {
    return `${API_BASE.replace("http", "ws")}/ws`;
  }
};
