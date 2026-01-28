import { spawn, execSync } from "child_process";

export interface OSAdapter {
  pickFolder(): Promise<string | null>;
  openInIDE(appName: string, path: string): Promise<void>;
}

export class MacOSAdapter implements OSAdapter {
  private isPickerOpen = false;

  async pickFolder(): Promise<string | null> {
    if (this.isPickerOpen) {
      console.log("Picker already open, ignoring request.");
      return null;
    }

    this.isPickerOpen = true;
    try {
      // 使用 execSync 同步执行，因为这是一个独立的背景任务进程，且 osascript 执行很快
      const outputRaw = execSync(
        'osascript -e \'POSIX path of (choose folder with prompt "Select a folder")\'',
        { encoding: "utf8" }
      ).trim();
      
      const trimmedOutput = outputRaw.trim();
      console.log(`Picker returned path: ${trimmedOutput || "none"}`);
      return trimmedOutput || null;
    } catch (e: any) {
      // osascript 被取消时会抛出错误 (exit code 1)
      console.log(`Picker closed or failed: ${e.message || "User canceled"}`);
      return null;
    } finally {
      this.isPickerOpen = false;
    }
  }

  async openInIDE(appName: string, path: string): Promise<void> {
    console.log(`Executing: open -a "${appName}" "${path}"`);
    spawn("open", ["-a", appName, path], {
      stdio: "inherit",
    });
  }
}

export const osAdapter: OSAdapter = new MacOSAdapter();
