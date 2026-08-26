import { SystemMetrics } from './metrics.js';
import { FileItem, WorkspaceMetadata, WorkspaceUser, UserRole } from './workspace.js';

export interface DriveItem {
  name: string;
  path: string;
}

export interface AutomationSlot {
  id: string;
  label: string;
  icon: string;
  command: string;
  description?: string;
}

export interface GitRepoInfo {
  name: string;
  path: string;
  branch: string;
  isClean: boolean;
  uncommittedCount: number;
  lastCommit: {
    hash: string;
    message: string;
    author: string;
    date: string;
  } | null;
  remoteUrl: string | null;
}

// Client -> Server Messages
export type ClientMessage =
  | { type: 'terminal:input'; sessionId: string; data: string }
  | { type: 'terminal:resize'; sessionId: string; cols: number; rows: number }
  | { type: 'terminal:create'; workspaceId?: string; cwd?: string; cols?: number; rows?: number; shell?: string }
  | { type: 'terminal:close'; sessionId: string }
  | { type: 'machine:rename'; name: string }
  | { type: 'metrics:subscribe' }
  | { type: 'metrics:unsubscribe' }
  | { type: 'fs:list'; path?: string; workspaceId?: string }
  | { type: 'fs:read'; path: string; workspaceId?: string }
  | { type: 'fs:write'; path: string; content: string; workspaceId?: string }
  | { type: 'fs:create'; path: string; isDir?: boolean; workspaceId?: string }
  | { type: 'fs:rename'; oldPath: string; newPath: string; workspaceId?: string }
  | { type: 'fs:delete'; path: string; workspaceId?: string }
  | { type: 'session:join'; workspaceId?: string; userName?: string }
  | { type: 'session:leave'; workspaceId?: string }
  | { type: 'session:rename_user'; userName: string }
  | { type: 'session:request_edit'; workspaceId?: string }
  | { type: 'session:grant_edit'; targetUserId: string; workspaceId?: string }
  | { type: 'session:revoke_edit'; workspaceId?: string }
  | { type: 'automation:get_slots' }
  | { type: 'automation:save_slots'; slots: AutomationSlot[] }
  | { type: 'automation:compile'; slotId: string; customMessage?: string }
  | { type: 'git:list' }
  | { type: 'git:create'; name: string; description?: string; gitignoreType?: 'node' | 'python' | 'general' | 'none'; remoteUrl?: string }
  | { type: 'git:clone'; url: string; name?: string }
  | { type: 'git:pull'; repoPath: string }
  | { type: 'git:push'; repoPath: string; commitMessage?: string };

// Server -> Client Messages
export type ServerMessage =
  | { type: 'terminal:output'; sessionId: string; data: string }
  | { type: 'terminal:created'; sessionId: string; workspaceId?: string; cwd?: string; shell?: string }
  | { type: 'terminal:closed'; sessionId: string; exitCode?: number }
  | { type: 'terminal:active_list'; sessions: { sessionId: string; cwd?: string }[] }
  | { type: 'metrics:update'; data: any }
  | { type: 'fs:list'; path: string; parentPath?: string; items: FileItem[]; drives?: DriveItem[]; workspaceId?: string }
  | { type: 'fs:read'; path: string; content: string; isBinary?: boolean; sizeBytes?: number; workspaceId?: string }
  | { type: 'fs:saved'; path: string; success: boolean; error?: string; workspaceId?: string }
  | { type: 'fs:created'; path: string; success: boolean; error?: string; workspaceId?: string }
  | { type: 'fs:renamed'; oldPath: string; newPath: string; success: boolean; error?: string; workspaceId?: string }
  | { type: 'fs:deleted'; path: string; success: boolean; error?: string; workspaceId?: string }
  | { type: 'fs:error'; message: string; path?: string }
  | { type: 'session:joined'; yourId: string; yourRole: UserRole; isHost: boolean; userName: string; workspaceId: string; metadata: WorkspaceMetadata }
  | { type: 'session:users_update'; activeUsers: WorkspaceUser[]; hostUserId: string; currentEditorId: string | null }
  | { type: 'session:user_event'; event: 'join' | 'leave' | 'rename'; user: WorkspaceUser }
  | { type: 'session:state'; metadata: WorkspaceMetadata; yourRole: UserRole }
  | { type: 'session:edit_requested'; requesterId: string; requesterName: string }
  | { type: 'session:edit_granted'; editorId: string; editorName: string }
  | { type: 'session:edit_revoked' }
  | { type: 'automation:slots'; slots: AutomationSlot[] }
  | { type: 'automation:compiled'; slotId: string; command: string; label: string }
  | { type: 'git:list'; repos: GitRepoInfo[] }
  | { type: 'git:action_result'; action: 'create' | 'clone' | 'pull' | 'push'; success: boolean; message: string; repoPath?: string }
  | { type: 'error'; code: string; message: string };
