import React, { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Toolbar } from "./components/Toolbar";
import { FolderList } from "./components/FolderList";
import { DataView } from "./components/DataView";
import { SyncView } from "./components/SyncView";
import { ToastContainer } from "./components/Toast";
import { viewAtom, nodesAtom } from "./store/atoms";
import { useSocket } from "./hooks/useSocket";
import { stripStatusPrefix } from "./utils/status";
import { updateLeafNodes, normalizePath, decodeNodeId } from "./utils/nodes";

function App() {
  const currentView = useAtomValue(viewAtom);
  const setNodes = useSetAtom(nodesAtom);
  useSocket();

  // Cleanup: strip any optimistic status prefixes and trailing slashes from node names/paths on mount
  useEffect(() => {
    setNodes((prev) => prev.map(node => {
      if (node.type === "leaf") {
        return { 
          ...node, 
          path: normalizePath(node.path),
          name: stripStatusPrefix(node.name) 
        };
      } else {
        // Migrate old group nodes that missing 'path' field
        const path = node.path || decodeNodeId(node.id);
        return {
          ...node,
          path: normalizePath(path),
          children: node.children.map(leaf => ({
            ...leaf,
            path: normalizePath(leaf.path),
            name: stripStatusPrefix(leaf.name)
          }))
        };
      }
    }));
  }, [setNodes]);

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
