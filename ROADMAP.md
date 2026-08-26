# 🗺️ UWS Master Architecture & Roadmap

Hệ thống Không gian Làm việc Hợp nhất (**Unifiable Workspace System - UWS**).

---

## 🏗️ PHẦN 1: Core Engine & Tiling Window Workspace (ĐÃ HOÀN THÀNH 100% ✅)

| Thành phần | Mô tả chi tiết | Trạng thái |
| :--- | :--- | :---: |
| **1.1 Telemetry & Host Node** | Stream hiệu năng (CPU, RAM, GPU, Disks, Load) thời gian thực 1s qua WebSocket. Đổi tên máy trực tiếp. | ✅ Hoàn thành |
| **1.2 BSP Tiling Window Manager** | Hệ thống chia cửa sổ cây nhị phân (Binary Space Partitioning), kéo thả 4 hướng (Snap 4-Way), tự động lấp khoảng trống (Zero Gap Collapse), không chồng đè. Thanh Summon bên trái. | ✅ Hoàn thành |
| **1.3 Multi-Terminal PTY** | Khởi tạo nhiều phiên PowerShell song song, tự động bám kích thước cửa sổ (xterm.js + fit addon), hỗ trợ copy/paste phím tắt. | ✅ Hoàn thành |
| **1.4 File Explorer & Disk Access** | Duyệt file trực tiếp trên toàn bộ ổ đĩa (`E:\`, `C:\`, `E:\UWS`), thanh điều hướng breadcrumb, chip ổ đĩa, bộ lọc tìm kiếm nhanh. | ✅ Hoàn thành |
| **1.5 Modern Context Menu** | Menu chuột phải đa năng (Mở trong Notepad, Mở trong Terminal, Tải về, Đổi tên, Xóa, Tạo mới) giúp tinh gọn thanh công cụ. | ✅ Hoàn thành |
| **1.6 Notepad & Image Viewer** | Trình soạn thảo văn bản/code tối ưu phím tắt `Ctrl + S` lưu trực tiếp vào ổ đĩa, thụt dòng Tab 2-space, đếm dòng/cột. Trình xem ảnh tỷ lệ chuẩn. | ✅ Hoàn thành |

---

## 🚀 PHẦN 2: Multi-User Collaboration, Git Bridge & Automation (ĐÃ HOÀN THÀNH 100% ✅)

| Thành phần | Mô tả chi tiết | Trạng thái |
| :--- | :--- | :---: |
| **2.1 Session Engine & Multi-User Presence** | Quản lý phòng (`WorkspaceRoom`), nhận diện Host vs Guest, thanh hiển thị người dùng trực tuyến trên Top Bar, thông báo Toast kết nối/rời phòng, 1-Click sao chép link chia sẻ mạng LAN. | ✅ Hoàn thành |
| **2.2 Git Automation & Command Slots** | Quản lý các Slot lệnh tắt tùy biến, bộ thẻ biến động (`{{MACHINE_NAME}}`, `{{DATETIME}}`, `{{USER_NAME}}`), menu Dropdown `Actions ▾` tinh gọn. | ✅ Hoàn thành |
| **2.3 Git Repos as First-Class Storage** | Đưa `[🐙 Dự Án Git (Repos)]` vào File Manager ngang hàng với Ổ đĩa. Giao diện 1-Click Khởi tạo Repo (`git init`, `.gitignore`, `README.md`) và Clone dự án từ GitHub/GitLab hoặc LAN Git. | ✅ Hoàn thành |
| **2.4 Turn-Based Permission Lock** | Cơ chế khóa quyền điều khiển luân phiên (Single Editor / Multiple Viewers): Chỉ người giữ lượt mới được gõ Terminal và sửa file; các máy khác xem stream thời gian thực. Banner xin quyền `[Xin Quyền]` đặt ngay tại chân Terminal. | ✅ Hoàn thành |

---

## 🖥️ PHẦN 3: Desktop Shell & Native Windows Integration (ĐÃ HOÀN THÀNH 100% ✅)

| Thành phần | Mô tả chi tiết | Trạng thái |
| :--- | :--- | :---: |
| **3.1 Custom Brand Identity & Logo Asset** | Tích hợp logo UWS chính thức từ file thiết kế vào Top Bar, Favicon và Window Icon. | ✅ Hoàn thành |
| **3.2 Native Desktop App Shell** | Ứng dụng Desktop độc lập (`@uws/desktop`), không phụ thuộc trình duyệt, tự động quản lý vòng đời Daemon ngầm. | ✅ Hoàn thành |
| **3.3 System Tray & Background Daemon** | Biểu tượng UWS dưới khay hệ thống Windows (Thu nhỏ khi đóng `X`, Bật/Tắt cửa sổ, Sao chép link LAN, Khởi động cùng Windows). | ✅ Hoàn thành |
| **3.4 Global Hotkey & 1-Click Launcher** | Phím tắt toàn cục `Ctrl + Shift + U` để bật/ẩn UWS tức thì từ bất kỳ đâu. File kích hoạt 1-Click `UWS-Launcher.bat`. | ✅ Hoàn thành |

---

## 🌐 PHẦN 4 & 5: Remote Tunneling & AI Agents (TƯƠNG LAI 🔮)
- **Phase 4: Secure Remote Tunnel & Zero-Config Networking**: Kết nối từ xa qua Internet (Cloudflare Tunnel / WireGuard / P2P) không cần mở port modem.
- **Phase 5: Agentic AI Co-pilot**: Tích hợp trợ lý AI cục bộ (Ollama) / đám mây tự động hỗ trợ debug terminal, chạy lệnh và sửa code trực tiếp trong Workspace.
