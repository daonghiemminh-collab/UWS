export interface CpuMetrics {
  usagePercent: number;
  cores: number[];
  model: string;
}

export interface MemoryMetrics {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
}

export interface DiskMetrics {
  fs: string;
  totalBytes: number;
  usedBytes: number;
  usagePercent: number;
  mount: string;
}

export interface SystemMetrics {
  timestamp: number;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disks: DiskMetrics[];
  uptimeSeconds: number;
  platform: string;
}
