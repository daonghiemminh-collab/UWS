import fs from 'fs';
import path from 'path';
import type { FileItem } from '@uws/shared/types/workspace.js';
import { getProjectRootDir } from '../../utils/paths.js';

export interface DriveInfo {
  name: string;
  path: string;
}

export class FileSystemService {
  private defaultRoot: string;

  constructor() {
    this.defaultRoot = getProjectRootDir();
  }

  public getAvailableDrives(): DriveInfo[] {
    const letters = ['C', 'D', 'E', 'F', 'G', 'H'];
    const drives: DriveInfo[] = [];

    for (const l of letters) {
      const drivePath = `${l}:/`;
      try {
        if (fs.existsSync(drivePath)) {
          drives.push({ name: `Ổ ${l}:`, path: drivePath });
        }
      } catch (e) { }
    }

    if (drives.length === 0) {
      drives.push({ name: 'Ổ C:', path: 'C:/' });
    }
    return drives;
  }

  public resolvePath(inputPath: string = ''): { fullPath: string; relDisplay: string; parentPath: string } {
    let clean = (inputPath || '').trim().replace(/\\/g, '/');

    let fullPath: string;

    // Check if absolute path (e.g. E:/..., C:/...)
    if (/^[a-zA-Z]:/i.test(clean)) {
      fullPath = path.resolve(clean);
    } else if (clean.startsWith('/')) {
      fullPath = path.resolve(this.defaultRoot, '.' + clean);
    } else if (clean.length > 0) {
      fullPath = path.resolve(this.defaultRoot, clean);
    } else {
      fullPath = this.defaultRoot;
    }

    const normalized = fullPath.replace(/\\/g, '/');
    const parent = path.dirname(fullPath).replace(/\\/g, '/');

    return {
      fullPath,
      relDisplay: normalized,
      parentPath: parent !== normalized ? parent : '',
    };
  }

  public async listDirectory(inputPath: string = ''): Promise<{ currentPath: string; parentPath: string; items: FileItem[]; drives: DriveInfo[] }> {
    const { fullPath, relDisplay, parentPath } = this.resolvePath(inputPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Đường dẫn không tồn tại: ${relDisplay}`);
    }

    const stat = await fs.promises.stat(fullPath);
    if (!stat.isDirectory()) {
      throw new Error(`Đường dẫn không phải là thư mục: ${relDisplay}`);
    }

    let dirents: fs.Dirent[] = [];
    try {
      dirents = await fs.promises.readdir(fullPath, { withFileTypes: true });
    } catch (e: any) {
      throw new Error(`Không có quyền truy cập thư mục: ${e.message}`);
    }

    const items: FileItem[] = [];

    for (const dirent of dirents) {
      // Ignore huge system directories or recycle bin if not permitted
      if (dirent.name.startsWith('$') || dirent.name === 'System Volume Information') {
        continue;
      }

      const itemFullPath = path.join(fullPath, dirent.name);
      let sizeBytes = 0;
      let modifiedAt = Date.now();
      let isDir = false;

      try {
        isDir = dirent.isDirectory();
        const itemStat = await fs.promises.stat(itemFullPath);
        sizeBytes = itemStat.size;
        modifiedAt = itemStat.mtimeMs;
      } catch (e) {
        // In case of symlink or permission issue
        isDir = dirent.isDirectory();
      }

      const ext = path.extname(dirent.name).toLowerCase();

      items.push({
        name: dirent.name,
        path: itemFullPath.replace(/\\/g, '/'),
        isDirectory: isDir,
        sizeBytes,
        modifiedAt,
        extension: ext,
      });
    }

    // Sort: directories first, then files alphabetically
    items.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      return a.isDirectory ? -1 : 1;
    });

    return {
      currentPath: relDisplay,
      parentPath,
      items,
      drives: this.getAvailableDrives(),
    };
  }

  public async readFile(inputPath: string = ''): Promise<{ path: string; content: string; isBinary: boolean; sizeBytes: number }> {
    const { fullPath, relDisplay } = this.resolvePath(inputPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Tệp tin không tồn tại: ${relDisplay}`);
    }

    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      throw new Error(`Không thể đọc thư mục dưới dạng tệp: ${relDisplay}`);
    }

    const ext = path.extname(fullPath).toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'];
    const isImage = imageExts.includes(ext);

    if (isImage) {
      const buffer = await fs.promises.readFile(fullPath);
      return {
        path: relDisplay,
        content: buffer.toString('base64'),
        isBinary: true,
        sizeBytes: stat.size,
      };
    }

    // Read as UTF-8 text
    const content = await fs.promises.readFile(fullPath, 'utf-8');
    return {
      path: relDisplay,
      content,
      isBinary: false,
      sizeBytes: stat.size,
    };
  }

  public async writeFile(inputPath: string = '', content: string = ''): Promise<{ path: string; success: boolean }> {
    const { fullPath, relDisplay } = this.resolvePath(inputPath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, content, 'utf-8');
    return { path: relDisplay, success: true };
  }

  public async createItem(inputPath: string = '', isDir: boolean = false): Promise<{ path: string; success: boolean }> {
    const { fullPath, relDisplay } = this.resolvePath(inputPath);

    if (isDir) {
      await fs.promises.mkdir(fullPath, { recursive: true });
    } else {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      if (!fs.existsSync(fullPath)) {
        await fs.promises.writeFile(fullPath, '', 'utf-8');
      }
    }

    return { path: relDisplay, success: true };
  }

  public async renameItem(oldInputPath: string = '', newInputPath: string = ''): Promise<{ oldPath: string; newPath: string; success: boolean }> {
    const { fullPath: oldFull, relDisplay: oldDisplay } = this.resolvePath(oldInputPath);
    const { fullPath: newFull, relDisplay: newDisplay } = this.resolvePath(newInputPath);

    if (!fs.existsSync(oldFull)) {
      throw new Error(`Không tìm thấy mục nguồn: ${oldDisplay}`);
    }

    await fs.promises.rename(oldFull, newFull);
    return { oldPath: oldDisplay, newPath: newDisplay, success: true };
  }

  public async deleteItem(inputPath: string = ''): Promise<{ path: string; success: boolean }> {
    const { fullPath, relDisplay } = this.resolvePath(inputPath);

    if (!fs.existsSync(fullPath)) {
      return { path: relDisplay, success: true };
    }

    await fs.promises.rm(fullPath, { recursive: true, force: true });
    return { path: relDisplay, success: true };
  }

  public getDownloadPath(inputPath: string = ''): { fullPath: string; filename: string } {
    const { fullPath } = this.resolvePath(inputPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error('Không tìm thấy tệp tin');
    }
    return {
      fullPath,
      filename: path.basename(fullPath),
    };
  }
}
