import { useEffect, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { foldersAtom, isConnectedAtom } from "../store/atoms";
import { api } from "../utils/api";

// Simple global event registry for async operations
type Resolver = (data: any) => boolean; // return true if handled and should be removed
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
        // Request Git info for existing folders from localStorage
        if (foldersRef.current.length > 0) {
          const paths = foldersRef.current.map((f) => f.path);
          api.watchBulk(paths)
            .then((gitInfoMap) => {
              // Update local folders with Git info from backend
              setFolders((prev) =>
                prev.map((folder) => {
                  const gitInfo = gitInfoMap[folder.path];
                  if (gitInfo) {
                    return { ...folder, ...gitInfo };
                  }
                  return folder;
                })
              );
            })
            .catch((err) => console.error("Failed to sync folders:", err));
        }
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "GIT_INFO_UPDATE") {
          // Update Git info for a specific path
          setFolders((prev) =>
            prev.map((folder) => {
              if (folder.path === data.path) {
                return {
                  ...folder,
                  branch: data.branch,
                  diffCount: data.diffCount,
                  latestCommit: data.latestCommit,
                };
              }
              return folder;
            })
          );
        } else if (resolvers[data.type]) {
          // Filter out resolvers that return true (handled)
          resolvers[data.type] = resolvers[data.type].filter(resolve => !resolve(data));
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
