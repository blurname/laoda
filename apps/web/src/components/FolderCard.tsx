import React, { useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { FolderInfo, selectedIDEAtom, foldersAtom, isMultiSelectModeAtom, selectedPathsAtom } from "../store/atoms";
import { api } from "../utils/api";

interface FolderCardProps {
  folder: FolderInfo;
  isBackendConnected: boolean;
}

export const FolderCard: React.FC<FolderCardProps> = ({ folder, isBackendConnected }) => {
  const selectedIDE = useAtomValue(selectedIDEAtom);
  const setFolders = useSetAtom(foldersAtom);
  const isMultiSelect = useAtomValue(isMultiSelectModeAtom);
  const [selectedPaths, setSelectedPaths] = useAtom(selectedPathsAtom);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isSelected = selectedPaths.includes(folder.path);

  const toggleSelection = () => {
    if (isSelected) {
      setSelectedPaths(prev => prev.filter(p => p !== folder.path));
    } else {
      setSelectedPaths(prev => [...prev, folder.path]);
    }
  };

  const handleOpenIDE = async () => {
    if (isMultiSelect) {
      toggleSelection();
      return;
    }
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

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;
    const confirmDelete = window.confirm(`Are you sure you want to permanently DELETE the folder at:\n${folder.path}?\n\nThis action cannot be undone.`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    try {
      await api.deleteFolder(folder.path);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    } catch (err) {
      console.error("Deletion failed:", err);
      alert("Deletion failed");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      onClick={isMultiSelect ? toggleSelection : undefined}
      className={`bg-zinc-50 border flex items-stretch relative overflow-hidden shadow-sm transition-all duration-300 ${
        isBackendConnected ? "border-zinc-300" : "border-red-200"
      } ${isSelected ? "ring-2 ring-zinc-700 ring-inset bg-zinc-100" : ""}`}
    >
      {isMultiSelect && (
        <div className="w-10 shrink-0 flex items-center justify-center border-r border-zinc-200 bg-zinc-100/50">
          <div className={`w-4 h-4 border-2 transition-all ${
            isSelected 
              ? "bg-zinc-700 border-zinc-700 shadow-sm" 
              : "bg-white border-zinc-300"
          }`}>
            {isSelected && (
              <svg className="w-full h-full text-white" viewBox="0 0 12 12">
                <path d="M3 6L5 8L9 4" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            )}
          </div>
        </div>
      )}
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

              {!isMultiSelect && (
                <>
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

                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className={`px-2 py-0.5 border text-[9px] font-black uppercase tracking-widest transition-all ${
                      isDeleting
                        ? "bg-zinc-100 text-zinc-400 border-zinc-200"
                        : "bg-zinc-200/50 text-zinc-500 border-zinc-200 hover:bg-red-600 hover:text-white hover:border-red-700 active:bg-red-700"
                    }`}
                  >
                    {isDeleting ? "DEL..." : "DEL"}
                  </button>
                </>
              )}
            </div>

            {folder.diffCount > 0 && isBackendConnected && (
              <div className="text-[10px] font-black text-amber-500 bg-zinc-700 px-2 py-0.5 border border-zinc-800 uppercase tracking-tighter shadow-sm">
                {folder.diffCount} diff
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
        onClick={(e) => {
          e.stopPropagation();
          handleOpenIDE();
        }}
        className={`w-14 shrink-0 flex items-center justify-center transition-all border-l select-none group/btn ${
          isMultiSelect
            ? isSelected ? "bg-zinc-700 border-zinc-800" : "bg-zinc-200 border-zinc-300 hover:bg-zinc-300"
            : selectedIDE 
              ? "bg-zinc-200/50 border-zinc-200 hover:bg-zinc-700 hover:border-zinc-800 active:bg-zinc-800" 
              : "bg-zinc-100 border-zinc-200 opacity-50"
        }`}
      >
        <div className={`transition-colors ${
          isMultiSelect
            ? "text-zinc-100"
            : selectedIDE ? "text-zinc-400 group-hover/btn:text-zinc-100" : "text-zinc-300"
        }`}>
          {isMultiSelect ? (
            isSelected ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M3 6L5 8L9 4" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            ) : (
              <span className="text-[9px] font-black uppercase">ADD</span>
            )
          ) : selectedIDE ? (
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
