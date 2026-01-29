import React, { useState, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  selectedIDEAtom,
  nodesAtom,
  viewAtom,
  managedFilesAtom,
  toastsAtom,
  ToastInfo,
  settingsAtom,
  LeafNode,
} from "../store/atoms";
import { api } from "../utils/api";
import {
  normalizePath,
  getNameFromPath,
  getNodeId,
  findLeafByPath,
  updateLeafNodes,
} from "../utils/nodes";
import { StatusPrefix, formatStatusName } from "../utils/status";

const SUPPORTED_IDES = ["Cursor", "VSCode", "Trae", "Qoder", "Antigravity"];

export const Toolbar = () => {
  const [isPicking, setIsPicking] = useState(false);
  const pickingLock = useRef(false);
  const [ideConfig, setIdeConfig] = useAtom(selectedIDEAtom);
  const [settings, setSettings] = useAtom(settingsAtom);
  const [showSettings, setShowSettings] = useState(false);
  const [currentView, setCurrentView] = useAtom(viewAtom);
  const setNodes = useSetAtom(nodesAtom);
  const setManagedFiles = useSetAtom(managedFilesAtom);
  const setToasts = useSetAtom(toastsAtom);

  const handleImport = async () => {
    if (pickingLock.current) return;
    pickingLock.current = true;
    setIsPicking(true);

    const toastId = Math.random().toString(36).substring(7);
    setToasts((prev: ToastInfo[]) => [
      ...prev,
      { id: toastId, message: "Importing project...", type: "loading" },
    ]);

    try {
      const rawPath = await api.pickFolder();
      if (!rawPath) {
        setToasts((prev: ToastInfo[]) => prev.filter((t) => t.id !== toastId));
        pickingLock.current = false;
        setIsPicking(false);
        return;
      }

      const path = normalizePath(rawPath);
      const name = getNameFromPath(path);
      const id = getNodeId(path);

      const newLeaf: LeafNode = {
        type: "leaf",
        id,
        name: formatStatusName(StatusPrefix.IMPORTING, name),
        path,
        branch: "loading...",
        diffCount: 0,
        latestCommit: "",
        addedAt: Date.now(),
        lastUsedAt: 0,
      };

      setNodes((prev) => {
        if (findLeafByPath(prev, path)) return prev;
        return [...prev, newLeaf];
      });

      try {
        const gitInfo = await api.watchFolder(path);
        const finalName = getNameFromPath(path);
        setNodes((prev) =>
          updateLeafNodes(prev, (leaf) => {
            if (normalizePath(leaf.path) === path) {
              return { ...leaf, ...gitInfo, name: finalName };
            }
            return leaf;
          }),
        );
      } catch (watchErr) {
        console.error("Failed to watch folder:", watchErr);
        setNodes((prev) =>
          prev
            .filter((n) => {
              if (n.type === "leaf") return normalizePath(n.path) !== path;
              return true;
            })
            .map((n) => {
              if (n.type === "group")
                return {
                  ...n,
                  children: n.children.filter((c) => normalizePath(c.path) !== path),
                };
              return n;
            })
            .filter((n) => n.type === "leaf" || n.children.length > 0),
        );
        throw watchErr;
      }

      setToasts((prev: ToastInfo[]) =>
        prev.map((t) =>
          t.id === toastId ? { ...t, message: "Import success", type: "success" } : t,
        ),
      );
    } catch (err) {
      console.error("Import failed:", err);
      setToasts((prev: ToastInfo[]) =>
        prev.map((t) => (t.id === toastId ? { ...t, message: "Import failed", type: "error" } : t)),
      );
    } finally {
      setTimeout(
        () => setToasts((prev: ToastInfo[]) => prev.filter((t) => t.id !== toastId)),
        2000,
      );
      pickingLock.current = false;
      setIsPicking(false);
    }
  };

  return (
    <header className="bg-zinc-100 border-b border-zinc-300 px-6 py-4 flex items-center justify-between relative z-10 shadow-sm shrink-0">
      <div className="flex items-center gap-10">
        <h1 className="text-xl font-bold text-zinc-900 italic">laoda_</h1>

        <div className="flex items-center gap-0 border border-zinc-200 bg-zinc-200/50">
          <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-bold text-zinc-500 border-r border-zinc-200">
            <span>IDE</span>
          </div>
          <div className="relative border-r border-zinc-200">
            <select
              value={ideConfig.type === "custom" ? "custom" : ideConfig.value}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "custom") {
                  setIdeConfig({
                    type: "custom",
                    value: ideConfig.type === "custom" ? ideConfig.value : "",
                  });
                } else {
                  setIdeConfig({ type: "preset", value: val });
                }
              }}
              className="appearance-none bg-transparent pr-10 pl-4 py-1.5 text-xs font-bold text-zinc-800 focus:outline-none cursor-default"
            >
              <option value="" disabled>
                Select...
              </option>
              {SUPPORTED_IDES.map((ide) => (
                <option key={ide} value={ide}>
                  {ide}
                </option>
              ))}
              <option disabled>──────────</option>
              <option value="custom">Custom</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
          {ideConfig.type === "custom" && (
            <input
              type="text"
              value={ideConfig.value}
              onChange={(e) => setIdeConfig({ type: "custom", value: e.target.value })}
              placeholder="vscode family"
              className="bg-transparent px-4 py-1.5 text-[10px] font-bold text-zinc-700 focus:outline-none w-36 placeholder:text-zinc-400 border-l border-zinc-200"
            />
          )}
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 border border-zinc-300 p-0.5 bg-zinc-200/30">
        <button
          onClick={() => setCurrentView("list")}
          className={`px-3 py-1 text-[9px] font-black transition-all ${currentView === "list" ? "bg-zinc-700 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"}`}
        >
          Terminal
        </button>
        <button
          onClick={() => setCurrentView("sync")}
          className={`px-3 py-1 text-[9px] font-black transition-all ${currentView === "sync" ? "bg-zinc-700 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"}`}
        >
          Sync
        </button>
        <button
          onClick={() => setCurrentView("data")}
          className={`px-3 py-1 text-[9px] font-black transition-all ${currentView === "data" ? "bg-zinc-700 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"}`}
        >
          Data
        </button>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`px-3 py-1.5 text-[10px] font-bold transition-all border ${showSettings ? "bg-zinc-700 text-zinc-100 border-zinc-700" : "bg-zinc-200 text-zinc-600 border-zinc-300 hover:bg-zinc-300"}`}
          >
            Settings
          </button>

          {showSettings && (
            <div className="absolute right-0 mt-2 w-72 bg-zinc-50 border border-zinc-300 shadow-xl p-4 z-[100]">
              <h4 className="text-[10px] font-black text-zinc-400 mb-3 border-b border-zinc-200 pb-1">
                Copy options
              </h4>
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-zinc-600">
                    Include files (one per line)
                  </label>
                  <textarea
                    value={settings.copyIncludeFiles.join("\n")}
                    onChange={(e) => {
                      const files = e.target.value
                        .split("\n")
                        .map((f) => f.trim())
                        .filter(Boolean);
                      setSettings((prev) => ({
                        ...prev,
                        copyIncludeFiles: files,
                      }));
                    }}
                    placeholder=".env.local"
                    className="w-full h-24 bg-zinc-100 border border-zinc-200 p-2 text-[10px] font-mono text-zinc-700 focus:outline-none focus:border-zinc-400 resize-none leading-relaxed"
                  />
                  <p className="text-[9px] text-zinc-400 italic">
                    Files listed here will be copied even if ignored by git.
                  </p>
                </div>

                <div className="pt-2 border-t border-zinc-200">
                  <label className="text-[10px] font-bold text-zinc-600 block mb-2">
                    Operation mode
                  </label>
                  <div className="flex border border-zinc-300">
                    <button
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          operationMode: "move",
                        }))
                      }
                      className={`flex-1 py-1 text-[9px] font-black transition-all ${settings.operationMode === "move" ? "bg-zinc-700 text-zinc-100" : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"}`}
                    >
                      Move
                    </button>
                    <button
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          operationMode: "copy",
                        }))
                      }
                      className={`flex-1 py-1 text-[9px] font-black transition-all ${settings.operationMode === "copy" ? "bg-zinc-700 text-zinc-100" : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"}`}
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-[9px] text-zinc-400 italic mt-1.5">
                    Move: renameSync (instant). Copy: selective git-based copy.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {currentView === "sync" ? (
          <button
            onClick={() => {
              const id = Math.random().toString(36).substring(7);
              setManagedFiles((prev) => [
                ...prev,
                { id, filename: "", content: "", targetPattern: "" },
              ]);
            }}
            className="bg-zinc-700 hover:bg-zinc-700/80 text-zinc-100 px-5 py-1.5 text-[10px] font-bold transition-all border border-zinc-700"
          >
            Create managed file
          </button>
        ) : (
          <button
            onClick={handleImport}
            disabled={isPicking}
            className="bg-zinc-700 hover:bg-zinc-700/80 disabled:bg-zinc-300 text-zinc-100 px-5 py-1.5 text-[10px] font-bold transition-all border border-zinc-700"
          >
            {isPicking ? "Processing..." : "Import project"}
          </button>
        )}
      </div>
    </header>
  );
};
