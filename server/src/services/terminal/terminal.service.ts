import fs from 'fs';
import path from 'path';
import pty, { type IPty } from 'node-pty';
import crypto from 'crypto';

export interface TerminalSessionOptions {
  workspaceId?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  shell?: string;
  onData?: (data: string) => void;
  onExit?: (exitCode: number, signal?: number) => void;
}

export interface TerminalSessionInfo {
  sessionId: string;
  workspaceId: string;
  cwd: string;
  shell: string;
  createdAt: number;
}

interface ActiveSession {
  info: TerminalSessionInfo;
  ptyProcess: IPty;
  dataListener?: { dispose: () => void };
  exitListener?: { dispose: () => void };
}

export class TerminalService {
  private sessions: Map<string, ActiveSession> = new Map();
  private defaultWorkspaceRoot: string;

  constructor() {
    // Workspace root defaults to storage/workspaces/default
    this.defaultWorkspaceRoot = path.resolve(process.cwd(), '../storage/workspaces/default');
    if (!fs.existsSync(this.defaultWorkspaceRoot)) {
      try {
        fs.mkdirSync(this.defaultWorkspaceRoot, { recursive: true });
      } catch (e) {
        console.error('[TerminalService] Failed to create default workspace directory:', e);
      }
    }
  }

  private resolveShell(requestedShell?: string): string {
    if (requestedShell && requestedShell.trim()) {
      return requestedShell.trim();
    }
    if (process.platform === 'win32') {
      // Prefer powershell.exe on Windows
      return process.env.SHELL || 'powershell.exe';
    }
    return process.env.SHELL || 'bash';
  }

  private resolveCwd(requestedCwd?: string): string {
    if (requestedCwd && fs.existsSync(requestedCwd)) {
      return requestedCwd;
    }
    if (fs.existsSync(this.defaultWorkspaceRoot)) {
      return this.defaultWorkspaceRoot;
    }
    return process.cwd();
  }

  public createSession(options: TerminalSessionOptions = {}): TerminalSessionInfo {
    const sessionId = `term_${crypto.randomUUID().slice(0, 8)}`;
    const workspaceId = options.workspaceId || 'default';
    const cwd = this.resolveCwd(options.cwd);
    const shell = this.resolveShell(options.shell);
    const cols = Math.max(10, options.cols || 100);
    const rows = Math.max(5, options.rows || 30);

    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    console.log(`[TerminalService] Spawning ${shell} in ${cwd} (cols: ${cols}, rows: ${rows}) [Session: ${sessionId}]`);

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
    });

    const sessionInfo: TerminalSessionInfo = {
      sessionId,
      workspaceId,
      cwd,
      shell,
      createdAt: Date.now(),
    };

    const dataListener = options.onData
      ? ptyProcess.onData((data) => {
          options.onData!(data);
        })
      : undefined;

    const exitListener = ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[TerminalService] Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      if (options.onExit) {
        options.onExit(exitCode, signal);
      }
      this.sessions.delete(sessionId);
    });

    this.sessions.set(sessionId, {
      info: sessionInfo,
      ptyProcess,
      dataListener,
      exitListener,
    });

    return sessionInfo;
  }

  public write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[TerminalService] Cannot write: Session ${sessionId} not found`);
      return false;
    }
    session.ptyProcess.write(data);
    return true;
  }

  public resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    const safeCols = Math.max(10, Math.floor(cols));
    const safeRows = Math.max(5, Math.floor(rows));
    try {
      session.ptyProcess.resize(safeCols, safeRows);
      return true;
    } catch (e) {
      console.error(`[TerminalService] Error resizing session ${sessionId}:`, e);
      return false;
    }
  }

  public closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      session.dataListener?.dispose();
      session.exitListener?.dispose();
      session.ptyProcess.kill();
    } catch (e) {
      console.error(`[TerminalService] Error killing session ${sessionId}:`, e);
    }

    this.sessions.delete(sessionId);
    console.log(`[TerminalService] Closed session ${sessionId}`);
    return true;
  }

  public getSession(sessionId: string): TerminalSessionInfo | undefined {
    return this.sessions.get(sessionId)?.info;
  }

  public getAllSessions(): TerminalSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.info);
  }

  public closeAll(): void {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.closeSession(sessionId);
    }
  }
}
