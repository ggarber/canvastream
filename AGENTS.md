# Antigravity AI Project Context

## Project Roles

- **Antigravity**: Primary AI agentic coding assistant for complex architectural decisions and end-to-end implementation.
- **Sub-agents**: Browser-based testing and verification agents for E2E flow validation.

## Architecture & Design Decisions

### 1. Unified Binary Framing
A minimal 5-byte header was chosen for WebSocket transmission to avoid JSON overhead and ensure smooth frame delivery. See [PROTOCOL.md](file:///Users/ggarber/projects/canvastream/PROTOCOL.md) for full details:
- `uint8`: Message Type (8: Audio, 9: Video)
- `uint32_be`: Timestamp (milliseconds relative to stream start)
- `[]byte`: Encoded NAL unit / Frame payload

### 2. Go RTMP Proxy Side-loading
The Go server uses the `go-rtmp` library to act as an RTMP client. It drapes incoming binary packets into RTMP Message containers (`VideoMessage` / `AudioMessage`) to avoid expensive re-encoding (transmuxing only).

### 3. WebCodecs Configuration
The `VideoEncoder` is configured with a **High profile (avc1.64001F)** at 720p 30fps and 3000 kbps (CBR) to provide a high-quality stream for the RTMP destination.

## Implementation Roadmap

- [x] Next.js 15 + Canvas Animation Base
- [x] VideoEncoder Integration (WebCodecs)
- [x] Go WebSocket -> RTMP Proxy Implementation
- [x] RTMP Destination Configuration (FFmpeg)
- [x] Port 3003 Alignment & E2E Verification
- [x] WSS/SSL Support for Server
- [x] Audio Stream Support & Mixing
- [ ] Adaptive Bitrate Control (Planned)


## Maintenance & Testing

To re-verify the streaming flow:
1. Ensure FFmpeg is listening on `:1935`.
2. Check that the Go server logs `WS client connected and RTMP stream published` upon frontend "Start Stream".
3. Verify that the recorded `.flv` file contains valid H.264 bitstream.

### Development Cleanup
To stop all running processes (Next.js, Go, FFmpeg), use the **stop_project_processes** skill or run:
```bash
./.agents/skills/stop_project_processes/scripts/stop.sh
```
