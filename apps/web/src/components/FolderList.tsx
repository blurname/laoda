import React, { useMemo, useState, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { foldersAtom, isConnectedAtom, sortByAtom, isMultiSelectModeAtom, selectedPathsAtom, toastsAtom, ToastInfo, settingsAtom, SortType } from "../store/atoms";
import { FolderCard } from "./FolderCard";
import { api } from "../utils/api";
import { StatusPrefix, formatStatusName } from "../utils/status";

export const FolderList = () => {
  const [folders, setFolders] = useAtom(foldersAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const settings = useAtomValue(settingsAtom);
  const [sortBy, setSortBy] = useAtom(sortByAtom);
  const [isMultiSelect, setIsMultiSelect] = useAtom(isMultiSelectModeAtom);
  const [selectedPaths, setSelectedPaths] = useAtom(selectedPathsAtom);
  const setToasts = useSetAtom(toastsAtom);
  const [isMoving, setIsMoving] = useState(false);
  const [isNamingGroup, setIsNamingGroup] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");
  const movingLock = useRef(false);

  const treeItems = useMemo(() => {
    let sorted = [...folders];
    
    if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "added") {
      sorted.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    } else if (sortBy === "lastUsed") {
      sorted.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
    }
    
    // Group by parent directory
    const groups = new Map<string, typeof folders>();
    sorted.forEach(f => {
      const parts = f.path.split("/").filter(Boolean);
      if (parts.length <= 1) return; // Cannot group root or single level folders
      const parent = "/" + parts.slice(0, -1).join("/");
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent)!.push(f);
    });

    const result: (
      | { type: "project"; folder: (typeof folders)[0] }
      | { type: "group"; path: string; name: string; children: typeof folders; maxLastUsedAt: number }
    )[] = [];

    const processedParents = new Set<string>();

    sorted.forEach(f => {
      const parts = f.path.split("/").filter(Boolean);
      if (parts.length <= 1) {
        result.push({ type: "project", folder: f });
        return;
      }
      const parent = "/" + parts.slice(0, -1).join("/");
      if (processedParents.has(parent)) return;

      const groupProjects = groups.get(parent)!;
      if (groupProjects.length > 1) {
        result.push({
          type: "group",
          path: parent,
          name: parent.split("/").filter(Boolean).pop() || parent,
          children: groupProjects,
          maxLastUsedAt: Math.max(...groupProjects.map(p => p.lastUsedAt || 0))
        });
        processedParents.add(parent);
      } else {
        result.push({ type: "project", folder: f });
      }
    });

    // If sorting by lastUsed, we need to sort groups by their maxLastUsedAt as well
    if (sortBy === "lastUsed") {
      result.sort((a, b) => {
        const timeA = a.type === "group" ? a.maxLastUsedAt : a.folder.lastUsedAt || 0;
        const timeB = b.type === "group" ? b.maxLastUsedAt : b.folder.lastUsedAt || 0;
        return timeB - timeA;
      });
    } else if (sortBy === "added") {
      result.sort((a, b) => {
        const timeA = a.type === "group" ? Math.max(...a.children.map(c => c.addedAt || 0)) : a.folder.addedAt || 0;
        const timeB = b.type === "group" ? Math.max(...b.children.map(c => c.addedAt || 0)) : b.folder.addedAt || 0;
        return timeB - timeA;
      });
    }

    return result;
  }, [folders, sortBy]);

  const handleMoveBulk = async () => {
    if (selectedPaths.length === 0 || movingLock.current) return;
    
    movingLock.current = true;
    setIsMoving(true);
    
    const toastId = Math.random().toString(36).substring(7);
    setToasts((prev: ToastInfo[]) => [...prev, { id: toastId, message: `Moving ${selectedPaths.length} items...`, type: "loading" }]);

    try {
      const targetParent = await api.pickFolder();
      if (!targetParent) {
        setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId));
        movingLock.current = false;
        setIsMoving(false);
        return;
      }
      await performMove(selectedPaths, targetParent, toastId, "Moving");
    } catch (err) {
      console.error("Bulk move failed:", err);
    } finally {
      movingLock.current = false;
      setIsMoving(false);
    }
  };

  const handleGroup = async () => {
    if (selectedPaths.length === 0 || movingLock.current) return;
    setIsNamingGroup(true);
  };

  const submitGroup = async () => {
    let groupName = groupNameInput.trim().replace(/\s+/g, "_");
    if (!groupName) {
      setIsNamingGroup(false);
      return;
    }

    movingLock.current = true;
    setIsMoving(true);
    setIsNamingGroup(false);
    setGroupNameInput("");
    
    const toastId = Math.random().toString(36).substring(7);
    setToasts((prev: ToastInfo[]) => [...prev, { id: toastId, message: `Grouping ${selectedPaths.length} items...`, type: "loading" }]);

    try {
      // Calculate common parent directory
      const pathsParts = selectedPaths.map(p => p.split("/").filter(Boolean));
      let commonParts: string[] = [];
      if (pathsParts.length > 0) {
        const minLen = Math.min(...pathsParts.map(p => p.length));
        const first = pathsParts[0];
        
        for (let i = 0; i < minLen; i++) { 
          const part = first[i];
          if (part && pathsParts.every(pp => pp[i] === part)) {
            commonParts.push(part);
          } else {
            break;
          }
        }
      }
      
      let targetParent = "/" + commonParts.join("/");
      if (selectedPaths.some(p => p === targetParent || p === targetParent + "/")) {
        targetParent = "/" + commonParts.slice(0, -1).join("/");
      }

      const targetDir = `${targetParent.endsWith("/") ? targetParent : targetParent + "/"}${groupName}`;
      await performMove(selectedPaths, targetDir, toastId, "Grouping");
    } catch (err) {
      console.error("Grouping failed:", err);
      movingLock.current = false;
      setIsMoving(false);
    }
  };

  const performMove = async (paths: string[], targetParent: string, toastId: string, label: "Moving" | "Grouping") => {
    console.log(`Starting performMove: ${label}`, { paths, targetParent });
    // 乐观更新：先保存原始数据（按路径索引），然后立即更新路径
    const originalFoldersMap = new Map<string, typeof folders[0]>();
    folders.forEach((f) => {
      if (paths.includes(f.path)) {
        originalFoldersMap.set(f.path, { ...f });
      }
    });

    // 预测新路径并立即更新
    setFolders((prev) =>
      prev.map((f) => {
        if (paths.includes(f.path)) {
          const folderName = f.path.split("/").filter(Boolean).pop() || f.path;
          const cleanParent = targetParent.endsWith("/") ? targetParent.slice(0, -1) : targetParent;
          const predictedPath = `${cleanParent}/${folderName}`;
          const name = predictedPath.split("/").filter(Boolean).pop() || predictedPath;
          return {
            ...f,
            id: encodeURIComponent(predictedPath).replace(/%/g, "_"),
            path: predictedPath,
            name: formatStatusName(label === "Moving" ? StatusPrefix.MOVING : StatusPrefix.GROUPING, name),
          };
        }
        return f;
      })
    );

    try {
      console.log("Calling api.moveBulk...");
      const results = await api.moveBulk(paths, targetParent, settings.copyIncludeFiles, settings.operationMode);
      console.log("api.moveBulk returned:", results);
      
      const failed = results.filter(r => !r.success);
      const succeeded = results.filter(r => r.success);
      
      // 更新为实际路径（可能与预测的不同）
      if (succeeded.length > 0) {
        setFolders((prev) =>
          prev.map((f) => {
            const result = succeeded.find((r) => {
              const folderName = r.path.split("/").filter(Boolean).pop() || r.path;
              const cleanParent = targetParent.endsWith("/") ? targetParent.slice(0, -1) : targetParent;
              const predictedPath = `${cleanParent}/${folderName}`;
              return f.path === predictedPath;
            });
            if (result && result.newPath) {
              const newPath = result.newPath;
              const name = newPath.split("/").pop() || newPath;
              return {
                ...f,
                id: encodeURIComponent(newPath).replace(/%/g, "_"),
                path: newPath,
                name: name,
              };
            }
            return f;
          })
        );
      }

      if (failed.length > 0) {
        setFolders((prev) =>
          prev.map((f) => {
            for (const failedResult of failed) {
              const folderName = failedResult.path.split("/").filter(Boolean).pop() || failedResult.path;
              const cleanParent = targetParent.endsWith("/") ? targetParent.slice(0, -1) : targetParent;
              const predictedPath = `${cleanParent}/${folderName}`;
              
              if (f.path === predictedPath) {
                const original = originalFoldersMap.get(failedResult.path);
                if (original) return original;
              }
            }
            return f;
          })
        );
        setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Partial operation failed", type: "error" } : t));
      } else {
        setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Success", type: "success" } : t));
      }
    } catch (err) {
      console.error("Error inside performMove api call:", err);
      // Rollback all on critical fetch error
      setFolders((prev) =>
        prev.map((f) => {
          const original = originalFoldersMap.get(f.path);
          return original || f;
        })
      );
      setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Operation failed", type: "error" } : t));
    } finally {
      setTimeout(() => setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId)), 2000);

      // Start watching new paths regardless of success/fail (existing paths will be ignored)
      paths.forEach(p => {
        // We don't have the new path here easily if it failed, but we can try to re-watch original
        api.watchFolder(p).catch(() => {});
      });
      
      setSelectedPaths([]);
      setIsMultiSelect(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 relative">
      <div className="flex items-center justify-between mb-1 px-1">
        <div className="flex items-center gap-4">
          <h2 className="text-[10px] font-black text-zinc-500 flex items-center gap-2">
            Disk projects list
            <span className="bg-zinc-300 px-1 rounded-none text-zinc-600 font-mono">[{folders.length}]</span>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsMultiSelect(!isMultiSelect);
              if (isMultiSelect) setSelectedPaths([]);
            }}
            className={`px-2 py-0.5 border text-[9px] font-black transition-all ${
              isMultiSelect
                ? "bg-zinc-700 text-zinc-100 border-zinc-700 shadow-sm"
                : "bg-zinc-200 text-zinc-500 border-zinc-300 hover:bg-zinc-300"
            }`}
          >
            Multi select: {isMultiSelect ? "on" : "off"}
          </button>
          <div className="flex items-center gap-0 border border-zinc-300 bg-zinc-200">
            <div className="px-2 py-0.5 text-[9px] font-black text-zinc-500 border-r border-zinc-300">
              Sort
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
              className="bg-transparent px-2 py-0.5 text-[9px] font-black text-zinc-700 focus:outline-none cursor-default"
            >
              <option value="added">Added time</option>
              <option value="name">Name</option>
              <option value="lastUsed">Recently used</option>
            </select>
          </div>
        </div>
      </div>

      {isMultiSelect && selectedPaths.length > 0 && (
        <div className="fixed right-10 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4">
          {!isNamingGroup ? (
            <>
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
                <span className="text-[10px] font-black leading-none">Move</span>
              </button>

              <button
                onClick={handleGroup}
                disabled={isMoving}
                title={`Group ${selectedPaths.length} items`}
                className={`w-24 h-24 border-2 flex flex-col items-center justify-center transition-all 
                  ${isMoving 
                    ? "bg-zinc-400 border-zinc-500 text-zinc-200 cursor-default" 
                    : "bg-zinc-700 border-zinc-800 text-zinc-100 shadow-[0_6px_0_0_#3f3f46,0_15px_30px_rgba(0,0,0,0.3)] hover:bg-zinc-600 active:shadow-none active:translate-y-[6px] cursor-default"
                  }`}
              >
                <span className="text-[24px] font-black mb-1">{selectedPaths.length}</span>
                <span className="text-[10px] font-black leading-none">Group</span>
              </button>
            </>
          ) : (
            <div className="bg-zinc-50 border-2 border-zinc-700 p-4 shadow-2xl flex flex-col gap-3 w-48">
              <h4 className="text-[10px] font-black text-zinc-400 uppercase">Group name</h4>
              <input
                autoFocus
                value={groupNameInput}
                onChange={(e) => setGroupNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitGroup();
                  if (e.key === "Escape") setIsNamingGroup(false);
                }}
                placeholder="folder_name"
                className="w-full bg-zinc-100 border border-zinc-300 px-2 py-1.5 text-xs font-mono text-zinc-700 focus:outline-none focus:border-zinc-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setIsNamingGroup(false)}
                  className="flex-1 py-1 text-[9px] font-black bg-zinc-200 text-zinc-500 border border-zinc-300 hover:bg-zinc-300"
                >
                  Cancel
                </button>
                <button
                  onClick={submitGroup}
                  className="flex-1 py-1 text-[9px] font-black bg-zinc-700 text-zinc-100 border border-zinc-700 hover:bg-zinc-800"
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-zinc-300 bg-zinc-50 text-zinc-400">
          <p className="text-[10px] font-bold">No entries found in registry.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 pb-10">
          {treeItems.map((item) => {
            if (item.type === "group") {
              return (
                <div key={item.path} className="flex flex-col gap-1">
          <FolderCard 
            folder={{
              id: encodeURIComponent(item.path).replace(/%/g, "_"),
              name: item.name,
              path: item.path,
              branch: "",
              diffCount: 0,
              latestCommit: "",
              addedAt: 0,
              lastUsedAt: item.maxLastUsedAt
            }}
            isBackendConnected={isConnected}
            isGroup={true}
            groupChildren={item.children}
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
