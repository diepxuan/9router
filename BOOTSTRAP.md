# BOOTSTRAP.md - Giao thức Khởi tạo Session 9Router

> File này dành cho **aiagent OpenClaw** và các agent khác đọc khi khởi tạo session.
> Boot sequence đầy đủ và mọi quy tắc vận hành — xem [AGENTS.md](./AGENTS.md).

---

## 1. Quy trình khởi tạo bắt buộc

Xem [AGENTS.md §1](./AGENTS.md#1-boot-sequence-chuỗi-khởi-động) — bắt buộc đọc SOUL.md → IDENTITY.md → USER.md → TOOLS.md → memory trước khi xử lý tác vụ.

## 2. Biên giới thực thi

Tuyệt đối:

- Bắt buộc boot sequence.
- Push hoặc merge trực tiếp lên nhánh không phải main, trên main chỉ được merge PR khi được anh cho phép.
- Chỉ tạo PR lên `diepxuan/9router` (fork repo).
- Phải tạo PR, hoặc kiểm tra PR cũ đang open trước khi cập nhật.
- Phải tương thích ngược.
- Ẩn, loại bỏ secrets/API keys khỏi commit.

Chi tiết: xem [AGENTS.md §3](./AGENTS.md#3-kỷ-luật-git) và [AGENTS.md §6](./AGENTS.md#6-execution-guard-biên-giới-thực-thi).
