import React, { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { FolderInfo, selectedIDEAtom, foldersAtom } from "../store/atoms";
import { api } from "../utils/api";

interface FolderCardProps {
  folder: FolderInfo;
  isBackendConnected: boolean;
}

export const FolderCard: React.FC<FolderCardProps> = ({ folder, isBackendConnected }) => {
  const selectedIDE = useAtomValue(selectedIDEAtom);
  const setFolders = useSetAtom(foldersAtom);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const handleOpenIDE = async () => {
    if (!selectedIDE) {
      alert("Please select a target IDE first");
      return;
    }
    try {
      await api.openInIDE(selectedIDE, folder.path);
    } catch (err) {
      console.error(`Failed to open ${selectedIDE}:`, err);
    }
  };

  const handleDuplicate = async () => {
    if (isDuplicating) return;
    setIsDuplicating(true);
    try {
      const { newPath } = await api.duplicateFolder(folder.path);
      const name = newPath.split("/").pop() || newPath;
      const id = btoa(newPath);
      
      const newFolder = {
        id,
        name,
        path: newPath,
        branch: "loading...",
        diffCount: 0,
        latestCommit: "",
      };

      setFolders((prev) => {
        if (prev.find((f) => f.path === newPath)) return prev;
        return [...prev, newFolder];
      });

      await api.watchFolder(newPath);
    } catch (err) {
      console.error("Duplication failed:", err);
      alert("Duplication failed");
    } finally {
      setIsDuplicating(false);
    }
  };

  return (
    <div
      className={`bg-zinc-50 border flex items-stretch relative overflow-hidden shadow-sm transition-all duration-300 ${
        isBackendConnected ? "border-zinc-300" : "border-red-200"
      }`}
    >
      <div className="flex items-center gap-6 flex-1 min-w-0 p-4 opacity-90">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4 mb-2">
            <h3 className={`text-base font-bold tracking-tight truncate ${isBackendConnected ? "text-zinc-800" : "text-zinc-500"}`}>
              {folder.name}
            </h3>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-1.5 bg-zinc-200/50 px-2 py-0.5 border border-zinc-200">
                <span className="text-[11px] font-bold text-zinc-600">
                  {folder.branch || "no-branch"}
                </span>
              </div>

              <div className={`flex items-center justify-center w-5 h-5 border transition-colors ${
                isBackendConnected 
                  ? "bg-zinc-700 border-zinc-800 shadow-sm" 
                  : "bg-zinc-100 border-zinc-200"
              }`}>
                <div className={`w-1 h-1 rounded-full transition-all ${
                  isBackendConnected 
                    ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.8)]" 
                    : "bg-zinc-300"
                }`} />
              </div>

              <button
                onClick={handleDuplicate}
                disabled={isDuplicating}
                className={`px-2 py-0.5 border text-[9px] font-black uppercase tracking-widest transition-all ${
                  isDuplicating
                    ? "bg-zinc-100 text-zinc-400 border-zinc-200"
                    : "bg-zinc-200/50 text-zinc-500 border-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 hover:border-zinc-700 active:bg-zinc-800"
                }`}
              >
                {isDuplicating ? "DUP..." : "DUP"}
              </button>
            </div>

            {folder.diffCount > 0 && isBackendConnected && (
              <div className="text-[10px] font-black text-amber-500 bg-zinc-700 px-2 py-0.5 border border-zinc-800 uppercase tracking-tighter shadow-sm">
                {folder.diffCount} Pending
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-zinc-500">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <span className="truncate max-w-[300px] opacity-70">{folder.path}</span>
            </div>
            {folder.latestCommit && (
              <div className="flex items-center gap-1.5 text-[11px] truncate border-l border-zinc-300 pl-4">
                <span className="truncate italic opacity-70">{folder.latestCommit}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div 
        onClick={handleOpenIDE}
        className={`w-14 shrink-0 flex items-center justify-center transition-all border-l select-none group/btn ${
          selectedIDE 
            ? "bg-zinc-200/50 border-zinc-200 hover:bg-zinc-700 hover:border-zinc-800 active:bg-zinc-800" 
            : "bg-zinc-100 border-zinc-200 opacity-50"
        }`}
      >
        <div className={`transition-colors ${
          selectedIDE ? "text-zinc-400 group-hover/btn:text-zinc-100" : "text-zinc-300"
        }`}>
          {selectedIDE ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 1L10 6L3 11V1Z" />
            </svg>
          ) : (
            <span className="text-[10px] font-black uppercase tracking-[0.1em]">OFF</span>
          )}
        </div>
      </div>
    </div>
  );
};
