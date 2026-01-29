import React, { useMemo, useState, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  nodesAtom,
  isConnectedAtom,
  sortByAtom,
  isMultiSelectModeAtom,
  selectedPathsAtom,
  toastsAtom,
  ToastInfo,
  settingsAtom,
  SortType,
  RegistryNode,
  LeafNode,
  GroupNode,
} from "../store/atoms";
import { FolderCard } from "./FolderCard";
import { api } from "../utils/api";
import { StatusPrefix, formatStatusName } from "../utils/status";
import {
  normalizePath,
  getNameFromPath,
  getNodeId,
  flattenNodes,
  updateLeafNodes,
} from "../utils/nodes";

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
          ? Math.max(node.addedAt, ...node.children.map((c) => c.addedAt))
          : node.addedAt;
      }
      if (sortBy === "lastUsed") {
        return node.type === "group"
          ? Math.max(node.lastUsedAt, ...node.children.map((c) => c.lastUsedAt))
          : node.lastUsedAt;
      }
      return 0;
    };

    result.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return getTime(b) - getTime(a);
    });
    return result;
  }, [nodes, sortBy]);

  const canGroup = useMemo(() => {
    if (selectedPaths.length <= 1) return true;
    const cleanPaths = selectedPaths.map(normalizePath);
    const parentDirs = new Set(
      cleanPaths.map((p) => {
        const parts = p.split("/").filter(Boolean);
        return "/" + parts.slice(0, -1).join("/");
      }),
    );
    return parentDirs.size === 1;
  }, [selectedPaths]);

  const handleMoveBulk = async () => {
    if (selectedPaths.length === 0 || movingLock.current) return;
    movingLock.current = true;
    setIsMoving(true);
    const toastId = Math.random().toString(36).substring(7);
    setToasts((prev: ToastInfo[]) => [
      ...prev,
      { id: toastId, message: `Moving ${selectedPaths.length} items...`, type: "loading" },
    ]);

    try {
      const targetParent = await api.pickFolder();
      if (!targetParent) {
        setToasts((prev: ToastInfo[]) => prev.filter((t) => t.id !== toastId));
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
    setGroupNameInput("");
  };

  const submitGroup = async () => {
    let groupName = groupNameInput.trim().replace(/\s+/g, "_");
    if (!groupName) {
      setIsNamingGroup(false);
      return;
    }

    setIsNamingGroup(false);
    const toastId = Math.random().toString(36).substring(7);
    const cleanPaths = selectedPaths.map(normalizePath);

    // 计算共同父目录作为物理移动的目标
    const pathsParts = cleanPaths.map((p) => p.split("/").filter(Boolean));
    let commonParts: string[] = [];
    if (pathsParts.length > 0) {
      const minLen = Math.min(...pathsParts.map((p) => p.length));
      const first = pathsParts[0];
      for (let i = 0; i < minLen; i++) {
        const part = first[i];
        if (part && pathsParts.every((pp) => pp[i] === part)) commonParts.push(part);
        else break;
      }
    }

    let targetParent = "/" + commonParts.join("/");
    // 防止目标文件夹就是当前选中的文件夹之一（避免循环嵌套）
    if (selectedPaths.some((p) => normalizePath(p) === normalizePath(targetParent))) {
      targetParent = "/" + commonParts.slice(0, -1).join("/");
    }

    const targetDir = `${targetParent.endsWith("/") ? targetParent : targetParent + "/"}${groupName}`;

    movingLock.current = true;
    setIsMoving(true);
    setToasts((prev: ToastInfo[]) => [
      ...prev,
      { id: toastId, message: `Creating physical group ${groupName}...`, type: "loading" },
    ]);

    await performMove(selectedPaths, targetDir, toastId, "Grouping", groupName);
  };

  const performMove = async (
    paths: string[],
    targetParent: string,
    toastId: string,
    label: "Moving" | "Grouping",
    groupName?: string,
  ) => {
    const originalNodes = [...nodes];
    const cleanPaths = paths.map(normalizePath);
    const movingLeafs = flattenNodes(nodes).filter((l) =>
      cleanPaths.includes(normalizePath(l.path)),
    );

    setNodes((prev) => {
      // 1. 从原位置移除
      let newNodes = prev
        .map((n) => {
          if (n.type === "leaf") return n;
          return {
            ...n,
            children: n.children.filter((c) => !cleanPaths.includes(normalizePath(c.path))),
          };
        })
        .filter((n) =>
          n.type === "leaf" ? !cleanPaths.includes(normalizePath(n.path)) : n.children.length > 0,
        );

      // 2. 预测新路径
      const updatedLeafs: LeafNode[] = movingLeafs.map((l) => {
        const folderName = getNameFromPath(l.path);
        const cleanParent = normalizePath(targetParent);
        const predictedPath = `${cleanParent}/${folderName}`;
        return {
          ...l,
          id: getNodeId(predictedPath),
          path: predictedPath,
          name: formatStatusName(
            label === "Moving" ? StatusPrefix.MOVING : StatusPrefix.GROUPING,
            getNameFromPath(predictedPath),
          ),
        };
      });

      if (groupName) {
        const newGroup: GroupNode = {
          type: "group",
          id: getNodeId(targetParent),
          path: normalizePath(targetParent), // 明确存储物理路径
          name: groupName,
          children: updatedLeafs,
          addedAt: Date.now(),
          lastUsedAt: Math.max(0, ...updatedLeafs.map((l) => l.lastUsedAt)),
        };
        return [...newNodes, newGroup];
      } else {
        return [...newNodes, ...updatedLeafs];
      }
    });

    try {
      const results = await api.moveBulk(
        paths,
        targetParent,
        settings.copyIncludeFiles,
        settings.operationMode,
      );
      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (failed.length > 0) {
        setNodes(originalNodes);
        setToasts((prev: ToastInfo[]) =>
          prev.map((t) =>
            t.id === toastId ? { ...t, message: "Partial operation failed", type: "error" } : t,
          ),
        );
      } else {
        setNodes((prev) =>
          updateLeafNodes(prev, (leaf) => {
            const res = succeeded.find((r) => getNodeId(r.newPath!) === leaf.id);
            if (res) {
              const newPath = normalizePath(res.newPath!);
              return { ...leaf, path: newPath, name: getNameFromPath(newPath) };
            }
            return leaf;
          }),
        );
        setToasts((prev: ToastInfo[]) =>
          prev.map((t) => (t.id === toastId ? { ...t, message: "Success", type: "success" } : t)),
        );
      }
    } catch (err) {
      setNodes(originalNodes);
      setToasts((prev: ToastInfo[]) =>
        prev.map((t) =>
          t.id === toastId ? { ...t, message: "Operation failed", type: "error" } : t,
        ),
      );
    } finally {
      setTimeout(
        () => setToasts((prev: ToastInfo[]) => prev.filter((t) => t.id !== toastId)),
        2000,
      );
      paths.forEach((p) => api.watchFolder(p).catch(() => {}));
      setSelectedPaths([]);
      setIsMultiSelect(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 relative">
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className="text-[10px] font-black text-zinc-500 flex items-center gap-2">
          Disk projects list
          <span className="bg-zinc-300 px-1 rounded-none text-zinc-600 font-mono">
            [{nodes.length}]
          </span>
        </h2>
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
                <span className="text-[12px] font-black uppercase tracking-widest">Move</span>
              </button>
              <button
                onClick={handleGroup}
                disabled={isMoving || !canGroup}
                title={!canGroup ? "Only items in the same folder can be grouped" : `Group items`}
                className={`w-24 h-24 border-2 flex flex-col items-center justify-center transition-all 
                  ${
                    isMoving || !canGroup
                      ? "bg-zinc-400 border-zinc-500 text-zinc-200 cursor-default opacity-50"
                      : "bg-zinc-700 border-zinc-800 text-zinc-100 shadow-[0_6px_0_0_#3f3f46,0_15px_30px_rgba(0,0,0,0.3)] hover:bg-zinc-600 active:shadow-none active:translate-y-[6px]"
                  }`}
              >
                <span className="text-[12px] font-black uppercase tracking-widest">Group</span>
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
                <button
                  onClick={() => setIsNamingGroup(false)}
                  className="flex-1 py-1 text-[9px] font-black bg-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={submitGroup}
                  className="flex-1 py-1 text-[9px] font-black bg-zinc-700 text-zinc-100"
                >
                  OK
                </button>
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
                  folder={
                    {
                      type: "leaf",
                      id: node.id,
                      name: node.name,
                      path: node.path, // 现在直接使用 node.path
                      branch: "",
                      diffCount: 0,
                      latestCommit: "",
                      addedAt: node.addedAt,
                      lastUsedAt: node.lastUsedAt,
                    } as LeafNode
                  }
                  isBackendConnected={isConnected}
                  isGroup={true}
                  groupChildren={node.children}
                />
                <div className="flex flex-col gap-1 pl-6 border-l-2 border-zinc-300 ml-4 py-1">
                  {node.children.map((child) => (
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
