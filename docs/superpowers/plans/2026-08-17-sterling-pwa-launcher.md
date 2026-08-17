# Sterling Harness PWA Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `Sterling Harness.lnk` start the local Web UI invisibly before opening the installed Chrome PWA.

**Architecture:** A Windows Script Host VBScript stored under `%LOCALAPPDATA%\Sterling Harness` will probe `127.0.0.1:3080`, start `pnpm dsh web` through a hidden `cmd.exe` only when needed, wait for readiness, and launch the original Chrome PWA command. The desktop shortcut will point to `wscript.exe` while retaining the original app icon and arguments in the launcher.

**Tech Stack:** Windows Script Host VBScript, PowerShell shortcut automation, pnpm, Chrome `chrome_proxy.exe`.

---

### Task 1: Create the hidden launcher

**Files:**
- Create: `C:\Users\PC\AppData\Local\Sterling Harness\launch.vbs`

- [ ] Write the launcher with these exact behaviors:
  - Probe `http://127.0.0.1:3080/` with `WinHttp.WinHttpRequest.5.1`.
  - Atomically acquire a temporary lock directory before starting the service.
  - Set the working directory to `D:\deepseek harness\Sterling`.
  - Run `cmd.exe /d /c pnpm dsh web` with window style `0` and redirect output to a local log.
  - Poll for readiness for at most 60 seconds, release the lock, and launch the original Chrome PWA command.
  - Show a message box and skip Chrome when the service cannot become ready.

### Task 2: Update the desktop shortcut safely

**Files:**
- Modify: `C:\Users\PC\Desktop\Sterling Harness.lnk`
- Create backup: `C:\Users\PC\AppData\Local\Sterling Harness\Sterling Harness.lnk.original`

- [ ] Back up the current shortcut once.
- [ ] Set the shortcut target to `C:\Windows\System32\wscript.exe` with the launcher path as its argument.
- [ ] Keep the current icon, shortcut name, and Chrome app id/profile arguments in the launcher.

### Task 3: Verify cold and warm launches

**Files:**
- Verify: `C:\Users\PC\AppData\Local\Sterling Harness\launch.vbs`
- Verify: `C:\Users\PC\Desktop\Sterling Harness.lnk`

- [ ] Stop only the existing Sterling Web process started from `D:\deepseek harness\Sterling`.
- [ ] Invoke the launcher with `wscript.exe` and verify port 3080 becomes available without a console window.
- [ ] Invoke it a second time and verify no second listener is created.
- [ ] Verify the HTTP endpoint returns `200` and the shortcut still points to the launcher.
- [ ] Confirm `git status --short` in `D:\deepseek harness\Sterling` contains no launcher or build artifacts.
