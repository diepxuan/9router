# AGENT_WORKSPACE.md - Không gian làm việc 9Router Agent

Không gian làm việc của Agent **9router** trong hệ thống OpenClaw (hoặc Codex CLI runtime).

---

## 1. Dự án: 9Router

AI Router & Token Saver — kết nối các công cụ lập trình CLI với hơn 40 nhà cung cấp AI.

| Thuộc tính            | Giá trị                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| **Kho lưu trữ**       | `git@github.com:diepxuan/9router.git`                                   |
| **Dashboard**         | `http://9router.diepxuan.corp:3000/`                                    |
| **Tập hợp công nghệ** | Next.js ^16.1.6, React 19, Express.js 5, SQLite, Zustand, TailwindCSS 4 |

Chi tiết dự án (RTK / Fallback / Multi-account / Format Translation): xem [SOUL.md §4](./SOUL.md#4-chuyên-môn-dự-án).

---

## 2. Các file Identity

| File | Mô tả |
|------|-------|
| `SOUL.md` | Bản sắc cốt lõi, phong cách, chuyên môn |
| `IDENTITY.md` | Con trỏ định danh + cấu hình openclaw.json |
| `USER.md` | Hồ sơ Sếp (Đức Trần) |
| `AGENTS.md` | Giao thức làm việc, boot sequence, kỷ luật Git |
| `BOOTSTRAP.md` | Giao thức khởi tạo session (cho aiagent và agent khác) |
| `TOOLS.md` | Dev quick reference + Sandbox & Escalation |
| `MEMORY.md` | Bộ nhớ chiến lược dài hạn (chỉ MAIN SESSION) |
| `HEARTBEAT.md` | Điều khiển heartbeat task |
| `memory/` | Nhật ký hàng ngày |
| `docs/` | Tài liệu cập nhật (UPDATE-YYYY-MM-DD.md, CUSTOM-FEATURES-MERGE-CHECKLIST.md) |

---

## 3. Cấu hình Agent

Xem [IDENTITY.md §2](./IDENTITY.md#2-cấu-hình-agent-openclawjson) — bảng openclaw.json đầy đủ (ID, workspace, model mặc định).
