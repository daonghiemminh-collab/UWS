import { WebSocket } from 'ws';
import crypto from 'crypto';
import type { WorkspaceUser, WorkspaceMetadata, UserRole } from '@uws/shared/types/workspace.js';

export interface UserSession extends WorkspaceUser {
  ip: string;
  ws: WebSocket;
  workspaceId: string;
}

export interface WorkspaceRoom {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  hostUserId: string;
  currentEditorId: string | null;
  users: Map<string, UserSession>;
}

export class SessionService {
  private rooms: Map<string, WorkspaceRoom> = new Map();
  private wsToUserMap: Map<WebSocket, { userId: string; workspaceId: string }> = new Map();

  constructor() {
    this.getOrCreateRoom('default', 'E:/UWS');
  }

  public getOrCreateRoom(workspaceId: string = 'default', wsPath: string = 'E:/UWS'): WorkspaceRoom {
    let room = this.rooms.get(workspaceId);
    if (!room) {
      room = {
        id: workspaceId,
        name: `Workspace ${workspaceId}`,
        path: wsPath,
        createdAt: Date.now(),
        hostUserId: '',
        currentEditorId: null,
        users: new Map(),
      };
      this.rooms.set(workspaceId, room);
    }
    return room;
  }

  public joinRoom(
    ws: WebSocket,
    clientIp: string,
    requestedName?: string,
    workspaceId: string = 'default'
  ): { user: UserSession; room: WorkspaceRoom; isNewJoin: boolean } {
    const room = this.getOrCreateRoom(workspaceId);

    const existingEntry = this.wsToUserMap.get(ws);
    if (existingEntry && existingEntry.workspaceId === workspaceId) {
      const existingUser = room.users.get(existingEntry.userId);
      if (existingUser) {
        if (requestedName && requestedName !== existingUser.name) {
          existingUser.name = requestedName;
        }
        return { user: existingUser, room, isNewJoin: false };
      }
    }

    const userId = `usr_${crypto.randomBytes(4).toString('hex')}`;
    const isFirstUser = room.users.size === 0;
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';

    const isHost = isFirstUser || (isLocalhost && !room.hostUserId);
    const role: UserRole = isHost ? 'owner' : 'viewer';

    if (isHost && !room.hostUserId) {
      room.hostUserId = userId;
      room.currentEditorId = userId;
    }

    const defaultName = isHost
      ? 'Host'
      : `Guest-${userId.substring(4, 8).toUpperCase()}`;

    const userName = requestedName && requestedName.trim() ? requestedName.trim() : defaultName;

    const newUser: UserSession = {
      id: userId,
      name: userName,
      role,
      isHost,
      connectedAt: Date.now(),
      ip: clientIp,
      ws,
      workspaceId,
    };

    room.users.set(userId, newUser);
    this.wsToUserMap.set(ws, { userId, workspaceId });

    return { user: newUser, room, isNewJoin: true };
  }

  public leaveRoom(ws: WebSocket): { user: UserSession; room: WorkspaceRoom } | null {
    const entry = this.wsToUserMap.get(ws);
    if (!entry) return null;

    const { userId, workspaceId } = entry;
    const room = this.rooms.get(workspaceId);
    if (!room) return null;

    const user = room.users.get(userId);
    if (!user) return null;

    room.users.delete(userId);
    this.wsToUserMap.delete(ws);

    if (room.hostUserId === userId) {
      const remainingUsers = Array.from(room.users.values());
      if (remainingUsers.length > 0) {
        const nextHost = remainingUsers[0];
        nextHost.isHost = true;
        nextHost.role = 'owner';
        room.hostUserId = nextHost.id;
        if (room.currentEditorId === userId) {
          room.currentEditorId = nextHost.id;
        }
      } else {
        room.hostUserId = '';
        room.currentEditorId = null;
      }
    } else if (room.currentEditorId === userId) {
      room.currentEditorId = room.hostUserId || null;
    }

    return { user, room };
  }

  public renameUser(ws: WebSocket, newName: string): { user: UserSession; room: WorkspaceRoom } | null {
    const entry = this.wsToUserMap.get(ws);
    if (!entry) return null;

    const { userId, workspaceId } = entry;
    const room = this.rooms.get(workspaceId);
    if (!room) return null;

    const user = room.users.get(userId);
    if (!user) return null;

    user.name = newName.trim() || user.name;
    return { user, room };
  }

  public getUserByWs(ws: WebSocket): UserSession | null {
    const entry = this.wsToUserMap.get(ws);
    if (!entry) return null;
    const room = this.rooms.get(entry.workspaceId);
    if (!room) return null;
    return room.users.get(entry.userId) || null;
  }

  public getUserById(userId: string, workspaceId: string = 'default'): UserSession | null {
    const room = this.rooms.get(workspaceId);
    if (!room) return null;
    return room.users.get(userId) || null;
  }

  public getActiveUsers(workspaceId: string = 'default'): WorkspaceUser[] {
    const room = this.rooms.get(workspaceId);
    if (!room) return [];
    return Array.from(room.users.values()).map((u) => ({
      id: u.id,
      name: u.name,
      role: u.id === room.currentEditorId ? (u.isHost ? 'owner' : 'editor') : (u.isHost ? 'owner' : 'viewer'),
      isHost: u.isHost,
      connectedAt: u.connectedAt,
    }));
  }

  public getRoomMetadata(workspaceId: string = 'default'): WorkspaceMetadata {
    const room = this.getOrCreateRoom(workspaceId);
    return {
      id: room.id,
      name: room.name,
      path: room.path,
      createdAt: room.createdAt,
      activeUsers: this.getActiveUsers(workspaceId),
      currentEditorId: room.currentEditorId,
    };
  }

  public canUserEdit(ws: WebSocket): boolean {
    const user = this.getUserByWs(ws);
    if (!user) return false;
    const room = this.rooms.get(user.workspaceId);
    if (!room) return false;

    // Host or Current Editor can edit
    return user.id === room.currentEditorId || user.isHost;
  }

  public grantEdit(
    targetUserId: string,
    workspaceId: string = 'default'
  ): { success: boolean; room: WorkspaceRoom; targetUser: UserSession | null } {
    const room = this.rooms.get(workspaceId);
    if (!room) return { success: false, room: null as any, targetUser: null };

    const targetUser = room.users.get(targetUserId);
    if (!targetUser) return { success: false, room, targetUser: null };

    room.currentEditorId = targetUserId;

    // Update roles
    for (const u of room.users.values()) {
      if (u.id === targetUserId) {
        u.role = u.isHost ? 'owner' : 'editor';
      } else if (!u.isHost) {
        u.role = 'viewer';
      }
    }

    return { success: true, room, targetUser };
  }

  public revokeEdit(workspaceId: string = 'default'): { success: boolean; room: WorkspaceRoom } {
    const room = this.rooms.get(workspaceId);
    if (!room) return { success: false, room: null as any };

    room.currentEditorId = room.hostUserId;

    for (const u of room.users.values()) {
      if (u.id === room.hostUserId) {
        u.role = 'owner';
      } else {
        u.role = 'viewer';
      }
    }

    return { success: true, room };
  }

  public broadcastToRoom(workspaceId: string = 'default', message: any, excludeUserId?: string) {
    const room = this.rooms.get(workspaceId);
    if (!room) return;

    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    for (const [id, user] of room.users) {
      if (excludeUserId && id === excludeUserId) continue;
      if (user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(payload);
      }
    }
  }
}
