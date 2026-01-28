import React, { useState, useRef, useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { FolderInfo, selectedIDEAtom, foldersAtom, isMultiSelectModeAtom, selectedPathsAtom, toastsAtom, ToastInfo } from "../store/atoms";
import { api } from "../utils/api";

interface FolderCardProps {
  folder: FolderInfo;
  isBackendConnected: boolean;
  isGroup?: boolean;
}

export const FolderCard: React.FC<FolderCardProps> = ({ folder, isBackendConnected, isGroup }) => {
  const ideConfig = useAtomValue(selectedIDEAtom);
  const setFolders = useSetAtom(foldersAtom);
  const isMultiSelect = useAtomValue(isMultiSelectModeAtom);
  const [selectedPaths, setSelectedPaths] = useAtom(selectedPathsAtom);
  const setToasts = useSetAtom(toastsAtom);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const duplicateToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deleteToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (duplicateToastTimeoutRef.current) {
        clearTimeout(duplicateToastTimeoutRef.current);
      }
      if (deleteToastTimeoutRef.current) {
        clearTimeout(deleteToastTimeoutRef.current);
      }
    };
  }, []);

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
    const baseName = folder.name.replace(/^Copying: /, "").replace(/-\d+$/, "");
    
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
        name: `Copying: ${name}`,
        path: predictedPath,
        branch: "predicting...",
        diffCount: 0,
        latestCommit: "",
      };
      return [...prev, newFolder];
    });

    try {
      const newPath = await api.duplicateFolder(folder.path);
      
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
