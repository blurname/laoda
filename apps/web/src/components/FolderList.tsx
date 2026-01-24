import React from "react";
import { useAtomValue } from "jotai";
import { foldersAtom, isConnectedAtom } from "../store/atoms";
import { FolderCard } from "./FolderCard";

export const FolderList = () => {
  const folders = useAtomValue(foldersAtom);
  const isConnected = useAtomValue(isConnectedAtom);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
          DISK_PROJECTS_LIST
          <span className="bg-zinc-300 px-1 rounded-none text-zinc-600 font-mono">[{folders.length}]</span>
        </h2>
      </div>

      {folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-zinc-300 bg-zinc-50 text-zinc-400">
          <p className="text-[10px] uppercase tracking-widest font-bold">No entries found in registry.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {folders.map((folder) => (
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
