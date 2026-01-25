import React, { useMemo } from "react";
import { useAtom, useAtomValue } from "jotai";
import { foldersAtom, isConnectedAtom, isSortedByNameAtom } from "../store/atoms";
import { FolderCard } from "./FolderCard";

export const FolderList = () => {
  const folders = useAtomValue(foldersAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const [isSortedByName, setIsSortedByName] = useAtom(isSortedByNameAtom);

  const displayFolders = useMemo(() => {
    if (!isSortedByName) return folders;
    return [...folders].sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, isSortedByName]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
          DISK_PROJECTS_LIST
          <span className="bg-zinc-300 px-1 rounded-none text-zinc-600 font-mono">[{folders.length}]</span>
        </h2>

        <button
          onClick={() => setIsSortedByName(!isSortedByName)}
          className={`px-2 py-0.5 border text-[9px] font-black uppercase tracking-widest transition-all ${
            isSortedByName
              ? "bg-zinc-700 text-zinc-100 border-zinc-700 shadow-sm"
              : "bg-zinc-200 text-zinc-500 border-zinc-300 hover:bg-zinc-300"
          }`}
        >
          Sort_By_Name: {isSortedByName ? "ON" : "OFF"}
        </button>
      </div>

      {folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-zinc-300 bg-zinc-50 text-zinc-400">
          <p className="text-[10px] uppercase tracking-widest font-bold">No entries found in registry.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {displayFolders.map((folder) => (
            <FolderCard 
              key={folder.id} 
              folder={folder} 
              isBackendConnected={isConnected} 
            />
          ))}
        </div>
      )}
    </div>
  );
};
