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

## 📥 Tải Về Meodusa (Download Hub & Showroom)

| Nền tảng | Kiến trúc | Định dạng | Tải trực tiếp |
| :--- | :--- | :--- | :--- |
| **🪟 Windows 10 / 11** | `64-bit (x64)` *(Khuyên dùng)* | Bộ cài đặt NSIS Setup | [⬇️ Tải Meodusa-Setup-x64.exe](https://github.com/daonghiemminh-collab/UWS/releases/latest/download/Meodusa-Setup-1.0.0-x64.exe) |
| **🪟 Windows 10 / 11** | `64-bit (x64)` | Bản Portable Chạy Ngay | [⬇️ Tải Meodusa-Portable-x64.exe](https://github.com/daonghiemminh-collab/UWS/releases/latest/download/Meodusa-Portable-1.0.0-x64.exe) |
| **🪟 Windows Legacy** | `32-bit (ia32 / x86)` | Bộ cài đặt NSIS Setup | [⬇️ Tải Meodusa-Setup-ia32.exe](https://github.com/daonghiemminh-collab/UWS/releases/latest/download/Meodusa-Setup-1.0.0-ia32.exe) |
| **🪟 Windows Legacy** | `32-bit (ia32 / x86)` | Bản Portable Chạy Ngay | [⬇️ Tải Meodusa-Portable-ia32.exe](https://github.com/daonghiemminh-collab/UWS/releases/latest/download/Meodusa-Portable-1.0.0-ia32.exe) |
| **💻 Windows ARM** | `ARM 64-bit (arm64)` | Bộ cài đặt NSIS Setup | [⬇️ Tải Meodusa-Setup-arm64.exe](https://github.com/daonghiemminh-collab/UWS/releases/latest/download/Meodusa-Setup-1.0.0-arm64.exe) |

> 💡 **Tất cả các bản phát hành**: Xem lịch sử cập nhật chi tiết tại [GitHub Releases](https://github.com/daonghiemminh-collab/UWS/releases).

---

## 🚀 Khởi chạy Nhanh (Dành cho Lập Trình Viên / Developer)

```bash
# Cài đặt dependencies
npm install

# Khởi chạy bản Desktop Dev kèm Hot Reload
npm run desktop:dev

# Hoặc khởi chạy riêng máy chủ Daemon
npm run server:dev
```

Truy cập trên trình duyệt:
- **Máy chính (Host)**: `http://localhost:4000`
- **Máy phụ (LAN)**: `http://192.168.1.6:4000`

---

## 📦 Quy Trình Đóng Gói (Build & Packaging)

```bash
# 1. Đóng gói bộ cài đặt Windows x64 (Khuyên dùng)
npm --workspace=desktop run package:x64

# 2. Đóng gói toàn bộ các kiến trúc (x64, ia32, arm64)
npm --workspace=desktop run package:all

# 3. Tạo bản phát hành mới (Tự động build qua GitHub Actions)
git tag v1.0.0
git push origin v1.0.0
```

