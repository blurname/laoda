import React from "react";
import { useAtomValue } from "jotai";
import { Toolbar } from "./components/Toolbar";
import { FolderList } from "./components/FolderList";
import { DataView } from "./components/DataView";
import { viewAtom, isConnectedAtom } from "./store/atoms";
import { useSocket } from "./hooks/useSocket";

function App() {
  const currentView = useAtomValue(viewAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  useSocket();

  return (
    <div className="h-screen bg-zinc-200 flex flex-col font-sans overflow-hidden">
      <Toolbar />
      <main className="flex-1 overflow-hidden p-4 max-w-5xl mx-auto w-full">
        {currentView === "list" ? (
          <div className="h-full overflow-auto pr-1">
            <FolderList />
          </div>
        ) : (
          <DataView />
        )}
      </main>
      <footer className="bg-zinc-100 border-t border-zinc-300 px-4 py-1.5 flex justify-between items-center shadow-[0_-1px_3px_rgba(0,0,0,0.05)] shrink-0">
        <div className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.3em]">
          Lead Project Manager // Kernel_v1.0.0
        </div>
        <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_4px_rgba(34,197,94,0.6)] ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          {isConnected ? "System_Kernel_Active" : "System_Kernel_Offline"}
        </div>
      </footer>
    </div>
  );
}

export default App;
