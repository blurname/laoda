import React, { useMemo, useState, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { foldersAtom, isConnectedAtom, isSortedByNameAtom, isMultiSelectModeAtom, selectedPathsAtom, toastsAtom, ToastInfo } from "../store/atoms";
import { FolderCard } from "./FolderCard";
import { api } from "../utils/api";

export const FolderList = () => {
  const [folders, setFolders] = useAtom(foldersAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const [isSortedByName, setIsSortedByName] = useAtom(isSortedByNameAtom);
  const [isMultiSelect, setIsMultiSelect] = useAtom(isMultiSelectModeAtom);
  const [selectedPaths, setSelectedPaths] = useAtom(selectedPathsAtom);
  const setToasts = useSetAtom(toastsAtom);
  const [isMoving, setIsMoving] = useState(false);
  const movingLock = useRef(false);

  const treeItems = useMemo(() => {
    const sorted = !isSortedByName ? folders : [...folders].sort((a, b) => a.name.localeCompare(b.name));
    
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
      | { type: "group"; path: string; name: string; children: typeof folders }
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

      // 乐观更新：先保存原始数据（按路径索引），然后立即更新路径
      const originalFoldersMap = new Map<string, typeof folders[0]>();
      folders.forEach((f) => {
        if (selectedPaths.includes(f.path)) {
          originalFoldersMap.set(f.path, { ...f });
        }
      });

      // 预测新路径并立即更新
      setFolders((prev) =>
        prev.map((f) => {
          if (selectedPaths.includes(f.path)) {
            const folderName = f.name.replace(/^Moving: /, "");
            // Ensure targetParent doesn't end with slash and predictedPath doesn't have double slashes
            const cleanParent = targetParent.endsWith("/") ? targetParent.slice(0, -1) : targetParent;
            const predictedPath = `${cleanParent}/${folderName}`;
            const name = predictedPath.split("/").filter(Boolean).pop() || predictedPath;
            return {
              ...f,
              id: encodeURIComponent(predictedPath).replace(/%/g, "_"),
              path: predictedPath,
              name: `Moving: ${name}`,
            };
          }
          return f;
        })
      );

      const results = await api.moveBulk(selectedPaths, targetParent);
      
      const failed = results.filter(r => !r.success);
      const succeeded = results.filter(r => r.success);
      
      // 更新为实际路径（可能与预测的不同）
      if (succeeded.length > 0) {
        setFolders((prev) =>
          prev.map((f) => {
            // 通过原始路径匹配结果
            const result = succeeded.find((r) => {
              const original = originalFoldersMap.get(r.path);
              return original && original.id === f.id;
            });
            if (result) {
              const newPath = result.newPath;
              const name = newPath.split("/").pop() || newPath;
              return {
                ...f,
                id: encodeURIComponent(newPath).replace(/%/g, "_"),
                path: newPath,
                name: name, // 移除 "Moving: " 前缀，恢复真实名字
              };
            }
            return f;
          })
        );
      }

      // 如果有失败的，回滚失败的项
      if (failed.length > 0) {
        console.error("Some folders failed to move:", failed);
        setFolders((prev) =>
          prev.map((f) => {
            // 检查当前文件夹是否对应失败的原始路径
            for (const failedResult of failed) {
              const original = originalFoldersMap.get(failedResult.path);
              if (original && original.id === f.id) {
                // 回滚：恢复原始数据
                return original;
              }
            }
            return f;
          })
        );
        setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Partial move failed", type: "error" } : t));
      } else {
        setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Move success", type: "success" } : t));
      }
      setTimeout(() => setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId)), 2000);

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
          <h2 className="text-[10px] font-black text-zinc-500 tracking-[0.2em] flex items-center gap-2">
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
            className={`px-2 py-0.5 border text-[9px] font-black tracking-widest transition-all ${
              isMultiSelect
                ? "bg-zinc-700 text-zinc-100 border-zinc-700 shadow-sm"
                : "bg-zinc-200 text-zinc-500 border-zinc-300 hover:bg-zinc-300"
            }`}
          >
            Multi select: {isMultiSelect ? "on" : "off"}
          </button>
          <button
            onClick={() => setIsSortedByName(!isSortedByName)}
            className={`px-2 py-0.5 border text-[9px] font-black tracking-widest transition-all ${
              isSortedByName
                ? "bg-zinc-700 text-zinc-100 border-zinc-700 shadow-sm"
                : "bg-zinc-200 text-zinc-500 border-zinc-300 hover:bg-zinc-300"
            }`}
          >
            Sort by name: {isSortedByName ? "on" : "off"}
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
            <span className="text-[10px] font-black tracking-[0.2em] leading-none">Move</span>
          </button>
        </div>
      )}

      {folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-zinc-300 bg-zinc-50 text-zinc-400">
          <p className="text-[10px] tracking-widest font-bold">No entries found in registry.</p>
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
