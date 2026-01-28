import React, { useState, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { FolderInfo, selectedIDEAtom, foldersAtom, isMultiSelectModeAtom, selectedPathsAtom, toastsAtom, ToastInfo, settingsAtom } from "../store/atoms";
import { api } from "../utils/api";
import { StatusPrefix, formatStatusName } from "../utils/status";

interface FolderCardProps {
  folder: FolderInfo;
  isBackendConnected: boolean;
  isGroup?: boolean;
  groupChildren?: FolderInfo[];
}

export const FolderCard: React.FC<FolderCardProps> = ({ folder, isBackendConnected, isGroup, groupChildren }) => {
  const ideConfig = useAtomValue(selectedIDEAtom);
  const settings = useAtomValue(settingsAtom);
  const setFolders = useSetAtom(foldersAtom);
  const isMultiSelect = useAtomValue(isMultiSelectModeAtom);
  const [selectedPaths, setSelectedPaths] = useAtom(selectedPathsAtom);
  const setToasts = useSetAtom(toastsAtom);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUngrouping, setIsUngrouping] = useState(false);
  const duplicateToastTimeoutRef = useRef<any>(null);
  const deleteToastTimeoutRef = useRef<any>(null);

  // ... (useEffect remains same)

  const handleUngroup = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUngrouping || !groupChildren || groupChildren.length === 0) return;

    const confirm = window.confirm(`Ungroup "${folder.name}"? All items will be moved to the parent directory.`);
    if (!confirm) return;

    setIsUngrouping(true);
    const toastId = Math.random().toString(36).substring(7);
    setToasts((prev: ToastInfo[]) => [...prev, { id: toastId, message: `Ungrouping ${folder.name}...`, type: "loading" }]);

    try {
      const childrenPaths = groupChildren.map(c => c.path);
      const parts = folder.path.split("/").filter(Boolean);
      const targetParent = "/" + parts.slice(0, -1).join("/");

      // 乐观更新：移除组标题，子项由于路径更新会自动散开
      const originalFoldersMap = new Map<string, FolderInfo>();
      groupChildren.forEach(c => originalFoldersMap.set(c.path, { ...c }));

      setFolders(prev => prev.map(f => {
        if (childrenPaths.includes(f.path)) {
          // 关键修复：从路径提取文件名
          const fileName = f.path.split("/").filter(Boolean).pop() || f.path;
          const newPath = `${targetParent.endsWith("/") ? targetParent : targetParent + "/"}${fileName}`;
          const name = newPath.split("/").filter(Boolean).pop() || newPath;
          return {
            ...f,
            id: encodeURIComponent(newPath).replace(/%/g, "_"),
            path: newPath,
            name: formatStatusName(StatusPrefix.UNGROUPING, name)
          };
        }
        return f;
      }));

      const results = await api.moveBulk(childrenPaths, targetParent, settings.copyIncludeFiles, settings.operationMode);
      
      const succeeded = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      if (succeeded.length > 0) {
        setFolders(prev => prev.map(f => {
          const result = succeeded.find(r => {
            const fileName = r.path.split("/").filter(Boolean).pop() || r.path;
            const predictedPath = `${targetParent.endsWith("/") ? targetParent : targetParent + "/"}${fileName}`;
            return f.path === predictedPath;
          });
          if (result && result.newPath) {
            const newPath = result.newPath;
            const name = newPath.split("/").pop() || newPath;
            return { ...f, id: encodeURIComponent(newPath).replace(/%/g, "_"), path: newPath, name };
          }
          return f;
        }));
      }

      if (failed.length > 0) {
        setFolders(prev => prev.map(f => {
          for (const fr of failed) {
            const fileName = fr.path.split("/").filter(Boolean).pop() || fr.path;
            const predictedPath = `${targetParent.endsWith("/") ? targetParent : targetParent + "/"}${fileName}`;
            
            if (f.path === predictedPath) {
              const original = originalFoldersMap.get(fr.path);
              if (original) return original;
            }
          }
          return f;
        }));
        setToasts(prev => prev.map(t => t.id === toastId ? { ...t, message: "Partial ungroup failed", type: "error" } : t));
      } else {
        // 后端尝试删除空文件夹
        try {
          await api.deleteFolder(folder.path);
        } catch (e) {
          console.warn("Failed to delete empty group folder:", e);
        }
        setToasts(prev => prev.map(t => t.id === toastId ? { ...t, message: "Ungroup success", type: "success" } : t));
      }
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 2000);
    } catch (err) {
      console.error("Ungroup failed:", err);
    } finally {
      setIsUngrouping(false);
    }
  };

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

    if (!ideConfig.value) {
      alert("Please select a target IDE first");
      return;
    }

    try {
      await api.openInIDE(ideConfig.value, folder.path);
      // 更新最近使用时间
      const now = Date.now();
      if (isGroup && groupChildren) {
        setFolders(prev => prev.map(f => 
          groupChildren.some(child => child.path === f.path) ? { ...f, lastUsedAt: now } : f
        ));
      } else {
        setFolders(prev => prev.map(f => 
          f.path === folder.path ? { ...f, lastUsedAt: now } : f
        ));
      }
    } catch (err) {
      console.error(`Failed to open ${ideConfig.value}:`, err);
    }
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDuplicating) return;
    
    // 清除之前的定时器
    if (duplicateToastTimeoutRef.current) {
      clearTimeout(duplicateToastTimeoutRef.current);
      duplicateToastTimeoutRef.current = null;
    }
    
    setIsDuplicating(true);
    
    const toastId = Math.random().toString(36).substring(7);
    const tempId = `optimistic-${Math.random().toString(36).substring(7)}`;
    setToasts((prev: ToastInfo[]) => [...prev, { id: toastId, message: "Duplicating...", type: "loading" }]);

    // 乐观更新：使用临时 ID，并标记为正在预测路径
    const parts = folder.path.split("/").filter(Boolean);
    const parentDir = "/" + parts.slice(0, -1).join("/");
    // 关键修复：从路径提取 baseName 并确保无空格
    const rawName = parts.pop() || folder.name;
    const baseName = rawName.replace(/-\d+$/, "").trim().replace(/\s+/g, "_");
    
    setFolders((prev) => {
      // 仍然在前端做一个初步预测以提供即时反馈
      let counter = 1;
      let predictedPath = "";
      while (true) {
        const testPath = `${parentDir}/${baseName}-${counter}`;
        if (!prev.find((f) => f.path === testPath)) {
          predictedPath = testPath;
          break;
        }
        counter++;
      }

      const name = predictedPath.split("/").filter(Boolean).pop() || predictedPath;
      const newFolder = {
        id: tempId,
        name: formatStatusName(StatusPrefix.COPYING, name),
        path: predictedPath,
        branch: "predicting...",
        diffCount: 0,
        latestCommit: "",
        addedAt: Date.now(),
        lastUsedAt: 0,
      };
      return [...prev, newFolder];
    });

    try {
      const newPath = await api.duplicateFolder(folder.path, settings.copyIncludeFiles);
      
      // 使用 tempId 匹配，更新为后端返回的真实路径
      setFolders((prev) =>
        prev.map((f) =>
          f.id === tempId
            ? {
                ...f,
                id: encodeURIComponent(newPath).replace(/%/g, "_"),
                name: newPath.split("/").filter(Boolean).pop() || newPath,
                path: newPath,
                branch: "loading...",
              }
            : f
        )
      );

      // 获取 Git 信息
      try {
        const gitInfo = await api.watchFolder(newPath);
        const finalName = newPath.split("/").filter(Boolean).pop() || newPath;
        // 此时 id 已经更新为基于真实路径的值，使用路径匹配
        setFolders((prev) =>
          prev.map((f) => (f.path === newPath ? { ...f, ...gitInfo, name: finalName } : f))
        );
      } catch (watchErr) {
        console.error("Failed to watch folder:", watchErr);
      }

      setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Duplicate success", type: "success" } : t));
      
      // 设置定时器清除 toast
      duplicateToastTimeoutRef.current = setTimeout(() => {
        setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId));
        duplicateToastTimeoutRef.current = null;
      }, 2000);
    } catch (err: any) {
      console.error("Duplication failed:", err);
      // 回滚：通过 tempId 移除乐观添加的文件夹
      setFolders((prev) => prev.filter((f) => f.id !== tempId));
      setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: err.message || "Duplicate failed", type: "error" } : t));
      
      // 错误时也设置定时器清除 toast
      duplicateToastTimeoutRef.current = setTimeout(() => {
        setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId));
        duplicateToastTimeoutRef.current = null;
      }, 2000);
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;
    const confirmDelete = window.confirm(`Are you sure you want to permanently DELETE the folder at:\n${folder.path}?\n\nThis action cannot be undone.`);
    if (!confirmDelete) return;

    // 清除之前的定时器
    if (deleteToastTimeoutRef.current) {
      clearTimeout(deleteToastTimeoutRef.current);
      deleteToastTimeoutRef.current = null;
    }

    setIsDeleting(true);
    const toastId = Math.random().toString(36).substring(7);
    setToasts((prev: ToastInfo[]) => [...prev, { id: toastId, message: "Deleting...", type: "loading" }]);

    // 乐观更新：先保存要删除的文件夹数据，然后立即移除
    const deletedFolder = { ...folder };
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));

    try {
      await api.deleteFolder(folder.path);
      setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Delete success", type: "success" } : t));
      
      // 设置定时器清除 toast
      deleteToastTimeoutRef.current = setTimeout(() => {
        setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId));
        deleteToastTimeoutRef.current = null;
      }, 2000);
    } catch (err: any) {
      console.error("Deletion failed:", err);
      // 回滚：恢复被删除的文件夹
      setFolders((prev) => {
        if (prev.find((f) => f.id === deletedFolder.id)) return prev;
        return [...prev, deletedFolder];
      });
      setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: err.message || "Delete failed", type: "error" } : t));
      
      // 错误时也设置定时器清除 toast
      deleteToastTimeoutRef.current = setTimeout(() => {
        setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId));
        deleteToastTimeoutRef.current = null;
      }, 2000);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      onClick={isMultiSelect ? toggleSelection : undefined}
      className={`bg-zinc-50 border flex items-stretch relative overflow-hidden shadow-sm transition-all duration-300 ${
        isBackendConnected ? "border-zinc-300" : "border-red-200"
      } ${isSelected ? "ring-2 ring-zinc-700 ring-inset bg-zinc-100" : ""} ${isGroup ? "bg-zinc-100/50" : ""}`}
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
            <h3 className={`text-base font-bold tracking-tight truncate ${isBackendConnected ? "text-zinc-800" : "text-zinc-500"} ${isGroup ? "text-zinc-600 italic" : ""}`}>
              {folder.name}
              {isGroup && <span className="ml-2 text-[10px] font-black opacity-40 not-italic tracking-widest">[group]</span>}
            </h3>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isGroup && (
                <div className="flex items-center gap-1.5 bg-zinc-200/50 px-2 py-0.5 border border-zinc-200">
                  <span className="text-[11px] font-bold text-zinc-600">
                    {folder.branch || "no branch"}
                  </span>
                </div>
              )}

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
                    className={`px-2 py-0.5 border text-[9px] font-black tracking-widest transition-all ${
                      isDuplicating
                        ? "bg-zinc-100 text-zinc-400 border-zinc-200"
                        : "bg-zinc-200/50 text-zinc-500 border-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 hover:border-zinc-700 active:bg-zinc-800"
                    }`}
                  >
                    {isDuplicating ? "Dup..." : "Dup"}
                  </button>

                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className={`px-2 py-0.5 border text-[9px] font-black tracking-widest transition-all ${
                      isDeleting
                        ? "bg-zinc-100 text-zinc-400 border-zinc-200"
                        : "bg-zinc-200/50 text-zinc-500 border-zinc-200 hover:bg-red-600 hover:text-white hover:border-red-700 active:bg-red-700"
                    }`}
                  >
                    {isDeleting ? "Del..." : "Del"}
                  </button>

                  {isGroup && (
                    <button
                      onClick={handleUngroup}
                      disabled={isUngrouping}
                      className={`px-2 py-0.5 border text-[9px] font-black tracking-widest transition-all ${
                        isUngrouping
                          ? "bg-zinc-100 text-zinc-400 border-zinc-200"
                          : "bg-zinc-700 text-zinc-100 border-zinc-700 hover:bg-zinc-800"
                      }`}
                    >
                      {isUngrouping ? "Ungrouping..." : "Ungroup"}
                    </button>
                  )}
                </>
              )}
            </div>

            {!isGroup && folder.diffCount > 0 && isBackendConnected && (
              <div className="text-[10px] font-black text-amber-500 bg-zinc-700 px-2 py-0.5 border border-zinc-800 tracking-tighter shadow-sm">
                {folder.diffCount} diff
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-zinc-500">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <span className="truncate max-w-[300px] opacity-70">{folder.path}</span>
            </div>
            {!isGroup && folder.latestCommit && (
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
            : ideConfig.value 
              ? "bg-zinc-200/50 border-zinc-200 hover:bg-zinc-700 hover:border-zinc-800 active:bg-zinc-800" 
              : "bg-zinc-100 border-zinc-200 opacity-50"
        }`}
      >
        <div className={`transition-colors ${
          isMultiSelect
            ? "text-zinc-100"
            : ideConfig.value ? "text-zinc-400 group-hover/btn:text-zinc-100" : "text-zinc-300"
        }`}>
          {isMultiSelect ? (
            isSelected ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M3 6L5 8L9 4" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            ) : (
              <span className="text-[9px] font-black">add</span>
            )
          ) : ideConfig.value ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 1L10 6L3 11V1Z" />
            </svg>
          ) : (
            <span className="text-[10px] font-black tracking-[0.1em]">off</span>
          )}
        </div>
      </div>
    </div>
  );
};
