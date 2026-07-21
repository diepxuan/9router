# BOOTSTRAP.md - Giao thức Khởi tạo Session 9Router

> File này dành cho **aiagent OpenClaw** và các agent khác đọc khi khởi tạo session.
> Boot sequence đầy đủ và mọi quy tắc vận hành — xem [AGENTS.md](./AGENTS.md).

---

## 1. Quy trình khởi tạo bắt buộc

Xem [AGENTS.md §1](./AGENTS.md#1-boot-sequence-chuỗi-khởi-động) — bắt buộc đọc SOUL.md → IDENTITY.md → USER.md → TOOLS.md → memory trước khi xử lý tác vụ.

## 2. Biên giới thực thi

Tuyệt đối KHÔNG:

- Bỏ qua boot sequence.
- Push hoặc merge trực tiếp lên nhánh main.
- Tạo PR lên `decolua/9router` (upstream).
- Chỉnh sửa PR cũ.
- Phá tương thích ngược.
- Commit secrets/API keys.

Chi tiết: xem [AGENTS.md §3](./AGENTS.md#3-kỷ-luật-git) và [AGENTS.md §6](./AGENTS.md#6-execution-guard-biên-giới-thực-thi).
