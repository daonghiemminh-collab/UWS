import fs from 'fs';
import path from 'path';
import os from 'os';
import si from 'systeminformation';

const CONFIG_PATH = path.resolve(process.cwd(), '../config/default.json');

export interface SystemMetrics {
  timestamp: number;
  machineName: string;
  os: string;
  gpu: string;
  cpuModel: string;
  cpuPercent: number;
  uptime: string;
  load: string;
  memory: {
    usedGB: number;
    totalGB: number;
    freeGB: number;
    usagePercent: number;
  };
  disks: Array<{
    mount: string;
    usedGB: number;
    totalGB: number;
    usagePercent: number;
  }>;
}

export class MetricsService {
  private machineName: string;
  private cachedGpu: string = 'Đang phát hiện...';

  constructor() {
    this.machineName = this.loadMachineName();
    this.detectGpu();
  }

  private async detectGpu(): Promise<void> {
    try {
      const graphics = await si.graphics();
      if (graphics.controllers && graphics.controllers.length > 0) {
        const dedicated = graphics.controllers.find(
          (c) => /nvidia|amd|radeon|geforce/i.test(c.vendor) || /nvidia|amd|radeon|geforce/i.test(c.model)
        );
        const target = dedicated || graphics.controllers[0];
        const vramStr = target.vram ? ` (${Math.round(target.vram / 1024 > 0 ? target.vram / 1024 : target.vram)} GB)` : '';
        this.cachedGpu = `${target.model || target.name || target.vendor}${vramStr}`;
      } else {
        this.cachedGpu = 'Standard Graphics';
      }
    } catch (e) {
      this.cachedGpu = 'N/A';
    }
  }

  public getMachineName(): string {
    return this.machineName;
  }

  public setMachineName(newName: string): string {
    const trimmed = newName.trim();
    if (!trimmed) return this.machineName;
    this.machineName = trimmed;
    this.saveMachineName(trimmed);
    return this.machineName;
  }

  private loadMachineName(): string {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (data.system?.customMachineName) {
          return data.system.customMachineName;
        }
      }
    } catch (e) {
      console.warn('[Metrics] Could not load custom machine name, using hostname.');
    }
    return os.hostname();
  }

  private saveMachineName(name: string): void {
    try {
      let data: any = {};
      if (fs.existsSync(CONFIG_PATH)) {
        data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
      if (!data.system) data.system = {};
      data.system.customMachineName = name;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Metrics] Failed to save custom machine name:', e);
    }
  }

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0 || d > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  }

  async collectMetrics(): Promise<SystemMetrics> {
    try {
      const [currentLoad, mem, fsSize, osInfo, cpuInfo] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.osInfo(),
        si.cpu(),
      ]);

      const cpuPercent = Math.round(currentLoad.currentLoad);
      
      // Calculate human-friendly Load string
      let loadStr = `${cpuPercent}%`;
      if (cpuPercent < 30) loadStr = `Thấp / Low (${cpuPercent}%)`;
      else if (cpuPercent < 75) loadStr = `Vừa / Med (${cpuPercent}%)`;
      else loadStr = `Cao / High (${cpuPercent}%)`;

      const usedMemGB = parseFloat((mem.used / (1024 ** 3)).toFixed(1));
      const totalMemGB = parseFloat((mem.total / (1024 ** 3)).toFixed(1));
      const freeMemGB = parseFloat((mem.free / (1024 ** 3)).toFixed(1));
      const ramPercent = Math.round((mem.used / mem.total) * 100);

      const disks = fsSize
        .filter((d) => d.size > 0)
        .map((d) => ({
          mount: d.mount,
          usedGB: parseFloat((d.used / (1024 ** 3)).toFixed(1)),
          totalGB: parseFloat((d.size / (1024 ** 3)).toFixed(1)),
          usagePercent: Math.round(d.use),
        }));

      const osFriendly = `${osInfo.distro} ${osInfo.release} (${osInfo.arch})`.replace(/Microsoft Windows/i, 'Windows');
      const cpuBrand = cpuInfo.brand || `${cpuInfo.manufacturer} ${cpuInfo.speed}GHz`;

      return {
        timestamp: Date.now(),
        machineName: this.machineName,
        os: osFriendly,
        gpu: this.cachedGpu,
        cpuModel: cpuBrand,
        cpuPercent,
        uptime: this.formatUptime(os.uptime()),
        load: loadStr,
        memory: {
          usedGB: usedMemGB,
          totalGB: totalMemGB,
          freeGB: freeMemGB,
          usagePercent: ramPercent,
        },
        disks,
      };
    } catch (err) {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      return {
        timestamp: Date.now(),
        machineName: this.machineName,
        os: `${os.type()} ${os.release()}`,
        gpu: this.cachedGpu,
        cpuModel: os.cpus()[0]?.model || 'Generic CPU',
        cpuPercent: 0,
        uptime: this.formatUptime(os.uptime()),
        load: 'Bình thường (Normal)',
        memory: {
          usedGB: parseFloat((usedMem / (1024 ** 3)).toFixed(1)),
          totalGB: parseFloat((totalMem / (1024 ** 3)).toFixed(1)),
          freeGB: parseFloat((freeMem / (1024 ** 3)).toFixed(1)),
          usagePercent: Math.round((usedMem / totalMem) * 100),
        },
        disks: [],
      };
    }
  }
}

