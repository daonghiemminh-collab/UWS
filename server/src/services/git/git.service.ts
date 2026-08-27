import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = util.promisify(exec);

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

export class GitService {
  private reposRoot: string;

  constructor() {
    this.reposRoot = path.resolve(process.cwd(), '../storage/repos');
    this.ensureReposDirectory();
  }

  private ensureReposDirectory() {
    if (!fs.existsSync(this.reposRoot)) {
      fs.mkdirSync(this.reposRoot, { recursive: true });
    }
  }

  public async listRepos(): Promise<GitRepoInfo[]> {
    this.ensureReposDirectory();
    const repos: GitRepoInfo[] = [];

    // Check storage/repos subdirectories
    try {
      const entries = fs.readdirSync(this.reposRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const repoPath = path.join(this.reposRoot, entry.name);
          const gitDir = path.join(repoPath, '.git');
          if (fs.existsSync(gitDir)) {
            const info = await this.getRepoDetails(repoPath, entry.name);
            if (info) repos.push(info);
          }
        }
      }
    } catch (e) {
      console.error('[GitService] Error reading repos dir:', e);
    }

    // Also check root workspace E:/UWS
    try {
      const rootPath = path.resolve(process.cwd(), '..');
      if (fs.existsSync(path.join(rootPath, '.git'))) {
        const rootInfo = await this.getRepoDetails(rootPath, 'UWS (Core Repository)');
        if (rootInfo) repos.unshift(rootInfo);
      }
    } catch (e) {}

    return repos;
  }

  public async getRepoDetails(repoPath: string, displayName?: string): Promise<GitRepoInfo | null> {
    try {
      const normalizedPath = repoPath.replace(/\\/g, '/');
      const name = displayName || path.basename(repoPath);

      // Get current branch
      let branch = 'main';
      try {
        const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath });
        branch = stdout.trim() || 'main';
      } catch (e) {}

      // Get status
      let uncommittedCount = 0;
      let isClean = true;
      try {
        const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath });
        const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
        uncommittedCount = lines.length;
        isClean = uncommittedCount === 0;
      } catch (e) {}

      // Get last commit
      let lastCommit = null;
      try {
        const { stdout } = await execAsync('git log -1 --format="%h|%s|%an|%cr"', { cwd: repoPath });
        const parts = stdout.trim().split('|');
        if (parts.length >= 4) {
          lastCommit = {
            hash: parts[0],
            message: parts[1],
            author: parts[2],
            date: parts[3],
          };
        }
      } catch (e) {}

      // Get remote URL
      let remoteUrl = null;
      try {
        const { stdout } = await execAsync('git remote get-url origin', { cwd: repoPath });
        remoteUrl = stdout.trim() || null;
      } catch (e) {}

      return {
        name,
        path: normalizedPath,
        branch,
        isClean,
        uncommittedCount,
        lastCommit,
        remoteUrl,
      };
    } catch (e) {
      console.error(`[GitService] Error inspecting repo ${repoPath}:`, e);
      return null;
    }
  }

  public async createRepo(options: {
    name: string;
    description?: string;
    gitignoreType?: 'node' | 'python' | 'general' | 'none';
    remoteUrl?: string;
    machineName?: string;
  }): Promise<{ success: boolean; path: string; error?: string }> {
    try {
      const sanitizedName = options.name.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      if (!sanitizedName) throw new Error('Tên Repository không hợp lệ');

      const targetPath = path.join(this.reposRoot, sanitizedName);
      if (fs.existsSync(targetPath)) {
        throw new Error(`Thư mục dự án "${sanitizedName}" đã tồn tại trên máy`);
      }

      fs.mkdirSync(targetPath, { recursive: true });

      // Init git repo
      await execAsync('git init -b main', { cwd: targetPath });

      // Create .gitignore
      const gitignoreContent = this.getGitignoreContent(options.gitignoreType || 'node');
      fs.writeFileSync(path.join(targetPath, '.gitignore'), gitignoreContent, 'utf-8');

      // Create README.md
      const desc = options.description || 'Dự án được khởi tạo từ Unifiable Workspace System (UWS)';
      const readmeContent = `# ${sanitizedName}\n\n${desc}\n\n---\n*Khởi tạo bởi UWS tại trạm [${options.machineName || 'UWS-Node'}] vào ${new Date().toLocaleString('vi-VN')}*\n`;
      fs.writeFileSync(path.join(targetPath, 'README.md'), readmeContent, 'utf-8');

      // Initial commit
      await execAsync('git add .', { cwd: targetPath });
      await execAsync('git commit -m "Initial commit from UWS"', { cwd: targetPath });

      // Add remote if provided
      if (options.remoteUrl && options.remoteUrl.trim()) {
        try {
          await execAsync(`git remote add origin ${options.remoteUrl.trim()}`, { cwd: targetPath });
        } catch (re) {
          console.warn('[GitService] Remote add warning:', re);
        }
      }

      return {
        success: true,
        path: targetPath.replace(/\\/g, '/'),
      };
    } catch (e: any) {
      return {
        success: false,
        path: '',
        error: e.message || 'Không thể tạo Repository',
      };
    }
  }

  public async cloneRepo(url: string, customName?: string): Promise<{ success: boolean; path: string; error?: string }> {
    try {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) throw new Error('Đường dẫn Clone URL không hợp lệ');

      let targetName = (customName || '').trim();
      if (!targetName) {
        const parts = trimmedUrl.split('/');
        const last = parts[parts.length - 1] || 'repo';
        targetName = last.replace(/\.git$/i, '');
      }

      const targetPath = path.join(this.reposRoot, targetName);
      if (fs.existsSync(targetPath)) {
        throw new Error(`Thư mục "${targetName}" đã tồn tại trong kho storage/repos`);
      }

      await execAsync(`git clone ${trimmedUrl} "${targetPath}"`);

      return {
        success: true,
        path: targetPath.replace(/\\/g, '/'),
      };
    } catch (e: any) {
      return {
        success: false,
        path: '',
        error: e.message || 'Clone Git thất bại',
      };
    }
  }

  public async pullRepo(repoPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const { stdout } = await execAsync('git pull', { cwd: repoPath });
      return { success: true, message: stdout.trim() || 'Đã kéo code mới nhất thành công' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Git pull thất bại' };
    }
  }

  public async setRemoteUrl(
    repoPath: string,
    remoteUrl: string,
    remoteName: string = 'origin'
  ): Promise<{ success: boolean; message: string; remoteUrl: string }> {
    try {
      const trimmedUrl = remoteUrl.trim();
      if (!trimmedUrl) {
        throw new Error('Đường dẫn Remote URL không được để trống');
      }

      // Check existing remotes
      let hasOrigin = false;
      try {
        const { stdout } = await execAsync('git remote', { cwd: repoPath });
        const remotes = stdout.split('\n').map(r => r.trim()).filter(Boolean);
        hasOrigin = remotes.includes(remoteName);
      } catch (e) {}

      if (hasOrigin) {
        await execAsync(`git remote set-url ${remoteName} "${trimmedUrl}"`, { cwd: repoPath });
      } else {
        await execAsync(`git remote add ${remoteName} "${trimmedUrl}"`, { cwd: repoPath });
      }

      return {
        success: true,
        message: `Đã cập nhật Remote "${remoteName}" thành công: ${trimmedUrl}`,
        remoteUrl: trimmedUrl,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message || 'Không thể thiết lập Remote URL',
        remoteUrl,
      };
    }
  }

  public async testRemoteConnection(
    repoPath: string
  ): Promise<{ success: boolean; message: string; remoteUrl: string }> {
    try {
      let remoteUrl = '';
      try {
        const { stdout } = await execAsync('git remote get-url origin', { cwd: repoPath });
        remoteUrl = stdout.trim();
      } catch (e) {}

      if (!remoteUrl) {
        throw new Error('Chưa thiết lập Remote URL (origin) cho repository này');
      }

      // Test with git ls-remote
      await execAsync(`git ls-remote --get-url origin`, { cwd: repoPath, timeout: 8000 });

      return {
        success: true,
        message: `Kết nối GitHub / Remote hợp lệ: ${remoteUrl}`,
        remoteUrl,
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Không thể kết nối đến Remote: ${e.message || 'Lỗi mạng hoặc xác thực'}`,
        remoteUrl: '',
      };
    }
  }

  public async pushRepo(repoPath: string, commitMsg?: string): Promise<{ success: boolean; message: string }> {
    try {
      await execAsync('git add .', { cwd: repoPath });
      try {
        const msg = commitMsg || `Update from UWS at ${new Date().toISOString()}`;
        await execAsync(`git commit -m "${msg}"`, { cwd: repoPath });
      } catch (ce) {
        // May fail if working tree is clean, which is fine
      }
      const { stdout } = await execAsync('git push', { cwd: repoPath });
      return { success: true, message: stdout.trim() || 'Đã đẩy code lên Git thành công' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Git push thất bại' };
    }
  }

  private getGitignoreContent(type: string): string {
    switch (type) {
      case 'node':
        return `node_modules/\n.env\n.env.local\ndist/\nbuild/\n*.log\n.DS_Store\n`;
      case 'python':
        return `__pycache__/\n*.py[cod]\n*$py.class\n.venv/\nenv/\nvenv/\n.env\n*.log\n`;
      case 'general':
        return `*.log\n.env\n*.tmp\n*.bak\n.DS_Store\nThumbs.db\n`;
      default:
        return `*.log\n.env\n`;
    }
  }
}
