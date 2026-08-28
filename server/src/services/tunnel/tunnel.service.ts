import { spawn, ChildProcess } from 'child_process';
import QRCode from 'qrcode';
import { createRequire } from 'module';
import { TunnelInfo } from '@uws/shared/types/protocol.js';

const require = createRequire(import.meta.url);

export class TunnelService {
  private active: boolean = false;
  private provider: 'cloudflare' | 'localtunnel' | 'none' = 'none';
  private publicUrl: string | null = null;
  private qrDataUrl: string | null = null;
  private securityPin: string = '';
  private process: ChildProcess | null = null;
  private guestCount: number = 0;
  private lastError?: string;

  constructor() {
    this.securityPin = this.generateRandomPin();
  }

  public generateRandomPin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  public getStatus(): TunnelInfo {
    return {
      active: this.active,
      provider: this.provider,
      url: this.publicUrl,
      qrDataUrl: this.qrDataUrl,
      securityPin: this.securityPin,
      error: this.lastError,
      connectedGuestsCount: this.guestCount,
    };
  }

  public setPin(pin: string): string {
    const trimmed = (pin || '').trim();
    if (trimmed.length >= 4) {
      this.securityPin = trimmed;
      if (this.publicUrl) {
        this.updateQrCode();
      }
    }
    return this.securityPin;
  }

  public regeneratePin(): string {
    this.securityPin = this.generateRandomPin();
    if (this.publicUrl) {
      this.updateQrCode();
    }
    return this.securityPin;
  }

  public verifyPin(pin: string): boolean {
    if (!this.securityPin) return true;
    return (pin || '').trim() === this.securityPin;
  }

  public async startTunnel(
    port: number = 4000,
    provider: 'cloudflare' | 'localtunnel' = 'cloudflare'
  ): Promise<TunnelInfo> {
    if (this.active && this.publicUrl) {
      return this.getStatus();
    }

    this.lastError = undefined;

    if (provider === 'cloudflare') {
      try {
        const info = await this.startCloudflareTunnel(port);
        return info;
      } catch (err: any) {
        console.warn('[TunnelService] Cloudflare tunnel failed, attempting localtunnel fallback...', err.message);
        return this.startLocaltunnel(port);
      }
    } else {
      return this.startLocaltunnel(port);
    }
  }

  private async startCloudflareTunnel(port: number): Promise<TunnelInfo> {
    return new Promise((resolve, reject) => {
      try {
        const cfModule = require('cloudflared');
        const binPath = cfModule.bin;

        if (!binPath) {
          throw new Error('cloudflared binary not found');
        }

        console.log(`[TunnelService] Spawning cloudflared for port ${port}...`);
        this.process = spawn(binPath, ['tunnel', '--url', `http://localhost:${port}`], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this.stopTunnel();
            reject(new Error('Cloudflare tunnel timeout (15s)'));
          }
        }, 15000);

        this.process.stderr?.on('data', async (data: Buffer) => {
          const text = data.toString();
          const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
          if (match && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            this.active = true;
            this.provider = 'cloudflare';
            this.publicUrl = match[0];
            await this.updateQrCode();
            console.log(`[TunnelService] 🌐 Cloudflare Tunnel Live: ${this.publicUrl}`);
            resolve(this.getStatus());
          }
        });

        this.process.on('error', (err) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            this.lastError = err.message;
            reject(err);
          }
        });

        this.process.on('exit', (code) => {
          console.log(`[TunnelService] cloudflared process exited with code ${code}`);
          this.active = false;
          this.provider = 'none';
          this.publicUrl = null;
          this.qrDataUrl = null;
          this.process = null;
        });
      } catch (err: any) {
        this.lastError = err.message;
        reject(err);
      }
    });
  }

  private async startLocaltunnel(port: number): Promise<TunnelInfo> {
    try {
      const localtunnel = require('localtunnel');
      console.log(`[TunnelService] Starting localtunnel for port ${port}...`);
      const tunnel = await localtunnel({ port });

      this.active = true;
      this.provider = 'localtunnel';
      this.publicUrl = tunnel.url;
      await this.updateQrCode();

      tunnel.on('close', () => {
        this.active = false;
        this.provider = 'none';
        this.publicUrl = null;
        this.qrDataUrl = null;
      });

      return this.getStatus();
    } catch (err: any) {
      this.lastError = err.message;
      throw err;
    }
  }

  public async stopTunnel(): Promise<TunnelInfo> {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch (e) {}
      this.process = null;
    }
    this.active = false;
    this.provider = 'none';
    this.publicUrl = null;
    this.qrDataUrl = null;
    return this.getStatus();
  }

  private async updateQrCode(): Promise<void> {
    if (!this.publicUrl) {
      this.qrDataUrl = null;
      return;
    }
    try {
      const connectUrl = `${this.publicUrl}?pin=${encodeURIComponent(this.securityPin)}`;
      this.qrDataUrl = await QRCode.toDataURL(connectUrl, {
        margin: 2,
        width: 220,
        color: {
          dark: '#58a6ff',
          light: '#0d1117',
        },
      });
    } catch (e) {
      console.error('[TunnelService] Error generating QR code:', e);
    }
  }

  public incrementGuestCount(): number {
    this.guestCount++;
    return this.guestCount;
  }

  public decrementGuestCount(): number {
    if (this.guestCount > 0) this.guestCount--;
    return this.guestCount;
  }
}

export const tunnelService = new TunnelService();
