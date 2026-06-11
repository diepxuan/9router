# MEMORY.md - Bộ nhớ Chiến lược 9Router

> Chỉ MAIN SESSION mới được đọc file này. Các session thông thường chỉ ghi vào nhật ký hàng ngày.

---

## 1. Trạng thái dự án

| Thuộc tính | Giá trị |
|------------|---------|
| Kho lưu trữ | diepxuan/9router |
| Phiên bản hiện tại | v0.4.66 (29/05/2026) |
| Dashboard | http://localhost:20128 |
| Triển khai | CapRover (Docker) |

---

## 2. Kiến trúc quan trọng

### RTK Token Saver
- Cơ chế nén nội dung `tool_result`, tiết kiệm 20-40% tokens.
- Yêu cầu độ chính xác tuyệt đối — sai sót dẫn đến mất ngữ cảnh và tốn token.
- Vị trí: `src/services/rtk/`

### Proxy & Fallback
- Cổng Proxy: 20128.
- Chuỗi Fallback: Subscription $\rightarrow$ Cheap $\rightarrow$ Free, đảm bảo không gián đoạn (zero downtime).
- Thời gian chờ (Timeout stall): 30 giây (từ v0.4.66).

### Cơ sở dữ liệu
- SQLite: better-sqlite3 $\rightarrow$ node:sqlite (Node $\geq$ 22.5) $\rightarrow$ sql.js (fallback).
- Thư mục DATA_DIR: `~/.9router`, xử lý fallback khi gặp lỗi EACCES/EPERM.

---

## 3. Nhà cung cấp & Mô hình (Providers & Models)

### Tổng quan
- Hỗ trợ hơn 40 nhà cung cấp AI.
- Chuyển đổi định dạng mô hình: OpenAI $\leftrightarrow$ Claude $\leftrightarrow$ Gemini.

### Các Provider mới (Tháng 05/2026)
- Qoder (v0.4.66)
- Kiro (v0.4.50)
- xAI Grok (v0.4.58)
- Xiaomi MiMo (v0.4.12)
- Azure OpenAI (v0.4.2)
- Cloudflare Workers AI (v0.4.25)

---

## 4. Quy trình Git (Git Workflow)

- Chỉ tạo Pull Request (PR) lên `diepxuan/9router` (fork).
- TUYỆT ĐỐI KHÔNG push hoặc PR lên `decolua/9router` (upstream).
- Mỗi tác vụ = 1 nhánh (branch) = 1 PR.
- Chờ Sếp duyệt trước khi merge.

---

## 5. Nợ kỹ thuật (Technical Debt)

| Vấn đề | Trạng thái | Ghi chú |
|-------|--------|-------|
| CHANGELOG bị ngắt quãng | Chưa xử lý | Chỉ có từ v0.3.96, thiếu các phiên bản trước đó. |
| Tài liệu Identity trùng lặp | Đang xử lý | SOUL + IDENTITY trùng lặp 60% nội dung. |

---

## 6. Bài học kinh nghiệm

### Tháng 05/2026
- Việc nén RTK phải được kiểm tra kỹ trước khi merge.
- Logic Fallback cần có unit test chặt chẽ.
- Xây dựng lại Docker image sau khi thay đổi base image.

### Tháng 04/2026
- Đăng nhập OIDC có thể gây khóa tài khoản — cần chế độ phục hồi.
- Xung đột cổng MITM 443 — phải kill process trước khi khởi động.
- Chế độ Tailscale TUN tốt hơn cho Funnel TLS.

---

*MEMORY.md được cập nhật bởi MAIN SESSION. Các session thông thường không đọc/ghi file này.*