const isProd = import.meta.env.PROD;
const API_BASE = isProd ? window.location.origin : "http://localhost:26124";

export const api = {
  async pickFolder(): Promise<string> {
    const res = await fetch(`${API_BASE}/api/pick-folder`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to pick folder");
    const { path } = await res.json();
    return path;
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

  async openInIDE(ide: string, path: string) {
    const res = await fetch(`${API_BASE}/api/open/${ide}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error(`Failed to open in ${ide}`);
    return res.json();
  },

  async duplicateFolder(path: string): Promise<{ success: boolean; newPath: string }> {
    const res = await fetch(`${API_BASE}/api/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error("Failed to duplicate folder");
    return res.json();
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

  async deleteFolder(path: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/api/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error("Failed to delete folder");
    return res.json();
  },

  getWsUrl() {
    return `${API_BASE.replace("http", "ws")}/ws`;
  }
};
