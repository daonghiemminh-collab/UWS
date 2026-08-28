import path from 'path';
import fs from 'fs';

/**
 * Robust workspace project root resolver across different execution directories
 */
export function getProjectRootDir(): string {
  let cur = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(cur, 'config')) && fs.existsSync(path.join(cur, 'storage'))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  if (fs.existsSync(path.resolve(process.cwd(), 'config'))) {
    return process.cwd();
  }
  return path.resolve(process.cwd(), '..');
}

export function getConfigFilePath(filename: string): string {
  const root = getProjectRootDir();
  const dir = path.join(root, 'config');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) { }
  }
  return path.join(dir, filename);
}

export function getStorageDirPath(subpath: string = ''): string {
  const root = getProjectRootDir();
  const target = path.join(root, 'storage', subpath);
  if (!fs.existsSync(target)) {
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch (e) { }
  }
  return target;
}
