export type UserRole = 'owner' | 'editor' | 'viewer';

export interface WorkspaceUser {
  id: string;
  name: string;
  role: UserRole;
  isHost: boolean;
  connectedAt: number;
}

export interface WorkspaceMetadata {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  activeUsers: WorkspaceUser[];
  currentEditorId: string | null;
}

export interface FileItem {
  name: string;
  path: string; // Relative path inside workspace
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: number;
  extension: string;
  mimeType?: string;
}
