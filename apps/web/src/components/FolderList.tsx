import React, { useMemo, useState, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { nodesAtom, isConnectedAtom, sortByAtom, isMultiSelectModeAtom, selectedPathsAtom, toastsAtom, ToastInfo, settingsAtom, SortType, RegistryNode, LeafNode, GroupNode } from "../store/atoms";
import { FolderCard } from "./FolderCard";
import { api } from "../utils/api";
import { StatusPrefix, formatStatusName } from "../utils/status";

export const FolderList = () => {
  const [nodes, setNodes] = useAtom(nodesAtom);
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

  const sortedNodes = useMemo(() => {
    const result = [...nodes];
    
    const getTime = (node: RegistryNode) => {
      if (sortBy === "added") {
        return node.type === "group" 
          ? Math.max(node.addedAt, ...node.children.map(c => c.addedAt)) 
          : node.addedAt;
      }
      if (sortBy === "lastUsed") {
        return node.type === "group" 
          ? Math.max(node.lastUsedAt, ...node.children.map(c => c.lastUsedAt)) 
          : node.lastUsedAt;
      }
      return 0;
    };

    result.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      return getTime(b) - getTime(a);
    });

    return result;
  }, [nodes, sortBy]);

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
      // 检查是否所有选中的项目都在同一个父目录下
      const parentDirs = new Set(selectedPaths.map(p => {
        const parts = p.split("/").filter(Boolean);
        return "/" + parts.slice(0, -1).join("/");
      }));

      const allLeafs: LeafNode[] = [];
      nodes.forEach(node => {
        if (node.type === "leaf" && selectedPaths.includes(node.path)) {
          allLeafs.push(node);
        } else if (node.type === "group") {
          node.children.forEach(child => {
            if (selectedPaths.includes(child.path)) allLeafs.push(child);
          });
        }
      });

      if (parentDirs.size === 1) {
        // 场景 A：逻辑分组
        setNodes(prev => {
          const newNodes: RegistryNode[] = prev.filter(n => {
            if (n.type === "leaf") return !selectedPaths.includes(n.path);
            return true;
          }).map(n => {
            if (n.type === "group") {
              return { ...n, children: n.children.filter(c => !selectedPaths.includes(c.path)) };
            }
            return n;
          }).filter(n => n.type === "leaf" || n.children.length > 0);

          const newGroup: GroupNode = {
            type: "group",
            id: groupName,
            name: groupName,
            children: allLeafs,
            addedAt: Date.now(),
            lastUsedAt: Math.max(0, ...allLeafs.map(l => l.lastUsedAt))
          };
          return [...newNodes, newGroup];
        });

        setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Group created", type: "success" } : t));
        setTimeout(() => setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId)), 2000);
        setSelectedPaths([]);
        setIsMultiSelect(false);
        movingLock.current = false;
        setIsMoving(false);
        return;
      }

      // 场景 B：物理分组
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
      await performMove(selectedPaths, targetDir, toastId, "Grouping", groupName);
    } catch (err) {
      console.error("Grouping failed:", err);
      movingLock.current = false;
      setIsMoving(false);
    }
  };

  const performMove = async (paths: string[], targetParent: string, toastId: string, label: "Moving" | "Grouping", groupName?: string) => {
    const originalNodes = [...nodes];
    
    const findAndFlatten = (nodes: RegistryNode[]): LeafNode[] => {
      const leafs: LeafNode[] = [];
      nodes.forEach(n => {
        if (n.type === "leaf") leafs.push(n);
        else leafs.push(...n.children);
      });
      return leafs;
    };

    const movingLeafs = findAndFlatten(nodes).filter(l => paths.includes(l.path));

    // 乐观更新
    setNodes(prev => {
      // 1. 从原位置移除
      let newNodes = prev.map(n => {
        if (n.type === "leaf") return n;
        return { ...n, children: n.children.filter(c => !paths.includes(c.path)) };
      }).filter(n => n.type === "leaf" ? !paths.includes(n.path) : n.children.length > 0);

      // 2. 创建更新后的 leafs
      const updatedLeafs: LeafNode[] = movingLeafs.map(l => {
        const folderName = l.path.split("/").filter(Boolean).pop() || l.path;
        const cleanParent = targetParent.endsWith("/") ? targetParent.slice(0, -1) : targetParent;
        const predictedPath = `${cleanParent}/${folderName}`;
        const name = predictedPath.split("/").filter(Boolean).pop() || predictedPath;
        return {
          ...l,
          id: encodeURIComponent(predictedPath).replace(/%/g, "_"),
          path: predictedPath,
          name: formatStatusName(label === "Moving" ? StatusPrefix.MOVING : StatusPrefix.GROUPING, name),
        };
      });

      if (groupName) {
        const newGroup: GroupNode = {
          type: "group",
          id: groupName,
          name: groupName,
          children: updatedLeafs,
          addedAt: Date.now(),
          lastUsedAt: Math.max(0, ...updatedLeafs.map(l => l.lastUsedAt))
        };
        return [...newNodes, newGroup];
      } else {
        return [...newNodes, ...updatedLeafs];
      }
    });

    try {
      const results = await api.moveBulk(paths, targetParent, settings.copyIncludeFiles, settings.operationMode);
      const succeeded = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      if (failed.length > 0) {
        setNodes(originalNodes); // 简单回滚
        setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Partial operation failed", type: "error" } : t));
      } else {
        // 更新为真实路径
        setNodes(prev => prev.map(n => {
          if (n.type === "leaf") {
            const res = succeeded.find(r => encodeURIComponent(r.newPath!).replace(/%/g, "_") === n.id);
            if (res) return { ...n, path: res.newPath!, name: res.newPath!.split("/").pop()! };
            return n;
          } else {
            return {
              ...n,
              children: n.children.map(c => {
                const res = succeeded.find(r => encodeURIComponent(r.newPath!).replace(/%/g, "_") === c.id);
                if (res) return { ...c, path: res.newPath!, name: res.newPath!.split("/").pop()! };
                return c;
              })
            };
          }
        }));
        setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Success", type: "success" } : t));
      }
    } catch (err) {
      setNodes(originalNodes);
      setToasts((prev: ToastInfo[]) => prev.map(t => t.id === toastId ? { ...t, message: "Operation failed", type: "error" } : t));
    } finally {
      setTimeout(() => setToasts((prev: ToastInfo[]) => prev.filter(t => t.id !== toastId)), 2000);
      paths.forEach(p => api.watchFolder(p).catch(() => {}));
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
            <span className="bg-zinc-300 px-1 rounded-none text-zinc-600 font-mono">[{nodes.length}]</span>
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
                className="w-24 h-24 border-2 flex flex-col items-center justify-center transition-all bg-green-600 border-green-700 text-white shadow-[0_6px_0_0_#15803d,0_15px_30px_rgba(0,0,0,0.3)] hover:bg-green-500 active:shadow-none active:translate-y-[6px]"
              >
                <span className="text-[24px] font-black mb-1">{selectedPaths.length}</span>
                <span className="text-[10px] font-black">Move</span>
              </button>
              <button
                onClick={handleGroup}
                disabled={isMoving}
                className="w-24 h-24 border-2 flex flex-col items-center justify-center transition-all bg-zinc-700 border-zinc-800 text-zinc-100 shadow-[0_6px_0_0_#3f3f46,0_15px_30px_rgba(0,0,0,0.3)] hover:bg-zinc-600 active:shadow-none active:translate-y-[6px]"
              >
                <span className="text-[24px] font-black mb-1">{selectedPaths.length}</span>
                <span className="text-[10px] font-black">Group</span>
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
                className="w-full bg-zinc-100 border border-zinc-300 px-2 py-1.5 text-xs font-mono"
              />
              <div className="flex gap-2">
                <button onClick={() => setIsNamingGroup(false)} className="flex-1 py-1 text-[9px] font-black bg-zinc-200">Cancel</button>
                <button onClick={submitGroup} className="flex-1 py-1 text-[9px] font-black bg-zinc-700 text-zinc-100">OK</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 pb-10">
        {sortedNodes.map((node) => (
          <div key={node.id} className="flex flex-col gap-1">
            {node.type === "group" ? (
              <>
                <FolderCard 
                  folder={{
                    type: "leaf",
                    id: node.id,
                    name: node.name,
                    path: node.id, // Group doesn't have a single path, use ID
                    branch: "",
                    diffCount: 0,
                    latestCommit: "",
                    addedAt: node.addedAt,
                    lastUsedAt: node.lastUsedAt
                  } as LeafNode}
                  isBackendConnected={isConnected}
                  isGroup={true}
                  groupChildren={node.children}
                />
                <div className="flex flex-col gap-1 pl-6 border-l-2 border-zinc-300 ml-4 py-1">
                  {node.children.map(child => (
                    <FolderCard key={child.id} folder={child} isBackendConnected={isConnected} />
                  ))}
                </div>
              </>
            ) : (
              <FolderCard folder={node} isBackendConnected={isConnected} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
