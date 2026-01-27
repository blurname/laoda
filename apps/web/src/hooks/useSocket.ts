import { useEffect, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { foldersAtom, isConnectedAtom } from "../store/atoms";
import { api } from "../utils/api";

// Simple global event registry for async operations
type Resolver = (data: any) => void;
const resolvers: Record<string, Resolver[]> = {
  FOLDER_PICKED: [],
  DUPLICATION_COMPLETE: [],
  DELETION_COMPLETE: [],
  MOVE_BULK_COMPLETE: [],
};

export const registerResolver = (type: keyof typeof resolvers, resolve: Resolver) => {
  resolvers[type].push(resolve);
};

export const useSocket = () => {
  const [folders, setFolders] = useAtom(foldersAtom);
  const setIsConnected = useSetAtom(isConnectedAtom);
  const foldersRef = useRef(folders);

  // Keep ref up to date for the socket closure/reconnect logic
  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timeoutId: any;

    const connect = () => {
      console.log("Connecting to WebSocket...");
      socket = new WebSocket(api.getWsUrl());

      socket.onopen = () => {
        console.log("WebSocket Connected");
        setIsConnected(true);
        // Sync existing folders with backend on connection
        if (foldersRef.current.length > 0) {
          api.watchBulk(foldersRef.current.map((f) => f.path))
            .catch((err) => console.error("Failed to sync folders:", err));
        }
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "UPDATE_FOLDERS") {
          setFolders((prev) => {
            const serverFolders = data.folders as any[];
            // If local is empty, sync from server directly
            if (prev.length === 0 && serverFolders.length > 0) {
              return serverFolders;
            }
            // Update existing ones
            return prev.map((local) => {
              const updated = serverFolders.find((s) => s.path === local.path);
              return updated ? { ...local, ...updated } : local;
            });
          });
        } else if (resolvers[data.type]) {
          // Resolve any pending requests for this type
          const typeResolvers = resolvers[data.type];
          while (typeResolvers.length > 0) {
            const resolve = typeResolvers.shift();
            if (resolve) resolve(data);
          }
        }
      };

      socket.onclose = () => {
        console.log("WebSocket Disconnected");
        setIsConnected(false);
        timeoutId = setTimeout(connect, 3000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      clearTimeout(timeoutId);
    };
  }, [setFolders, setIsConnected]);
};
