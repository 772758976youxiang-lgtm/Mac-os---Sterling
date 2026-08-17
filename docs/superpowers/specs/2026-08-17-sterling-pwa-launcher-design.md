# Sterling Harness PWA launcher design

## Goal

Opening the existing Windows desktop shortcut starts the local Sterling Web UI and then opens the installed Chrome PWA without showing a terminal window.

## Scope

- Keep the repository checkout at `D:\deepseek harness\Sterling` as the service working directory.
- Use the repository command `pnpm dsh web` to start the service.
- Treat `http://127.0.0.1:3080` as the readiness endpoint.
- Keep the service running after the PWA window closes.
- Preserve the current PWA target, arguments, icon, and shortcut name.
- Store the launcher outside the Git worktree because it is a machine-specific desktop integration.

## Components and flow

The desktop shortcut will target a Windows Script Host `.vbs` launcher. The launcher will:

1. Probe the local readiness URL.
2. Start `cmd.exe /d /c pnpm dsh web` with a hidden window when the service is unavailable.
3. Poll the readiness URL for a bounded period.
4. Show the original Chrome `chrome_proxy.exe` command with its existing profile and app id.

The launcher will use a per-process mutex or equivalent short-lived lock to avoid starting duplicate service processes when the shortcut is opened repeatedly during startup.

## Failure behavior

If the service does not become ready before the timeout, the launcher will show a Windows message containing the repository path and command to run manually, then exit without opening a broken PWA window. It will not terminate an existing process or modify repository files.

## Acceptance criteria

- Double-clicking `Sterling Harness.lnk` starts the service if port 3080 is unavailable.
- No console window appears during startup.
- The PWA opens after the readiness probe succeeds.
- Opening the shortcut while the service is already running does not start another service.
- Closing and reopening the PWA reuses the existing service.
- The shortcut keeps its current icon and Chrome app arguments.
- The repository remains clean after the launcher and shortcut are installed.
