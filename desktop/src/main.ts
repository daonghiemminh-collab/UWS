import { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, shell, clipboard, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 4000;
const SERVER_URL = `http://localhost:${PORT}`;
const LOGO_PNG = path.resolve(__dirname, '../../assets/logo.png');
const LOGO_ICO = path.resolve(__dirname, '../../assets/icon.ico');
const APP_ICON = process.platform === 'win32' && fs.existsSync(LOGO_ICO) ? LOGO_ICO : LOGO_PNG;

// Set Application Identity for Windows Taskbar & Shell
app.setName('Meodusa');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.daonghiemminh.meodusa');
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;
let isQuitting = false;

// Check if server is already running
function checkServerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Start backend server daemon if needed
async function ensureServerRunning() {
  const running = await checkServerRunning();
  if (running) {
    console.log('[Desktop] Meodusa Server Daemon is already running on port 4000.');
    return;
  }

  console.log('[Desktop] Spawning Meodusa Server Daemon...');
  const serverDir = path.resolve(__dirname, '../../server');

  serverProcess = spawn('npx.cmd', ['tsx', 'src/index.ts'], {
    cwd: serverDir,
    shell: true,
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    console.error('[Desktop] Failed to spawn Meodusa server daemon:', err);
  });

  // Wait for server to become healthy
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await checkServerRunning()) {
      console.log('[Desktop] Meodusa Server Daemon is up and healthy!');
      return;
    }
  }
}

function createWindow() {
  const appIcon = nativeImage.createFromPath(APP_ICON);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    title: 'Meodusa',
    icon: APP_ICON,
    backgroundColor: '#090c10',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#090c10',
      symbolColor: '#f0f6fc',
      height: 38,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setIcon(appIcon);

  // Enable F5, Ctrl+F5, Ctrl+R, Ctrl+Shift+R reload and F12, Ctrl+Shift+I DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
        event.preventDefault();
        mainWindow?.webContents.reload();
      }
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        event.preventDefault();
        mainWindow?.webContents.toggleDevTools();
      }
    }
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: 'Meodusa đang chạy ngầm',
          body: 'Meodusa đã thu nhỏ xuống khay hệ thống (System Tray). Bấm biểu tượng để mở lại.',
          icon: LOGO_PNG,
        }).show();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(LOGO_PNG).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('Meodusa (Live)');

  const updateContextMenu = () => {
    const isVisible = mainWindow?.isVisible();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: isVisible ? 'Thu nhỏ xuống khay' : 'Mở cửa sổ Meodusa',
        click: () => {
          if (isVisible) {
            mainWindow?.hide();
          } else {
            mainWindow?.show();
            mainWindow?.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Sao chép link chia sẻ LAN (http://192.168.1.6:4000)',
        click: () => {
          clipboard.writeText('http://192.168.1.6:4000');
          if (Notification.isSupported()) {
            new Notification({
              title: 'Meodusa LAN Link',
              body: 'Đã sao chép link chia sẻ vào clipboard!',
              icon: LOGO_PNG,
            }).show();
          }
        },
      },
      {
        label: 'Mở trên Trình duyệt web',
        click: () => {
          shell.openExternal(SERVER_URL);
        },
      },
      { type: 'separator' },
      {
        label: 'Khởi động cùng Windows',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({
            openAtLogin: item.checked,
            path: process.execPath,
          });
        },
      },
      { type: 'separator' },
      {
        label: 'Thoát hoàn toàn Meodusa',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray?.setContextMenu(contextMenu);
  };

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  tray.on('right-click', () => {
    updateContextMenu();
  });

  updateContextMenu();
}

function registerGlobalHotkeys() {
  const toggleVisibility = () => {
    if (!mainWindow) {
      createWindow();
    } else if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  };

  // Toggle window visibility via Ctrl+Shift+M or Ctrl+Shift+U
  globalShortcut.register('CommandOrControl+Shift+M', toggleVisibility);
  globalShortcut.register('CommandOrControl+Shift+U', toggleVisibility);
}

app.whenReady().then(async () => {
  await ensureServerRunning();
  createWindow();
  createTray();
  registerGlobalHotkeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (serverProcess) {
    console.log('[Desktop] Terminating spawned server daemon...');
    serverProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});
