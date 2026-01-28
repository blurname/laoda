import { useEffect, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { nodesAtom, isConnectedAtom } from "../store/atoms";
import { api } from "../utils/api";
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

  // Keep ref up to date for the socket closure/reconnect logic
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
        // Request Git info for all leaf nodes
        const allPaths: string[] = [];
        nodesRef.current.forEach(node => {
          if (node.type === "leaf") {
            allPaths.push(node.path);
          } else {
            node.children.forEach(child => allPaths.push(child.path));
          }
        });

        if (allPaths.length > 0) {
          api.watchBulk(allPaths)
            .then((gitInfoMap) => {
              setNodes((prev) =>
                prev.map((node) => {
                  if (node.type === "leaf") {
                    const gitInfo = gitInfoMap[node.path];
                    return gitInfo ? { ...node, ...gitInfo } : node;
                  } else {
                    return {
                      ...node,
                      children: node.children.map(child => {
                        const gitInfo = gitInfoMap[child.path];
                        return gitInfo ? { ...child, ...gitInfo } : child;
                      })
                    };
                  }
                })
              );
            })
            .catch((err) => console.error("Failed to sync folders:", err));
        }
      };

      socket.onmessage = (event) => {
        const data: ServerMessage = JSON.parse(event.data);
        if (data.type === "GIT_INFO_UPDATE") {
          setNodes((prev) =>
            prev.map((node) => {
              if (node.type === "leaf") {
                if (node.path === data.path) {
                  return {
                    ...node,
                    branch: data.branch,
                    diffCount: data.diffCount,
                    latestCommit: data.latestCommit,
                  };
                }
                return node;
              } else {
                return {
                  ...node,
                  children: node.children.map(child => {
                    if (child.path === data.path) {
                      return {
                        ...child,
                        branch: data.branch,
                        diffCount: data.diffCount,
                        latestCommit: data.latestCommit,
                      };
                    }
                    return child;
                  })
                };
              }
            })
          );
        } else {
          const typeResolvers = resolvers[data.type];
          if (typeResolvers) {
            // Filter out resolvers that return true (handled)
            resolvers[data.type] = typeResolvers.filter(resolve => !resolve(data as any)) as any;
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
