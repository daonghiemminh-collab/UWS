import fs from 'fs';
import path from 'path';

export interface AutomationSlot {
  id: string;
  label: string;
  icon: string;
  command: string;
  description?: string;
}

export class AutomationService {
  private configPath: string;
  private slots: AutomationSlot[] = [];

  constructor() {
    this.configPath = path.resolve(process.cwd(), '../config/automation.json');
    this.loadSlots();
  }

  private loadSlots() {
    const defaultSlots: AutomationSlot[] = [
      {
        id: 'slot_1',
        label: '⚡ Git Quick Push',
        icon: '🚀',
        command: 'git add . && git commit -m "Auto-save from [{{MACHINE_NAME}}] at {{DATETIME}}" && git push',
        description: 'Tự động add toàn bộ file, commit kèm tên máy và push lên Git',
      },
      {
        id: 'slot_2',
        label: '📥 Git Pull Sync',
        icon: '📥',
        command: 'git pull',
        description: 'Kéo các cập nhật mới nhất từ Git về máy',
      },
      {
        id: 'slot_3',
        label: '📊 Git Status',
        icon: '🔍',
        command: 'git status',
        description: 'Kiểm tra nhanh trạng thái các file đã sửa đổi',
      },
      {
        id: 'slot_4',
        label: '🔨 NPM Build',
        icon: '📦',
        command: 'npm run build',
        description: 'Chạy lệnh build mã nguồn dự án',
      },
    ];

    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        this.slots = JSON.parse(data);
      } else {
        this.slots = defaultSlots;
        this.saveSlots(defaultSlots);
      }
    } catch (e) {
      this.slots = defaultSlots;
    }
  }

  public getSlots(): AutomationSlot[] {
    return this.slots;
  }

  public saveSlots(slots: AutomationSlot[]): AutomationSlot[] {
    this.slots = slots;
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(slots, null, 2), 'utf-8');
    } catch (e) {
      console.error('[AutomationService] Failed to save automation slots:', e);
    }
    return this.slots;
  }

  public compileCommand(
    commandTemplate: string,
    context: {
      machineName: string;
      userName?: string;
      customMessage?: string;
    }
  ): string {
    const now = new Date();
    const pad = (n: number) => (n < 10 ? '0' + n : n);

    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const dateTimeStr = `${dateStr} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let compiled = commandTemplate;
    compiled = compiled.replace(/\{\{MACHINE_NAME\}\}/g, context.machineName || 'UWS-Node');
    compiled = compiled.replace(/\{\{USER_NAME\}\}/g, context.userName || 'Dev');
    compiled = compiled.replace(/\{\{DATE\}\}/g, dateStr);
    compiled = compiled.replace(/\{\{TIME\}\}/g, timeStr);
    compiled = compiled.replace(/\{\{DATETIME\}\}/g, dateTimeStr);
    compiled = compiled.replace(/\{\{MESSAGE\}\}/g, context.customMessage || 'Automated commit');

    return compiled;
  }
}
