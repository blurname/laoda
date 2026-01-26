import React, { useMemo, useState, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import { foldersAtom, isConnectedAtom, isSortedByNameAtom, isMultiSelectModeAtom, selectedPathsAtom } from "../store/atoms";
import { FolderCard } from "./FolderCard";
import { api } from "../utils/api";

export const FolderList = () => {
  const [folders, setFolders] = useAtom(foldersAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const [isSortedByName, setIsSortedByName] = useAtom(isSortedByNameAtom);
  const [isMultiSelect, setIsMultiSelect] = useAtom(isMultiSelectModeAtom);
  const [selectedPaths, setSelectedPaths] = useAtom(selectedPathsAtom);
  const [isMoving, setIsMoving] = useState(false);
  const movingLock = useRef(false);

  const displayFolders = useMemo(() => {
    if (!isSortedByName) return folders;
    return [...folders].sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, isSortedByName]);

  const handleMoveBulk = async () => {
    if (selectedPaths.length === 0 || movingLock.current) return;
    
    movingLock.current = true;
    setIsMoving(true);
    try {
      const targetParent = await api.pickFolder();
      if (!targetParent) {
        movingLock.current = false;
        setIsMoving(false);
        return;
      }

      const { results } = await api.moveBulk(selectedPaths, targetParent);
      
      const failed = results.filter(r => !r.success);
      
      if (failed.length > 0) {
        console.error("Some folders failed to move:", failed);
      }

      // Update local state with new paths for successfully moved folders
      setFolders(prev => prev.map(f => {
        const result = results.find(r => r.path === f.path && r.success);
        if (result) {
          const newPath = result.newPath;
          const name = newPath.split("/").pop() || newPath;
          return {
            ...f,
            id: btoa(newPath),
            path: newPath,
            name: name
          };
        }
        return f;
      }));

      // Start watching the new locations
      for (const result of results) {
        if (result.success) {
          api.watchFolder(result.newPath).catch(err => 
            console.error(`Failed to watch moved folder ${result.newPath}:`, err)
          );
        }
      }
      
      // Reset selection and mode
      setSelectedPaths([]);
      setIsMultiSelect(false);
    } catch (err) {
      console.error("Bulk move failed:", err);
    } finally {
      movingLock.current = false;
      setIsMoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 relative">
      <div className="flex items-center justify-between mb-1 px-1">
        <div className="flex items-center gap-4">
          <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
            DISK_PROJECTS_LIST
            <span className="bg-zinc-300 px-1 rounded-none text-zinc-600 font-mono">[{folders.length}]</span>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsMultiSelect(!isMultiSelect);
              if (isMultiSelect) setSelectedPaths([]);
            }}
            className={`px-2 py-0.5 border text-[9px] font-black uppercase tracking-widest transition-all ${
              isMultiSelect
                ? "bg-zinc-700 text-zinc-100 border-zinc-700 shadow-sm"
                : "bg-zinc-200 text-zinc-500 border-zinc-300 hover:bg-zinc-300"
            }`}
          >
            Multi_Select: {isMultiSelect ? "ON" : "OFF"}
          </button>
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
      </div>

      {isMultiSelect && selectedPaths.length > 0 && (
        <div className="fixed right-10 top-1/2 -translate-y-1/2 z-50">
          <button
            onClick={handleMoveBulk}
            disabled={isMoving}
            title={`Move ${selectedPaths.length} items`}
            className={`w-24 h-24 border-2 flex flex-col items-center justify-center transition-all 
              ${isMoving 
                ? "bg-zinc-400 border-zinc-500 text-zinc-200 cursor-default" 
                : "bg-green-600 border-green-700 text-white shadow-[0_6px_0_0_#15803d,0_15px_30px_rgba(0,0,0,0.3)] hover:bg-green-500 hover:border-green-600 active:shadow-none active:translate-y-[6px] cursor-default"
              }`}
          >
            <span className="text-[24px] font-black mb-1">{selectedPaths.length}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] leading-none">MOVE</span>
          </button>
        </div>
      )}

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
