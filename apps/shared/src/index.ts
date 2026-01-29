/**
 * WebSocket Message Protocol for laoda
 */

export interface GitInfo {
  branch: string;
  diffCount: number;
  latestCommit: string;
}

export interface MoveResult {
  path: string;
  newPath?: string;
  success: boolean;
  error?: string;
}

export type ServerMessage =
  | {
      type: "DUPLICATION_COMPLETE";
      path: string;
      newPath: string;
      success: true;
    }
  | {
      type: "DUPLICATION_COMPLETE";
      path: string;
      success: false;
      error: string;
    }
  | {
      type: "DELETION_COMPLETE";
      path: string;
      success: boolean;
      error?: string;
    }
  | {
      type: "FOLDER_PICKED";
      path: string | null;
    }
  | ({
      type: "GIT_INFO_UPDATE";
      path: string;
    } & GitInfo)
  | {
      type: "MOVE_BULK_COMPLETE";
      results: MoveResult[];
    };

export type ServerMessageType = ServerMessage["type"];

// Helper to narrow types in resolvers
export type ServerMessagePayload<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;
