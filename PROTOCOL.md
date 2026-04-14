# CanvaStream Protocol

This document describes the binary framing protocol used for transmitting audio and video data over WebSocket from the client to the Go RTMP proxy.

## Message Framing

All messages sent over the WebSocket are binary and follow a 5-byte header format followed by the payload.

| Offset | Length | Type | Description |
|--------|--------|------|-------------|
| 0      | 1      | uint8 | Message Type (8: Audio, 9: Video) |
| 1      | 4      | uint32 (BE) | Timestamp (ms relative to stream start) |
| 5      | variable | bytes | Payload (Codec-specific data) |

## Video Payload (H.264 / AVC)

The video payload follows the RTMP Video Tag format.

### Sequence Header (AVCC)
Sent once when the encoder starts or changes configuration.
- Byte 0: `0x17` (Key frame (1) + Codec ID AVC (7))
- Byte 1: `0x00` (AVC Sequence Header)
- Bytes 2-4: `0x000000` (Composition Time Offset)
- Bytes 5+: AVCDecoderConfigurationRecord (from WebCodecs `decoderConfig.description`)

### NAL Units
- Byte 0: `0x17` for Key frames, `0x27` for Inter frames
- Byte 1: `0x01` (AVC NALU)
- Bytes 2-4: `0x000000` (Composition Time Offset)
- Bytes 5+: H.264 bitstream data

## Audio Payload (AAC)

The audio payload follows the RTMP Audio Tag format.

### Sequence Header
Sent once when the encoder starts.
- Byte 0: `0xAF` (SoundFormat AAC (10) + SoundRate 44kHz (3) + SoundSize 16bit (1) + SoundType Stereo (1))
- Byte 1: `0x00` (AAC Sequence Header)
- Bytes 2+: AudioSpecificConfig (from WebCodecs `decoderConfig.description`)

### Raw AAC Frames
- Byte 0: `0xAF`
- Byte 1: `0x01` (AAC Raw)
- Bytes 2+: Encoded AAC frame data
## Signaling Protocol (JSON)

Communication for session management (chat, presence, and stream signaling) happens over the `/session/{sessionId}` WebSocket using JSON messages.

### Message Structure

```json
{
  "type": "string",
  "from": "string (opt)",
  "to": "string (opt)",
  "name": "string (opt)",
  "fromName": "string (opt)",
  "data": "any (opt)"
}
```

### Connection Events

- `connect`: Sent by client to register. Data includes participant `name`.
- `response`: Sent by server as acknowledgement. Data includes `status` and `clientId`.
- `CONNECTED`: Broadcast when a participant joins.
- `DISCONNECTED`: Broadcast when a participant leaves.

### Stream Signaling

- `CREATE_STREAM`: Sent by client to announce a new media source.
  - `data.source`: "camera" | "display"
- `STREAM_CREATED`: Broadcast by server.
  - `data.id`: Unique stream identifier.
  - `data.source`: Source type.
  - `data.from`: Owner's client ID.
- `DESTROY_STREAM`: Sent by client to remove a media source.
  - `data.id`: Stream identifier to remove.
- `STREAM_DESTROYED`: Broadcast by server.
  - `data.id`: Unique stream identifier removed.

### Chat

- `chat`: Message exchange.
  - `data.text`: Message content.

### Session State

- `SESSION_STATE`: Synchronizes arbitrary JSON state across all participants.
  - `data`: Arbitrary JSON object.
  - Examples:
    - `{ "layout": "grid" }`
    - `{ "layout": "presentation" }`
