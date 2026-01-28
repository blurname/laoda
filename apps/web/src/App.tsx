import React, { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Toolbar } from "./components/Toolbar";
import { FolderList } from "./components/FolderList";
import { DataView } from "./components/DataView";
import { SyncView } from "./components/SyncView";
import { ToastContainer } from "./components/Toast";
import { viewAtom, foldersAtom } from "./store/atoms";
import { useSocket } from "./hooks/useSocket";
import { stripStatusPrefix } from "./utils/status";

function App() {
  const currentView = useAtomValue(viewAtom);
  const setFolders = useSetAtom(foldersAtom);
  useSocket();

  // Cleanup: strip any optimistic status prefixes from folder names on mount
  useEffect(() => {
    setFolders((prev) =>
      prev.map((f) => ({
        ...f,
        name: stripStatusPrefix(f.name),
      }))
    );
  }, [setFolders]);

  return (
    <div className="h-screen bg-zinc-200 flex flex-col font-sans overflow-hidden">
      <Toolbar />
      <main className="flex-1 overflow-hidden p-4 max-w-5xl mx-auto w-full">
        {currentView === "list" ? (
          <div className="h-full overflow-auto pr-1">
            <FolderList />
          </div>
        ) : currentView === "data" ? (
          <DataView />
        ) : (
          <div className="h-full overflow-auto pr-1">
            <SyncView />
          </div>
        )}
      </main>
      <ToastContainer />
    </div>
  );
}

export default App;
