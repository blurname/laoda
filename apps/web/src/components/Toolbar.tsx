import React, { useState, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { selectedIDEAtom, foldersAtom, viewAtom, managedFilesAtom } from "../store/atoms";
import { api } from "../utils/api";

const SUPPORTED_IDES = [
  "Cursor",
  "VSCode",
  "Trae",
  "Qoder",
  "Antigravity",
  
];

export const Toolbar = () => {
  const [isPicking, setIsPicking] = useState(false);
  const pickingLock = useRef(false);
  const [selectedIDE, setSelectedIDE] = useAtom(selectedIDEAtom);
  const [currentView, setCurrentView] = useAtom(viewAtom);
  const setFolders = useSetAtom(foldersAtom);
  const setManagedFiles = useSetAtom(managedFilesAtom);

  const handleImport = async () => {
    if (pickingLock.current) return;
    pickingLock.current = true;
    setIsPicking(true);
    try {
      const path = await api.pickFolder();
      if (!path) {
        pickingLock.current = false;
        setIsPicking(false);
        return;
      }

      // Update local storage first to ensure UI is responsive and data is persistent
      const name = path.split("/").pop() || path;
      const id = btoa(path);
      const newFolder = {
        id,
        name,
        path,
        branch: "loading...",
        diffCount: 0,
        latestCommit: "",
      };

      setFolders((prev) => {
        if (prev.find((f) => f.path === path)) return prev;
        return [...prev, newFolder];
      });

      await api.watchFolder(path);
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      pickingLock.current = false;
      setIsPicking(false);
    }
  };

  return (
    <header className="bg-zinc-100 border-b border-zinc-300 px-6 py-4 flex items-center justify-between relative z-10 shadow-sm shrink-0">
      <div className="flex items-center gap-10">
        <h1 className="text-xl font-bold text-zinc-900 tracking-tighter uppercase italic">laoda_</h1>
        
        <div className="flex items-center gap-0 border border-zinc-200 bg-zinc-200/50">
          <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] border-r border-zinc-200">
            <span>IDE</span>
          </div>
          <div className="relative border-r border-zinc-200">
            <select
              value={SUPPORTED_IDES.includes(selectedIDE || "") ? selectedIDE || "" : ""}
              onChange={(e) => e.target.value && setSelectedIDE(e.target.value)}
              className="appearance-none bg-transparent pr-10 pl-4 py-1.5 text-xs font-bold text-zinc-800 focus:outline-none uppercase tracking-wide cursor-default"
            >
              <option value="" disabled>Select...</option>
              {SUPPORTED_IDES.map((ide) => (
                <option key={ide} value={ide}>
                  {ide}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
          <input
            type="text"
            value={selectedIDE || ""}
            onChange={(e) => setSelectedIDE(e.target.value || null)}
            placeholder="CUSTOM_IDE_NAME"
            className="bg-transparent px-4 py-1.5 text-[10px] font-bold text-zinc-700 focus:outline-none uppercase tracking-wider w-36 placeholder:text-zinc-400"
          />
        </div>
      </div>

      {/* Middle View Switcher */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 border border-zinc-300 p-0.5 bg-zinc-200/30">
        <button
          onClick={() => setCurrentView("list")}
          className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all ${
            currentView === "list" 
              ? "bg-zinc-700 text-zinc-100 shadow-sm" 
              : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
          }`}
        >
          Terminal
        </button>
        <button
          onClick={() => setCurrentView("sync")}
          className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all ${
            currentView === "sync" 
              ? "bg-zinc-700 text-zinc-100 shadow-sm" 
              : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
          }`}
        >
          Sync
        </button>
        <button
          onClick={() => setCurrentView("data")}
          className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all ${
            currentView === "data" 
              ? "bg-zinc-700 text-zinc-100 shadow-sm" 
              : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
          }`}
        >
          Data
        </button>
      </div>

      <div className="flex items-center gap-6">
        {currentView === "sync" ? (
          <button
            onClick={() => {
              const id = Math.random().toString(36).substring(7);
              setManagedFiles(prev => [...prev, {
                id,
                filename: "",
                content: "",
                targetPattern: ""
              }]);
            }}
            className="bg-zinc-700 hover:bg-zinc-700/80 text-zinc-100 px-5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] transition-all border border-zinc-700"
          >
            Create_Managed_File
          </button>
        ) : (
          <button
            onClick={handleImport}
            disabled={isPicking}
            className="bg-zinc-700 hover:bg-zinc-700/80 disabled:bg-zinc-300 text-zinc-100 px-5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] transition-all border border-zinc-700"
          >
            {isPicking ? "Processing..." : "Import_Project"}
          </button>
        )}
      </div>
    </header>
  );
};

