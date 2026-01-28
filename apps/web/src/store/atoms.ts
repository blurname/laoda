import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export interface FolderInfo {
  id: string;
  path: string;
  name: string;
  branch: string;
  diffCount: number;
  latestCommit: string;
}

export interface ManagedFile {
  id: string;
  filename: string;
  content: string;
  targetPattern: string; // The folder name to match
}

export type ViewType = "list" | "data" | "sync";

export interface IDEConfig {
  type: "preset" | "custom";
  value: string;
}

export interface Settings {
  copyIncludeFiles: string[];
}

export interface LaodaStorage {
  "imported-folders": FolderInfo[];
  "selected-ide-config": IDEConfig;
  "current-view": ViewType;
  "managed-files": ManagedFile[];
  "is-sorted-by-name": boolean;
  "settings": Settings;
}

export const foldersAtom = atomWithStorage<LaodaStorage["imported-folders"]>("imported-folders", []);

export const selectedIDEAtom = atomWithStorage<LaodaStorage["selected-ide-config"]>("selected-ide-config", {
  type: "preset",
  value: "Cursor"
});

export const settingsAtom = atomWithStorage<LaodaStorage["settings"]>("settings", {
  copyIncludeFiles: [".env.local"]
});

export const viewAtom = atomWithStorage<LaodaStorage["current-view"]>(
  "current-view",
  (() => {
    if (typeof window === "undefined") return "list";
    try {
      const stored = localStorage.getItem("current-view");
      return stored ? (JSON.parse(stored) as ViewType) : "list";
    } catch {
      return "list";
    }
  })()
);

export const managedFilesAtom = atomWithStorage<LaodaStorage["managed-files"]>("managed-files", []);

export const isSortedByNameAtom = atomWithStorage<LaodaStorage["is-sorted-by-name"]>("is-sorted-by-name", false);
export const isMultiSelectModeAtom = atom(false);
export const selectedPathsAtom = atom<string[]>([]);

export const isConnectedAtom = atom(false);

export interface ToastInfo {
  message: string;
  type: "loading" | "success" | "error";
  id: string;
}

export const toastsAtom = atom<ToastInfo[]>([]);
