import { useEffect, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { nodesAtom, isConnectedAtom } from "../store/atoms";
import { api } from "../utils/api";
import { flattenNodes, updateLeafNodes, normalizePath } from "../utils/nodes";
import type { ServerMessage, ServerMessageType, ServerMessagePayload } from "@laoda/shared";

// Simple global event registry for async operations
type Resolver<T extends ServerMessageType = any> = (data: ServerMessagePayload<T>) => boolean;
const resolvers: Partial<Record<ServerMessageType, Resolver[]>> = {
  FOLDER_PICKED: [],
  DUPLICATION_COMPLETE: [],
  DELETION_COMPLETE: [],
  MOVE_BULK_COMPLETE: [],
};

export const registerResolver = <T extends ServerMessageType>(type: T, resolve: Resolver<T>) => {
  if (!resolvers[type]) resolvers[type] = [];
  resolvers[type]!.push(resolve as any);
};

export const useSocket = () => {
  const [nodes, setNodes] = useAtom(nodesAtom);
  const setIsConnected = useSetAtom(isConnectedAtom);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timeoutId: any;

    const connect = () => {
      console.log("Connecting to WebSocket...");
      socket = new WebSocket(api.getWsUrl());

      socket.onopen = () => {
        console.log("WebSocket Connected");
        setIsConnected(true);

        const allLeafs = flattenNodes(nodesRef.current);
        if (allLeafs.length > 0) {
          const paths = allLeafs.map((l) => l.path);
          api
            .watchBulk(paths)
            .then((gitInfoMap) => {
              setNodes((prev) =>
                updateLeafNodes(prev, (leaf) => {
                  const gitInfo = gitInfoMap[leaf.path];
                  return gitInfo ? { ...leaf, ...gitInfo } : leaf;
                }),
              );
            })
            .catch((err) => console.error("Failed to sync folders:", err));
        }
      };

      socket.onmessage = (event) => {
        const data: ServerMessage = JSON.parse(event.data);
        if (data.type === "GIT_INFO_UPDATE") {
          const cleanDataPath = normalizePath(data.path);
          setNodes((prev) =>
            updateLeafNodes(prev, (leaf) => {
              if (normalizePath(leaf.path) === cleanDataPath) {
                return {
                  ...leaf,
                  branch: data.branch,
                  diffCount: data.diffCount,
                  latestCommit: data.latestCommit,
                };
              }
              return leaf;
            }),
          );
        } else {
          const typeResolvers = resolvers[data.type];
          if (typeResolvers) {
            resolvers[data.type] = typeResolvers.filter((resolve) => !resolve(data as any)) as any;
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
  }, [setNodes, setIsConnected]);
};
