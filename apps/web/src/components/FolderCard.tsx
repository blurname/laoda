import React, { useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { LeafNode, selectedIDEAtom, nodesAtom, isMultiSelectModeAtom, selectedPathsAtom, toastsAtom, ToastInfo, settingsAtom } from "../store/atoms";
import { api } from "../utils/api";
import { normalizePath, getNameFromPath, getNodeId, updateLeafNodes } from "../utils/nodes";

interface FolderCardProps {
  folder: LeafNode;
  isBackendConnected: boolean;
  isGroup?: boolean;
  groupChildren?: LeafNode[];
}

export const FolderCard: React.FC<FolderCardProps> = ({ folder, isBackendConnected, isGroup, groupChildren }) => {
  const ideConfig = useAtomValue(selectedIDEAtom);
  const settings = useAtomValue(settingsAtom);
  const setNodes = useSetAtom(nodesAtom);
  const isMultiSelect = useAtomValue(isMultiSelectModeAtom);
  const [selectedPaths, setSelectedPaths] = useAtom(selectedPathsAtom);
  const setToasts = useSetAtom(toastsAtom);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUngrouping, setIsUngrouping] = useState(false);

  const handleUngroup = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUngrouping || !groupChildren || groupChildren.length === 0) return;

    const confirm = window.confirm(`Ungroup "${folder.name}"?`);
    if (!confirm) return;

    setIsUngrouping(true);
    const toastId = Math.random().toString(36).substring(7);
    setToasts((prev: ToastInfo[]) => [...prev, { id: toastId, message: `Ungrouping ${folder.name}...`, type: "loading" }]);

    try {
      const childrenPaths = groupChildren.map(c => c.path);
      const groupPath = normalizePath(folder.path);
      
      // 计算目标路径：组文件夹的父目录
      const groupParts = groupPath.split("/").filter(Boolean);
      const targetParent = "/" + groupParts.slice(0, -1).join("/");

      // 执行物理移出
      const results = await api.moveBulk(childrenPaths, targetParent, settings.copyIncludeFiles, settings.operationMode);
      const succeeded = results.filter(r => r.success);
      
        if (succeeded.length === childrenPaths.length) {
          // 1. 物理移除组文件夹（因为它现在应该是空的）
          try {
            await api.deleteFolder(folder.path);
          } catch (e) {
            console.warn("Failed to delete group folder, it might not be empty:", e);
          }

          // 2. 更新前端状态
          setNodes(prev => {
            const movingLeafs: LeafNode[] = [];
            const filteredNodes = prev.filter(n => {
              if (n.type === "group" && n.id === folder.id) {
                movingLeafs.push(...n.children.map(c => {
                  const res = succeeded.find(s => normalizePath(s.path) === normalizePath(c.path));
                  const newPath = normalizePath(res?.newPath || c.path);
                  return {
                    ...c,
                    id: getNodeId(newPath),
                    path: newPath,
                    name: getNameFromPath(newPath)
                  };
                }));
                return false;
              }
              return true;
            });
            return [...filteredNodes, ...movingLeafs];
          });
          setToasts(prev => prev.map(t => t.id === toastId ? { ...t, message: "Ungroup success", type: "success" } : t));
        } else {
        setToasts(prev => prev.map(t => t.id === toastId ? { ...t, message: "Partial ungroup failed", type: "error" } : t));
      }
      setTimeout(() => setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId)), 2000);
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
      const now = Date.now();
      setNodes(prev => updateLeafNodes(prev, (leaf) => {
        if (normalizePath(leaf.path) === normalizePath(folder.path)) {
          return { ...leaf, lastUsedAt: now };
        }
        return leaf;
      }));
    } catch (err) {
      console.error(`Failed to open IDE:`, err);
    }
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDuplicating || isGroup) return;
    setIsDuplicating(true);
    const toastId = Math.random().toString(36).substring(7);
    setToasts((prev: ToastInfo[]) => [...prev, { id: toastId, message: "Duplicating...", type: "loading" }]);

    try {
      const newPathRaw = await api.duplicateFolder(folder.path, settings.copyIncludeFiles);
      const newPath = normalizePath(newPathRaw);
      const gitInfo = await api.watchFolder(newPath);
      const finalName = getNameFromPath(newPath);
      const newNode: LeafNode = {
        type: "leaf",
        id: getNodeId(newPath),
        path: newPath,
        name: finalName,
        ...gitInfo,
        addedAt: Date.now(),
        lastUsedAt: 0,
      };
      setNodes(prev => [...prev, newNode]);
      setToasts(prev => prev.map(t => t.id === toastId ? { ...t, message: "Duplicate success", type: "success" } : t));
    } catch (err: any) {
      setToasts(prev => prev.map(t => t.id === toastId ? { ...t, message: err.message || "Duplicate failed", type: "error" } : t));
    } finally {
      setIsDuplicating(false);
      setTimeout(() => setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId)), 2000);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting || isGroup) return;
    const confirmDelete = window.confirm(`Permanently DELETE ${folder.path}?`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    const toastId = Math.random().toString(36).substring(7);
    setToasts((prev: ToastInfo[]) => [...prev, { id: toastId, message: "Deleting...", type: "loading" }]);

    try {
      await api.deleteFolder(folder.path);
      setNodes(prev => prev.map(n => {
        if (n.type === "group") return { ...n, children: n.children.filter(c => c.id !== folder.id) };
        return n;
      }).filter(n => n.type === "leaf" ? n.id !== folder.id : n.children.length > 0));
      setToasts(prev => prev.map(t => t.id === toastId ? { ...t, message: "Delete success", type: "success" } : t));
    } catch (err: any) {
      setToasts(prev => prev.map(t => t.id === toastId ? { ...t, message: err.message || "Delete failed", type: "error" } : t));
    } finally {
      setIsDeleting(false);
      setTimeout(() => setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId)), 2000);
    }
  };

  return (
    <div
      onClick={isMultiSelect ? toggleSelection : undefined}
      className={`bg-zinc-50 border flex items-stretch relative overflow-hidden shadow-sm transition-all duration-300 ${
        isBackendConnected ? "border-zinc-300" : "border-red-200"
      } ${isSelected ? "ring-2 ring-zinc-700 ring-inset bg-zinc-100" : ""} ${isGroup ? "bg-zinc-100/50" : ""}`}
    >
      {isMultiSelect && !isGroup && (
        <div className="w-10 shrink-0 flex items-center justify-center border-r border-zinc-200 bg-zinc-100/50">
          <div className={`w-4 h-4 border-2 transition-all ${isSelected ? "bg-zinc-700 border-zinc-700" : "bg-white border-zinc-300"}`}>
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
            <h3 className={`text-base font-bold truncate ${isBackendConnected ? "text-zinc-800" : "text-zinc-500"} ${isGroup ? "text-zinc-600 italic" : ""}`}>
              {folder.name}
              {isGroup && <span className="ml-2 text-[10px] font-black opacity-40 not-italic">[group]</span>}
            </h3>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isGroup && (
                <div className="flex items-center gap-1.5 bg-zinc-200/50 px-2 py-0.5 border border-zinc-200">
                  <span className="text-[11px] font-bold text-zinc-600">{folder.branch || "no branch"}</span>
                </div>
              )}

              <div className={`flex items-center justify-center w-5 h-5 border transition-colors ${isBackendConnected ? "bg-zinc-700 border-zinc-800" : "bg-zinc-100 border-zinc-200"}`}>
                <div className={`w-1 h-1 rounded-full ${isBackendConnected ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.8)]" : "bg-zinc-300"}`} />
              </div>

              {!isMultiSelect && (
                <>
                  {!isGroup && (
                    <>
                      <button onClick={handleDuplicate} disabled={isDuplicating} className="px-2 py-0.5 border text-[9px] font-black bg-zinc-200/50 hover:bg-zinc-700 hover:text-white">Dup</button>
                      <button onClick={handleDelete} disabled={isDeleting} className="px-2 py-0.5 border text-[9px] font-black bg-zinc-200/50 hover:bg-red-600 hover:text-white">Del</button>
                    </>
                  )}
                  {isGroup && (
                    <button onClick={handleUngroup} disabled={isUngrouping} className="px-2 py-0.5 border text-[9px] font-black bg-zinc-700 text-zinc-100 hover:bg-zinc-800">Ungroup</button>
                  )}
                </>
              )}
            </div>

            {!isGroup && folder.diffCount > 0 && isBackendConnected && (
              <div className="text-[10px] font-black text-amber-500 bg-zinc-700 px-2 py-0.5 border border-zinc-800 shadow-sm">{folder.diffCount} diff</div>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-zinc-500">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <span className="truncate max-w-[300px] opacity-70">{isGroup ? "Physical Group" : folder.path}</span>
            </div>
            {!isGroup && folder.latestCommit && (
              <div className="flex items-center gap-1.5 text-[11px] truncate border-l border-zinc-300 pl-4">
                <span className="truncate italic opacity-70">{folder.latestCommit}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {!isGroup && (
        <div 
          onClick={(e) => { e.stopPropagation(); handleOpenIDE(); }}
          className={`w-14 shrink-0 flex items-center justify-center transition-all border-l select-none group/btn ${isMultiSelect ? (isSelected ? "bg-zinc-700 border-zinc-800" : "bg-zinc-200 border-zinc-300 hover:bg-zinc-300") : (ideConfig.value ? "bg-zinc-200/50 border-zinc-200 hover:bg-zinc-700 hover:border-zinc-800" : "bg-zinc-100 border-zinc-200 opacity-50")}`}
        >
          <div className={`transition-colors ${isMultiSelect ? "text-zinc-100" : (ideConfig.value ? "text-zinc-400 group-hover/btn:text-zinc-100" : "text-zinc-300")}`}>
            {isMultiSelect ? (isSelected ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 6L5 8L9 4" stroke="currentColor" strokeWidth="2" fill="none" /></svg> : <span className="text-[9px] font-black">add</span>) : (ideConfig.value ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1L10 6L3 11V1Z" /></svg> : <span className="text-[10px] font-black">off</span>)}
          </div>
        </div>
      )}
    </div>
  );
};
