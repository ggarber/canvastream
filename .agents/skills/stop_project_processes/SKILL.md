---
name: stop_project_processes
description: Terminates all running processes associated with the CanvaStream project, including the Next.js frontend, Go backend, and FFmpeg RTMP listeners.
---

# Stop Project Processes

This skill provides a reliable way to shut down all active components of the CanvaStream development environment. It targets specific ports used by the project and looks for common commands run from the project directories.

## Components Targeted
- **Frontend**: Next.js (Port 3000, `pnpm dev`)
- **Backend**: Go WebSocket/RTMP Proxy (Port 3003, `go run .`)
- **RTMP Ingest**: FFmpeg listeners (Port 1935, `ffmpeg -y -listen`)
- **Background Tasks**: TypeScript compiler checks (`npx tsc`)

## Scripts
- `scripts/stop.sh`: The primary execution script for cleanup.

## Usage
When the user or agent needs to reset the environment or stop all services, invoke the `scripts/stop.sh` script.
