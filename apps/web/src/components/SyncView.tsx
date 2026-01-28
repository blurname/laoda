import React, { useState, useMemo } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { nodesAtom, managedFilesAtom, ManagedFile, LeafNode } from "../store/atoms";
import { api } from "../utils/api";

const ManagedFileCard: React.FC<{ file: ManagedFile }> = ({ file }) => {
  const setManagedFiles = useSetAtom(managedFilesAtom);
  const nodes = useAtomValue(nodesAtom);
  
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");

  const allLeafNodes = useMemo(() => {
    const leafs: LeafNode[] = [];
    nodes.forEach(n => {
      if (n.type === "leaf") leafs.push(n);
      else leafs.push(...n.children);
    });
    return leafs;
  }, [nodes]);

  // Auto-matching logic
  const getMatchedFolders = () => {
    if (!file.targetPattern) return [];
    try {
      const regex = new RegExp(`^${file.targetPattern}(-\\d+)?$`);
      return allLeafNodes.filter(f => regex.test(f.name));
    } catch {
      return [];
    }
  };

  const matchedFolders = getMatchedFolders();
  const isPatternValid = allLeafNodes.some(f => f.name.startsWith(file.targetPattern));

  const updateFile = (updates: Partial<ManagedFile>) => {
    setManagedFiles(prev => prev.map(f => 
      f.id === file.id ? { ...f, ...updates } : f
    ));
  };

  const handleRemove = () => {
    setManagedFiles(prev => prev.filter(f => f.id !== file.id));
  };

  const handleSync = async () => {
    if (matchedFolders.length === 0 || !file.filename || syncStatus === "syncing") return;
    
    setSyncStatus("syncing");
    try {
      await Promise.all(matchedFolders.map(folder => 
        api.writeFile(folder.path, file.filename, file.content)
      ));
      setSyncStatus("success");
      setTimeout(() => setSyncStatus("idle"), 2000);
    } catch (err) {
      console.error("Sync failed:", err);
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 3000);
    }
  };

  return (
    <div className="bg-zinc-50 border border-zinc-300 shadow-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-100 border-b border-zinc-300 px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <input
            value={file.filename}
            onChange={(e) => updateFile({ filename: e.target.value })}
            className={`bg-transparent font-bold text-zinc-800 focus:outline-none border-b px-1 text-sm transition-colors ${
              !file.filename ? "border-red-300" : "border-transparent focus:border-zinc-400"
            }`}
            placeholder="Filename (e.g. .env.local)"
          />
          <span className="text-[9px] text-zinc-400 font-bold bg-zinc-200 px-1.5 py-0.5">
            Root only
          </span>
        </div>
        <button 
          onClick={handleRemove}
          className="text-zinc-400 hover:text-red-500 text-[10px] font-black transition-colors"
        >
          Remove file
        </button>
      </div>

      <div className="flex items-stretch h-64">
        {/* Content Editor */}
        <div className="flex-1 flex flex-col border-r border-zinc-200">
          <textarea
            value={file.content}
            onChange={(e) => updateFile({ content: e.target.value })}
            className="flex-1 p-4 font-mono text-[11px] bg-zinc-50/50 focus:outline-none resize-none leading-relaxed text-zinc-700"
            placeholder="# Enter file content here..."
          />
        </div>

        {/* Association & Sync */}
        <div className="w-72 bg-zinc-100/30 flex flex-col">
          <div className="p-4 flex-1 overflow-auto">
            <label className="block text-[9px] font-black text-zinc-400 mb-2">
              Target folder match
            </label>
            <input
              value={file.targetPattern}
              onChange={(e) => updateFile({ targetPattern: e.target.value })}
              className={`w-full bg-zinc-50 border px-3 py-1.5 text-xs font-bold focus:outline-none transition-all ${
                file.targetPattern 
                  ? (isPatternValid ? "border-zinc-300 focus:border-zinc-500" : "border-red-300 focus:border-red-400")
                  : "border-zinc-200"
              }`}
              placeholder="Folder name prefix..."
            />
            
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black text-zinc-400">
                  Matched folders
                </span>
                <span className="bg-zinc-200 px-1 text-[10px] font-mono text-zinc-600">
                  {matchedFolders.length}
                </span>
              </div>
              <div className="space-y-1">
                {matchedFolders.map(folder => (
                  <div key={folder.id} className="text-[10px] font-mono text-zinc-500 truncate bg-zinc-200/50 px-2 py-1 border border-zinc-200">
                    {folder.name}
                  </div>
                ))}
                {file.targetPattern && matchedFolders.length === 0 && (
                  <div className="text-[9px] text-zinc-400 italic">No folders matched.</div>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-zinc-200 bg-zinc-100/50">
            <button
              onClick={handleSync}
              disabled={syncStatus !== "idle" || matchedFolders.length === 0 || !file.filename}
              className={`w-full py-2 text-[10px] font-black transition-all border ${
                syncStatus === "success"
                  ? "bg-green-600 text-white border-green-700 shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                  : syncStatus === "error"
                  ? "bg-red-600 text-white border-red-700 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                  : syncStatus === "syncing"
                  ? "bg-zinc-500 text-zinc-100 border-zinc-600"
                  : matchedFolders.length > 0 && file.filename
                  ? "bg-zinc-700 text-zinc-100 border-zinc-700 hover:bg-zinc-600 shadow-sm"
                  : "bg-zinc-200 text-zinc-400 border-zinc-300 opacity-50"
              }`}
            >
              {syncStatus === "syncing" ? "Syncing..." : 
               syncStatus === "success" ? "Sync complete" : 
               syncStatus === "error" ? "Sync failed" : 
               "Sync to all"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SyncView: React.FC = () => {
  const managedFiles = useAtomValue(managedFilesAtom);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[10px] font-black text-zinc-500 flex items-center gap-2">
          Managed configurations
          <span className="bg-zinc-300 px-1 rounded-none text-zinc-600 font-mono">[{managedFiles.length}]</span>
        </h2>
      </div>

      {managedFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-zinc-300 bg-zinc-50 text-zinc-400">
          <p className="text-[10px] font-bold">No managed files registered.</p>
          <p className="text-[9px] mt-2 opacity-70">Use the toolbar to create a new managed file.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 pb-10">
          {managedFiles.map((file) => (
            <ManagedFileCard key={file.id} file={file} />
          ))}
        </div>
      )}
    </div>
  );
};
