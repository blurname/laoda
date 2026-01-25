import { atomWithStorage } from "jotai/utils";

export interface FolderInfo {
  id: string;
  path: string;
  name: string;
  branch: string;
  diffCount: number;
  latestCommit: string;
}

export const foldersAtom = atomWithStorage<FolderInfo[]>("imported-folders", []);

export type IDEType = "cursor" | "trae" | "vscode" | null;

export const selectedIDEAtom = atomWithStorage<IDEType>("selected-ide", null);

export type ViewType = "list" | "data" | "sync";
export const viewAtom = atomWithStorage<ViewType>(
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

export interface ManagedFile {
  id: string;
  filename: string;
  content: string;
  targetPattern: string; // The folder name to match
}

export const managedFilesAtom = atomWithStorage<ManagedFile[]>("managed-files", []);

import { atom } from "jotai";
export const isConnectedAtom = atom(false);
