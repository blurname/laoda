import { RegistryNode, LeafNode } from "../store/atoms";

/**
 * Normalizes a path by removing the trailing slash if it exists.
 */
export const normalizePath = (path: string): string => {
  return path.endsWith("/") ? path.slice(0, -1) : path;
};

/**
 * Extracts the folder name from a path.
 */
export const getNameFromPath = (path: string): string => {
  const cleanPath = normalizePath(path);
  return cleanPath.split("/").filter(Boolean).pop() || cleanPath;
};

/**
 * Generates a unique ID for a node based on its path.
 */
export const getNodeId = (path: string): string => {
  const cleanPath = normalizePath(path);
  return encodeURIComponent(cleanPath).replace(/%/g, "_");
};

/**
 * Decodes a path from a node ID.
 */
export const decodeNodeId = (id: string): string => {
  try {
    return decodeURIComponent(id.replace(/_/g, "%"));
  } catch (e) {
    return id;
  }
};

/**
 * Flattens a tree of nodes into a single array of LeafNodes.
 */
export const flattenNodes = (nodes: RegistryNode[]): LeafNode[] => {
  const leafs: LeafNode[] = [];
  nodes.forEach((node) => {
    if (node.type === "leaf") {
      leafs.push(node);
    } else {
      leafs.push(...node.children);
    }
  });
  return leafs;
};

/**
 * Maps over nodes and updates LeafNodes based on a predicate.
 */
export const updateLeafNodes = (
  nodes: RegistryNode[],
  updateFn: (leaf: LeafNode) => LeafNode,
): RegistryNode[] => {
  return nodes.map((node) => {
    if (node.type === "leaf") {
      return updateFn(node);
    }
    return {
      ...node,
      children: node.children.map(updateFn),
    };
  });
};

/**
 * Finds a LeafNode by its path.
 */
export const findLeafByPath = (nodes: RegistryNode[], path: string): LeafNode | undefined => {
  const cleanPath = normalizePath(path);
  for (const node of nodes) {
    if (node.type === "leaf" && normalizePath(node.path) === cleanPath) {
      return node;
    }
    if (node.type === "group") {
      const found = node.children.find((c) => normalizePath(c.path) === cleanPath);
      if (found) return found;
    }
  }
  return undefined;
};
