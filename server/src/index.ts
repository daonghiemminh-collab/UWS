import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { MetricsService } from './services/metrics/metrics.service.js';
import { TerminalService } from './services/terminal/terminal.service.js';
import { FileSystemService } from './services/filesystem/filesystem.service.js';
import { SessionService } from './services/session/session.service.js';
import { AutomationService } from './services/automation/automation.service.js';
import { GitService } from './services/git/git.service.js';
import type { ClientMessage, ServerMessage } from '@uws/shared/types/protocol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = Number(process.env.PORT) || 4000;
const metricsService = new MetricsService();
const terminalService = new TerminalService();
const fileSystemService = new FileSystemService();
const sessionService = new SessionService();
const automationService = new AutomationService();
const gitService = new GitService();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API for renaming machine
app.post('/api/machine/rename', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Invalid machine name' });
  }
  const updatedName = metricsService.setMachineName(name);
  broadcastMetrics();
  res.json({ success: true, machineName: updatedName });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    machineName: metricsService.getMachineName(),
    terminalsCount: terminalService.getAllSessions().length,
    activeUsers: sessionService.getActiveUsers(),
    automationSlotsCount: automationService.getSlots().length,
  });
});

app.get('/api/workspaces', (req, res) => {
  const workspacesRoot = path.resolve(process.cwd(), '../storage/workspaces');
  try {
    if (!fs.existsSync(workspacesRoot)) {
      fs.mkdirSync(workspacesRoot, { recursive: true });
    }
    const items = fs.readdirSync(workspacesRoot, { withFileTypes: true });
    const workspaces = items
      .filter((item) => item.isDirectory())
      .map((item) => ({
        id: item.name,
        name: item.name,
        path: path.join(workspacesRoot, item.name),
      }));
    res.json({ workspaces });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list workspaces' });
  }
});

// File download endpoint
app.get('/api/files/download', (req, res) => {
  const filePath = req.query.path as string | undefined;

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  try {
    const { fullPath, filename } = fileSystemService.getDownloadPath(filePath);
    res.download(fullPath, filename);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'File not found' });
  }
});

// Raw file stream endpoint (e.g. for image tags)
app.get('/api/files/raw', (req, res) => {
  const filePath = req.query.path as string | undefined;

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  try {
    const { fullPath } = fileSystemService.getDownloadPath(filePath);
    res.sendFile(fullPath);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'File not found' });
  }
});

const clients = new Set<WebSocket>();

async function broadcastMetrics() {
  if (clients.size === 0) return;
  try {
    const stats = await metricsService.collectMetrics();
    const payload = JSON.stringify({ type: 'metrics:update', data: stats });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  } catch (err) {
    console.error('[Broadcast Error]:', err);
  }
}

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress || '127.0.0.1';
  console.log(`[WebSocket] Client connected: ${clientIp}`);
  clients.add(ws);

  const clientTerminalSessions = new Set<string>();

  // Send immediate initial telemetry
  metricsService.collectMetrics().then((stats) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'metrics:update', data: stats }));
    }
  });

  const sendMsg = (msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  // Auto-join default room initially
  const isLocalClient = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
  const initialName = isLocalClient ? metricsService.getMachineName() : undefined;
  const { user: initialUser, room: initialRoom } = sessionService.joinRoom(ws, clientIp, initialName);

  sendMsg({
    type: 'session:joined',
    yourId: initialUser.id,
    yourRole: initialUser.role,
    isHost: initialUser.isHost,
    userName: initialUser.name,
    workspaceId: initialRoom.id,
    metadata: sessionService.getRoomMetadata(initialRoom.id),
  });

  // Send initial automation slots
  sendMsg({
    type: 'automation:slots',
    slots: automationService.getSlots(),
  });

  // Broadcast user list to room
  sessionService.broadcastToRoom(initialRoom.id, {
    type: 'session:users_update',
    activeUsers: sessionService.getActiveUsers(initialRoom.id),
    hostUserId: initialRoom.hostUserId,
    currentEditorId: initialRoom.currentEditorId,
  });

  sessionService.broadcastToRoom(
    initialRoom.id,
    {
      type: 'session:user_event',
      event: 'join',
      user: {
        id: initialUser.id,
        name: initialUser.name,
        role: initialUser.role,
        isHost: initialUser.isHost,
        connectedAt: initialUser.connectedAt,
      },
    },
    initialUser.id
  );

  ws.on('message', async (raw) => {
    try {
      const msg: ClientMessage = JSON.parse(raw.toString());
      const curUser = sessionService.getUserByWs(ws);
      const wsId = curUser?.workspaceId || 'default';

      // Permission Check Helper
      const checkWritePermission = (): boolean => {
        if (!sessionService.canUserEdit(ws)) {
          sendMsg({
            type: 'error',
            code: 'PERMISSION_DENIED',
            message: 'Bạn đang ở chế độ Chỉ Xem (Viewer). Hãy bấm nút "Xin Quyền" để thao tác.',
          });
          return false;
        }
        return true;
      };

      switch (msg.type) {
        // --- TURN-BASED PERMISSION LOCK & HOST CONTROL ---
        case 'session:claim_host': {
          if (!curUser) return;
          const room = sessionService.getOrCreateRoom(wsId);
          const isLocal = sessionService.isLocalOrHostIp(curUser.ip);
          const hostExists = room.hostUserId && room.users.has(room.hostUserId);

          if (isLocal || !hostExists || room.users.size <= 1 || curUser.isHost) {
            curUser.isHost = true;
            curUser.role = 'owner';
            room.hostUserId = curUser.id;
            room.currentEditorId = curUser.id;

            sendMsg({
              type: 'session:joined',
              yourId: curUser.id,
              yourRole: curUser.role,
              isHost: true,
              userName: curUser.name,
              workspaceId: room.id,
              metadata: sessionService.getRoomMetadata(room.id),
            });

            sessionService.broadcastToRoom(wsId, {
              type: 'session:edit_granted',
              editorId: curUser.id,
              editorName: curUser.name,
            });

            sessionService.broadcastToRoom(wsId, {
              type: 'session:users_update',
              activeUsers: sessionService.getActiveUsers(wsId),
              hostUserId: room.hostUserId,
              currentEditorId: room.currentEditorId,
            });
          }
          break;
        }

        case 'session:request_edit': {
          if (!curUser) return;
          const room = sessionService.getOrCreateRoom(wsId);
          const isLocal = sessionService.isLocalOrHostIp(curUser.ip);
          const hostExists = room.hostUserId && room.users.has(room.hostUserId);

          // If local machine, or already editor/host, or host is not in room, or single user: grant instantly!
          if (isLocal || curUser.id === room.currentEditorId || curUser.isHost || !hostExists || room.users.size <= 1) {
            if (isLocal || !hostExists) {
              curUser.isHost = true;
              curUser.role = 'owner';
              room.hostUserId = curUser.id;
            } else {
              curUser.role = curUser.isHost ? 'owner' : 'editor';
            }
            room.currentEditorId = curUser.id;

            sessionService.broadcastToRoom(wsId, {
              type: 'session:edit_granted',
              editorId: curUser.id,
              editorName: curUser.name,
            });
            sessionService.broadcastToRoom(wsId, {
              type: 'session:users_update',
              activeUsers: sessionService.getActiveUsers(wsId),
              hostUserId: room.hostUserId,
              currentEditorId: room.currentEditorId,
            });
            return;
          }

          // Otherwise broadcast request to current editor/host
          sessionService.broadcastToRoom(wsId, {
            type: 'session:edit_requested',
            requesterId: curUser.id,
            requesterName: curUser.name,
          });
          break;
        }

        case 'session:grant_edit': {
          if (!curUser) return;
          const room = sessionService.getOrCreateRoom(wsId);
          // Only Host or current Editor can grant edit
          if (curUser.isHost || curUser.id === room.currentEditorId) {
            const res = sessionService.grantEdit(msg.targetUserId, wsId);
            if (res.success && res.targetUser) {
              sessionService.broadcastToRoom(wsId, {
                type: 'session:edit_granted',
                editorId: res.targetUser.id,
                editorName: res.targetUser.name,
              });
              sessionService.broadcastToRoom(wsId, {
                type: 'session:users_update',
                activeUsers: sessionService.getActiveUsers(wsId),
                hostUserId: room.hostUserId,
                currentEditorId: room.currentEditorId,
              });
            }
          }
          break;
        }

        case 'session:revoke_edit': {
          if (!curUser || !curUser.isHost) return;
          const res = sessionService.revokeEdit(wsId);
          if (res.success) {
            const hostUser = sessionService.getUserById(res.room.hostUserId, wsId);
            sessionService.broadcastToRoom(wsId, {
              type: 'session:edit_granted',
              editorId: res.room.hostUserId,
              editorName: hostUser?.name || 'Host',
            });
            sessionService.broadcastToRoom(wsId, {
              type: 'session:users_update',
              activeUsers: sessionService.getActiveUsers(wsId),
              hostUserId: res.room.hostUserId,
              currentEditorId: res.room.currentEditorId,
            });
          }
          break;
        }

        // --- GIT SERVICES ---
        case 'git:list': {
          const repos = await gitService.listRepos();
          sendMsg({
            type: 'git:list',
            repos,
          });
          break;
        }

        case 'git:create': {
          if (!checkWritePermission()) return;
          const machineName = metricsService.getMachineName();
          const res = await gitService.createRepo({
            name: msg.name,
            description: msg.description,
            gitignoreType: msg.gitignoreType,
            remoteUrl: msg.remoteUrl,
            machineName,
          });

          sendMsg({
            type: 'git:action_result',
            action: 'create',
            success: res.success,
            message: res.success ? `Đã tạo Repository "${msg.name}" thành công!` : (res.error || 'Tạo repo thất bại'),
            repoPath: res.path,
          });

          if (res.success) {
            const updatedRepos = await gitService.listRepos();
            sessionService.broadcastToRoom(wsId, {
              type: 'git:list',
              repos: updatedRepos,
            });
          }
          break;
        }

        case 'git:clone': {
          if (!checkWritePermission()) return;
          const res = await gitService.cloneRepo(msg.url, msg.name);
          sendMsg({
            type: 'git:action_result',
            action: 'clone',
            success: res.success,
            message: res.success ? `Đã Clone Repository về máy thành công!` : (res.error || 'Clone repo thất bại'),
            repoPath: res.path,
          });

          if (res.success) {
            const updatedRepos = await gitService.listRepos();
            sessionService.broadcastToRoom(wsId, {
              type: 'git:list',
              repos: updatedRepos,
            });
          }
          break;
        }

        case 'git:pull': {
          if (!checkWritePermission()) return;
          const res = await gitService.pullRepo(msg.repoPath);
          sendMsg({
            type: 'git:action_result',
            action: 'pull',
            success: res.success,
            message: res.message,
            repoPath: msg.repoPath,
          });
          if (res.success) {
            const updatedRepos = await gitService.listRepos();
            sendMsg({ type: 'git:list', repos: updatedRepos });
          }
          break;
        }

        case 'git:push': {
          if (!checkWritePermission()) return;
          const res = await gitService.pushRepo(msg.repoPath, msg.commitMessage);
          sendMsg({
            type: 'git:action_result',
            action: 'push',
            success: res.success,
            message: res.message,
            repoPath: msg.repoPath,
          });
          if (res.success) {
            const updatedRepos = await gitService.listRepos();
            sendMsg({ type: 'git:list', repos: updatedRepos });
          }
          break;
        }

        case 'git:set_remote': {
          if (!checkWritePermission()) return;
          const res = await gitService.setRemoteUrl(msg.repoPath, msg.remoteUrl, msg.remoteName || 'origin');
          sendMsg({
            type: 'git:action_result',
            action: 'set_remote',
            success: res.success,
            message: res.message,
            repoPath: msg.repoPath,
            remoteUrl: res.remoteUrl,
          });
          if (res.success) {
            const updatedRepos = await gitService.listRepos();
            sessionService.broadcastToRoom(wsId, {
              type: 'git:list',
              repos: updatedRepos,
            });
          }
          break;
        }

        case 'git:test_remote': {
          const res = await gitService.testRemoteConnection(msg.repoPath);
          sendMsg({
            type: 'git:action_result',
            action: 'test_remote',
            success: res.success,
            message: res.message,
            repoPath: msg.repoPath,
            remoteUrl: res.remoteUrl,
          });
          break;
        }

        // --- AUTOMATION SLOTS ---
        case 'automation:get_slots': {
          sendMsg({
            type: 'automation:slots',
            slots: automationService.getSlots(),
          });
          break;
        }

        case 'automation:save_slots': {
          if (!checkWritePermission()) return;
          if (Array.isArray(msg.slots)) {
            const updated = automationService.saveSlots(msg.slots);
            sessionService.broadcastToRoom(wsId, {
              type: 'automation:slots',
              slots: updated,
            });
          }
          break;
        }

        case 'automation:compile': {
          if (!checkWritePermission()) return;
          const slots = automationService.getSlots();
          const target = slots.find((s) => s.id === msg.slotId);
          if (target) {
            const machineName = metricsService.getMachineName();
            const compiled = automationService.compileCommand(target.command, {
              machineName,
              userName: curUser?.name,
              customMessage: msg.customMessage,
            });
            sendMsg({
              type: 'automation:compiled',
              slotId: target.id,
              command: compiled,
              label: target.label,
            });
          }
          break;
        }

        // --- SESSION / PRESENCE ---
        case 'session:join': {
          const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
          const defaultJoinName = isLocal ? (msg.userName || metricsService.getMachineName()) : msg.userName;
          const { user, room } = sessionService.joinRoom(ws, clientIp, defaultJoinName, msg.workspaceId || 'default');
          if (user.isHost && user.name) {
            metricsService.setMachineName(user.name);
          }
          sendMsg({
            type: 'session:joined',
            yourId: user.id,
            yourRole: user.role,
            isHost: user.isHost,
            userName: user.name,
            workspaceId: room.id,
            metadata: sessionService.getRoomMetadata(room.id),
          });
          sessionService.broadcastToRoom(room.id, {
            type: 'session:users_update',
            activeUsers: sessionService.getActiveUsers(room.id),
            hostUserId: room.hostUserId,
            currentEditorId: room.currentEditorId,
          });
          break;
        }

        case 'session:rename_user': {
          const res = sessionService.renameUser(ws, msg.userName);
          if (res) {
            if (res.user.isHost) {
              metricsService.setMachineName(res.user.name);
              broadcastMetrics();
            }
            sessionService.broadcastToRoom(res.room.id, {
              type: 'session:users_update',
              activeUsers: sessionService.getActiveUsers(res.room.id),
              hostUserId: res.room.hostUserId,
              currentEditorId: res.room.currentEditorId,
            });
            sessionService.broadcastToRoom(res.room.id, {
              type: 'session:user_event',
              event: 'rename',
              user: {
                id: res.user.id,
                name: res.user.name,
                role: res.user.role,
                isHost: res.user.isHost,
                connectedAt: res.user.connectedAt,
              },
            });
          }
          break;
        }

        case 'machine:rename': {
          if (typeof msg.name === 'string' && msg.name.trim()) {
            metricsService.setMachineName(msg.name.trim());
            broadcastMetrics();
            if (curUser && curUser.isHost) {
              sessionService.renameUser(ws, msg.name.trim());
              sessionService.broadcastToRoom(wsId, {
                type: 'session:users_update',
                activeUsers: sessionService.getActiveUsers(wsId),
                hostUserId: sessionService.getOrCreateRoom(wsId).hostUserId,
                currentEditorId: sessionService.getOrCreateRoom(wsId).currentEditorId,
              });
            }
          }
          break;
        }

        // --- TERMINAL SESSIONS ---
        case 'terminal:create': {
          const session = terminalService.createSession({
            workspaceId: msg.workspaceId || wsId,
            cwd: msg.cwd,
            cols: msg.cols,
            rows: msg.rows,
            shell: msg.shell,
            onData: (data) => {
              sessionService.broadcastToRoom(msg.workspaceId || wsId, {
                type: 'terminal:output',
                sessionId: session.sessionId,
                data,
              });
            },
            onExit: (exitCode) => {
              clientTerminalSessions.delete(session.sessionId);
              sessionService.broadcastToRoom(msg.workspaceId || wsId, {
                type: 'terminal:closed',
                sessionId: session.sessionId,
                exitCode: exitCode ?? 0,
              });
            },
          });

          clientTerminalSessions.add(session.sessionId);

          sessionService.broadcastToRoom(msg.workspaceId || wsId, {
            type: 'terminal:created',
            sessionId: session.sessionId,
            workspaceId: session.workspaceId,
            cwd: session.cwd,
            shell: session.shell,
          });
          break;
        }

        case 'terminal:input': {
          if (!checkWritePermission()) return;
          if (msg.sessionId && msg.data !== undefined) {
            terminalService.write(msg.sessionId, msg.data);
          }
          break;
        }

        case 'terminal:resize': {
          if (msg.sessionId && msg.cols && msg.rows) {
            terminalService.resize(msg.sessionId, msg.cols, msg.rows);
          }
          break;
        }

        case 'terminal:close': {
          if (!checkWritePermission()) return;
          if (msg.sessionId) {
            terminalService.closeSession(msg.sessionId);
            clientTerminalSessions.delete(msg.sessionId);
          }
          break;
        }

        // --- FILESYSTEM OPERATIONS ---
        case 'fs:list': {
          try {
            const res = await fileSystemService.listDirectory(msg.path || '');
            sendMsg({
              type: 'fs:list',
              path: res.currentPath,
              parentPath: res.parentPath,
              items: res.items,
              drives: res.drives,
              workspaceId: msg.workspaceId || wsId,
            });
          } catch (err: any) {
            sendMsg({
              type: 'fs:error',
              message: err.message || 'Failed to list directory',
              path: msg.path,
            });
          }
          break;
        }

        case 'fs:read': {
          try {
            const res = await fileSystemService.readFile(msg.path);
            sendMsg({
              type: 'fs:read',
              path: res.path,
              content: res.content,
              isBinary: res.isBinary,
              sizeBytes: res.sizeBytes,
              workspaceId: msg.workspaceId || wsId,
            });
          } catch (err: any) {
            sendMsg({
              type: 'fs:error',
              message: err.message || 'Failed to read file',
              path: msg.path,
            });
          }
          break;
        }

        case 'fs:write': {
          if (!checkWritePermission()) return;
          try {
            const res = await fileSystemService.writeFile(msg.path, msg.content);
            sessionService.broadcastToRoom(msg.workspaceId || wsId, {
              type: 'fs:saved',
              path: res.path,
              success: true,
              workspaceId: msg.workspaceId || wsId,
            });
          } catch (err: any) {
            sendMsg({
              type: 'fs:saved',
              path: msg.path,
              success: false,
              error: err.message,
              workspaceId: msg.workspaceId || wsId,
            });
          }
          break;
        }

        case 'fs:create': {
          if (!checkWritePermission()) return;
          try {
            const res = await fileSystemService.createItem(msg.path, !!msg.isDir);
            sessionService.broadcastToRoom(msg.workspaceId || wsId, {
              type: 'fs:created',
              path: res.path,
              success: true,
              workspaceId: msg.workspaceId || wsId,
            });
          } catch (err: any) {
            sendMsg({
              type: 'fs:created',
              path: msg.path,
              success: false,
              error: err.message,
              workspaceId: msg.workspaceId || wsId,
            });
          }
          break;
        }

        case 'fs:rename': {
          if (!checkWritePermission()) return;
          try {
            const res = await fileSystemService.renameItem(msg.oldPath, msg.newPath);
            sessionService.broadcastToRoom(msg.workspaceId || wsId, {
              type: 'fs:renamed',
              oldPath: res.oldPath,
              newPath: res.newPath,
              success: true,
              workspaceId: msg.workspaceId || wsId,
            });
          } catch (err: any) {
            sendMsg({
              type: 'fs:renamed',
              oldPath: msg.oldPath,
              newPath: msg.newPath,
              success: false,
              error: err.message,
              workspaceId: msg.workspaceId || wsId,
            });
          }
          break;
        }

        case 'fs:delete': {
          if (!checkWritePermission()) return;
          try {
            const res = await fileSystemService.deleteItem(msg.path);
            sessionService.broadcastToRoom(msg.workspaceId || wsId, {
              type: 'fs:deleted',
              path: res.path,
              success: true,
              workspaceId: msg.workspaceId || wsId,
            });
          } catch (err: any) {
            sendMsg({
              type: 'fs:deleted',
              path: msg.path,
              success: false,
              error: err.message,
              workspaceId: msg.workspaceId || wsId,
            });
          }
          break;
        }

        default:
          break;
      }
    } catch (e) {
      console.error('[WS Message Error]:', e);
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected: ${clientIp}`);
    clients.delete(ws);

    const leaveRes = sessionService.leaveRoom(ws);
    if (leaveRes) {
      sessionService.broadcastToRoom(leaveRes.room.id, {
        type: 'session:users_update',
        activeUsers: sessionService.getActiveUsers(leaveRes.room.id),
        hostUserId: leaveRes.room.hostUserId,
        currentEditorId: leaveRes.room.currentEditorId,
      });

      sessionService.broadcastToRoom(leaveRes.room.id, {
        type: 'session:user_event',
        event: 'leave',
        user: {
          id: leaveRes.user.id,
          name: leaveRes.user.name,
          role: leaveRes.user.role,
          isHost: leaveRes.user.isHost,
          connectedAt: leaveRes.user.connectedAt,
        },
      });
    }

    for (const sessionId of clientTerminalSessions) {
      terminalService.closeSession(sessionId);
    }
    clientTerminalSessions.clear();
  });
});

// Broadcast metrics every 1s
setInterval(broadcastMetrics, 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`⚡ UWS Master Daemon running on PORT ${PORT}`);
  console.log(`👉 Host Local:  http://localhost:${PORT}`);
  console.log(`👉 2nd Machine: http://192.168.1.6:${PORT}`);
  console.log('====================================================');
});

// Graceful shutdown
const handleExit = () => {
  console.log('[Server] Shutting down, cleaning up terminal sessions...');
  terminalService.closeAll();
  process.exit(0);
};

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);
