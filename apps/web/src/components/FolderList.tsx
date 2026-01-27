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

  const treeItems = useMemo(() => {
    const sorted = !isSortedByName ? folders : [...folders].sort((a, b) => a.name.localeCompare(b.name));
    
    // Group by parent directory
    const groups = new Map<string, typeof folders>();
    sorted.forEach(f => {
      const parent = f.path.split("/").slice(0, -1).join("/");
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent)!.push(f);
    });

    const result: (
      | { type: "project"; folder: (typeof folders)[0] }
      | { type: "group"; path: string; name: string; children: typeof folders }
    )[] = [];

    const processedParents = new Set<string>();

    sorted.forEach(f => {
      const parent = f.path.split("/").slice(0, -1).join("/");
      if (processedParents.has(parent)) return;

      const groupProjects = groups.get(parent)!;
      if (groupProjects.length > 1) {
        result.push({
          type: "group",
          path: parent,
          name: parent.split("/").pop() || parent,
          children: groupProjects
        });
        processedParents.add(parent);
      } else {
        result.push({ type: "project", folder: f });
      }
    });

    return result;
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
          <h2 className="text-[10px] font-black text-zinc-500 capitalize tracking-[0.2em] flex items-center gap-2">
            Disk_Projects_List
            <span className="bg-zinc-300 px-1 rounded-none text-zinc-600 font-mono">[{folders.length}]</span>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsMultiSelect(!isMultiSelect);
              if (isMultiSelect) setSelectedPaths([]);
            }}
            className={`px-2 py-0.5 border text-[9px] font-black capitalize tracking-widest transition-all ${
              isMultiSelect
                ? "bg-zinc-700 text-zinc-100 border-zinc-700 shadow-sm"
                : "bg-zinc-200 text-zinc-500 border-zinc-300 hover:bg-zinc-300"
            }`}
          >
            Multi_Select: {isMultiSelect ? "On" : "Off"}
          </button>
          <button
            onClick={() => setIsSortedByName(!isSortedByName)}
            className={`px-2 py-0.5 border text-[9px] font-black capitalize tracking-widest transition-all ${
              isSortedByName
                ? "bg-zinc-700 text-zinc-100 border-zinc-700 shadow-sm"
                : "bg-zinc-200 text-zinc-500 border-zinc-300 hover:bg-zinc-300"
            }`}
          >
            Sort_By_Name: {isSortedByName ? "On" : "Off"}
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
            <span className="text-[10px] font-black capitalize tracking-[0.2em] leading-none">Move</span>
          </button>
        </div>
      )}

      {folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-zinc-300 bg-zinc-50 text-zinc-400">
          <p className="text-[10px] capitalize tracking-widest font-bold">No entries found in registry.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 pb-10">
          {treeItems.map((item) => {
            if (item.type === "group") {
              return (
                <div key={item.path} className="flex flex-col gap-1">
                  <FolderCard 
                    folder={{
                      id: btoa(item.path),
                      name: item.name,
                      path: item.path,
                      branch: "",
                      diffCount: 0,
                      latestCommit: ""
                    }}
                    isBackendConnected={isConnected}
                    isGroup={true}
                  />
                  <div className="flex flex-col gap-1 pl-6 border-l-2 border-zinc-300 ml-4 py-1">
                    {item.children.map(child => (
                      <FolderCard 
                        key={child.id} 
                        folder={child} 
                        isBackendConnected={isConnected} 
                      />
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <FolderCard 
                key={item.folder.id} 
                folder={item.folder} 
                isBackendConnected={isConnected} 
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
