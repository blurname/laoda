import React from "react";
import { useAtomValue } from "jotai";
import { Toolbar } from "./components/Toolbar";
import { FolderList } from "./components/FolderList";
import { DataView } from "./components/DataView";
import { SyncView } from "./components/SyncView";
import { viewAtom } from "./store/atoms";
import { useSocket } from "./hooks/useSocket";

function App() {
  const currentView = useAtomValue(viewAtom);
  useSocket();

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
    </div>
  );
}

export default App;
