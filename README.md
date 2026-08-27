# ⚡ Meodusa - Futuristic Cyberpunk Workspace System

Hệ thống Không Gian Làm Việc Hợp Nhất Đa Máy Trạm (**Meodusa**) được thiết kế cho trải nghiệm lập trình và quản trị máy tính hiện đại:

- **🖥️ Web Terminal (PTY)**: Phiên làm việc PowerShell thời gian thực với xterm.js đa cửa sổ.
- **🪟 Tiling Window Manager (BSP)**: Chia cửa sổ cây nhị phân thông minh, snap 4 hướng, zero gap, zero overlap.
- **📁 File Explorer & Direct Drive Access**: Duyệt toàn bộ ổ đĩa máy tính (`E:\`, `C:\`), menu chuột phải hiện đại, trình soạn thảo Notepad lưu trực tiếp vào đĩa với `Ctrl+S`.
- **📊 Real-time Telemetry**: Giám sát CPU, RAM, GPU, Ổ cứng và tải hệ thống chu kỳ 1s.
- **👥 Multi-User Presence**: Nhận diện Host vs Guest, thanh hiển thị người dùng trực tuyến, chia sẻ tức thì qua mạng LAN.
- **🚀 Git Automation & Tag Engine**: Chạy lệnh Git / Build với 1 cú nhấp chuột thông qua bộ biến thẻ tự động `{{MACHINE_NAME}}`, `{{DATETIME}}`.

---

## 📁 Cấu trúc Thư mục Dự án

```
E:\UWS
├── config/                 # Cấu hình hệ thống (Port, default.json, automation.json)
├── shared/                 # Định nghĩa types, protocol và data models dùng chung
│   └── types/
│       ├── protocol.ts     # Giao thức WebSocket (Terminal, Metrics, File, Session, Automation)
│       ├── metrics.ts      # Schema dữ liệu hiệu năng (CPU, RAM, GPU, Disk)
│       └── workspace.ts    # Model quản lý Workspace & Quyền hạn người dùng
├── server/                 # Backend Node.js / TypeScript Daemon
│   └── src/
│       ├── api/            # HTTP endpoints (Download, upload, raw files)
│       ├── services/
│       │   ├── terminal/   # PTY Session Manager (PowerShell / cmd)
│       │   ├── metrics/    # System Stats Collector (CPU, RAM, GPU, Disk)
│       │   ├── filesystem/ # Safe File Explorer & Path Sandbox
│       │   ├── session/    # Room & Multi-User Presence Controller
│       │   └── automation/ # Git Automation Presets & Tag Interpolator
│       ├── public/         # Single-Page UI (HTML5, XTerm.js, BSP Window Tree)
│       └── index.ts        # Entry point của Server
└── storage/
    └── workspaces/         # Thư mục lưu trữ các workspace người dùng
        └── default/        # Workspace mẫu mặc định
```

---

## 🚀 Khởi chạy Nhanh

```bash
# Cài đặt dependencies
npm install

# Khởi chạy máy chủ Daemon
npm --workspace=server run dev
```

Truy cập trên trình duyệt:
- **Máy chính (Host)**: `http://localhost:4000`
- **Máy phụ (LAN)**: `http://192.168.1.6:4000`

