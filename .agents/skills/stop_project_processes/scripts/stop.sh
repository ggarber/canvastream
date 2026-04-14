#!/bin/bash

# CanvaStream Process Terminator
# This script identifies and kills all processes related to the project.

echo "🔍 Identifying CanvaStream processes..."

# 1. Kill by Port
# 3000: Next.js
# 3003: Go Server
# 1935: RTMP
PORTS=(3000 3003 1935)

for PORT in "${PORTS[@]}"; do
    PIDS=$(lsof -t -i:$PORT)
    if [ ! -z "$PIDS" ]; then
        for PID in $PIDS; do
            echo "✅ Killing process on port $PORT (PID: $PID)"
            kill -9 $PID 2>/dev/null
        done
    fi
done

# 2. Kill by Process Name/Pattern
# Target pnpm dev, go run, and ffmpeg listeners specifically related to webrtc/streaming
echo "🔍 Searching for remaining background tasks..."

# Kill any 'go run' in the server directory
PIDS_GO=$(ps aux | grep "go run ." | grep -v grep | awk '{print $2}')
if [ ! -z "$PIDS_GO" ]; then
    echo "✅ Killing Go run processes: $PIDS_GO"
    echo "$PIDS_GO" | xargs kill -9 2>/dev/null
fi

# Kill pnpm dev
PIDS_PNPM=$(ps aux | grep "pnpm dev" | grep -v grep | awk '{print $2}')
if [ ! -z "$PIDS_PNPM" ]; then
    echo "✅ Killing pnpm dev processes: $PIDS_PNPM"
    echo "$PIDS_PNPM" | xargs kill -9 2>/dev/null
fi

# Kill FFmpeg listeners
PIDS_FFMPEG=$(ps aux | grep "ffmpeg" | grep "listen" | grep -v grep | awk '{print $2}')
if [ ! -z "$PIDS_FFMPEG" ]; then
    echo "✅ Killing FFmpeg listeners: $PIDS_FFMPEG"
    echo "$PIDS_FFMPEG" | xargs kill -9 2>/dev/null
fi

# Kill npx tsc background checks
PIDS_TSC=$(ps aux | grep "tsc --noEmit" | grep -v grep | awk '{print $2}')
if [ ! -z "$PIDS_TSC" ]; then
    echo "✅ Killing TSC background tasks: $PIDS_TSC"
    echo "$PIDS_TSC" | xargs kill -9 2>/dev/null
fi

echo "🚀 Cleanup complete. All project processes stopped."
