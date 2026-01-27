import { registerResolver } from "../hooks/useSocket";

const isProd = import.meta.env.PROD;
const API_BASE = isProd ? window.location.origin : "http://localhost:26124";

export const api = {
  async pickFolder(): Promise<string | null> {
    const res = await fetch(`${API_BASE}/api/pick-folder`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to pick folder");
    
    // Return a promise that resolves when the WebSocket receives the result
    return new Promise((resolve) => {
      registerResolver("FOLDER_PICKED", (data) => resolve(data.path));
    });
  },

  async watchFolder(path: string) {
    const res = await fetch(`${API_BASE}/api/watch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error("Failed to watch folder");
    return res.json();
  },

  async watchBulk(paths: string[]) {
    const res = await fetch(`${API_BASE}/api/watch-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    if (!res.ok) throw new Error("Failed to watch folders in bulk");
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

  async duplicateFolder(path: string): Promise<string> {
    const res = await fetch(`${API_BASE}/api/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error("Failed to duplicate folder");
    
    return new Promise((resolve, reject) => {
      registerResolver("DUPLICATION_COMPLETE", (data) => {
        if (data.success) resolve(data.newPath);
        else reject(new Error(data.error || "Duplication failed"));
      });
    });
  },

  async moveBulk(paths: string[], targetParent: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/move-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths, targetParent }),
    });
    if (!res.ok) throw new Error("Failed to move folders");
    
    return new Promise((resolve) => {
      registerResolver("MOVE_BULK_COMPLETE", (data) => resolve(data.results));
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
    const res = await fetch(`${API_BASE}/api/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error("Failed to delete folder");

    return new Promise((resolve, reject) => {
      registerResolver("DELETION_COMPLETE", (data) => {
        if (data.success) resolve();
        else reject(new Error(data.error || "Deletion failed"));
      });
    });
  },

  getWsUrl() {
    return `${API_BASE.replace("http", "ws")}/ws`;
  }
};
