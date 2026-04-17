export function setupSharedVideoEncoder(
  onChunk: (chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata | undefined) => void
) {
  const encoder = new VideoEncoder({
    output: onChunk,
    error: (e) => console.error("VideoEncoder error: ", e),
  });

  encoder.configure({
    codec: "avc1.64001F", // High profile
    width: 1280,
    height: 720,
    bitrate: 3_000_000,
    bitrateMode: "constant",
    framerate: 30,
    latencyMode: "realtime",
  });

  return encoder;
}

export function setupSharedAudioEncoder(
  stream: MediaStream,
  onChunk: (chunk: EncodedAudioChunk, metadata: EncodedAudioChunkMetadata | undefined) => void
) {
  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) return null;

  // @ts-ignore
  const trackProcessor = new MediaStreamTrackProcessor({ track: audioTrack });
  const reader = trackProcessor.readable.getReader();

  const encoder = new AudioEncoder({
    output: onChunk,
    error: (e) => console.error("AudioEncoder error: ", e),
  });

  const settings = audioTrack.getSettings();
  console.log("Encoding Audio settings:", settings);

  const targetSampleRate = [44100, 48000].includes(settings.sampleRate || 44100) ? (settings.sampleRate || 44100) : 48000;

  encoder.configure({
    codec: "mp4a.40.2",
    numberOfChannels: settings.channelCount || 1,
    sampleRate: targetSampleRate,
    bitrate: 128000,
  });

  let isActive = true;

  const pump = async () => {
    while (isActive) {
      try {
        const { done, value } = await reader.read();
        if (done) break;
        if (encoder.state === "configured") encoder.encode(value);
        value.close();
      } catch (err) {
        console.error("Audio TrackProcessor reading error:", err);
        break;
      }
    }
  };
  pump();

  return {
    encoder,
    settings,
    close: () => {
      isActive = false;
      if (encoder.state !== "closed") {
        encoder.close();
      }
      reader.cancel();
    }
  };
}

export class StreamManager {
  private ws: WebSocket;
  private lastSeenVideoConfig: ArrayBuffer | null = null;
  private lastSeenAudioConfig: ArrayBuffer | null = null;
  private videoConfigSent = false;
  private audioConfigSent = false;
  private baseTime: number | null = null;
  private lastVideoTimestamp = -1;
  private lastAudioTimestamp = -1;
  private videoChunkCount = 0;
  private audioChunkCount = 0;
  private videoBytes = 0;
  private videoFrames = 0;
  private audioBytes = 0;
  private statsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    sessionId: string,
    onConnected: () => void,
    onError: (msg: string) => void,
    onClose: () => void,
    rtmpUrl?: string,
    initialVideoConfig?: ArrayBuffer,
    initialAudioConfig?: ArrayBuffer
  ) {
    this.lastSeenVideoConfig = initialVideoConfig || null;
    this.lastSeenAudioConfig = initialAudioConfig || null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//${window.location.hostname}:3003`;
    const url = new URL(`${wsUrl}/stream/${sessionId}`);
    if (rtmpUrl) {
      url.searchParams.set("rtmp", rtmpUrl);
    }
    this.ws = new WebSocket(url.toString());
    this.ws.binaryType = "arraybuffer";

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "connected") {
          onConnected();
        } else if (msg.type === "error") {
          onError(msg.message);
        }
      } catch (err) {
        // Ignore binary or malformed messages
      }
    };


    this.ws.onclose = onClose;

    this.statsInterval = setInterval(() => {
      const videoBitrate = (this.videoBytes * 8) / 10 / 1000; // kbps
      const audioBitrate = (this.audioBytes * 8) / 10 / 1000; // kbps
      const fps = this.videoFrames / 10;
      console.log(
        `[StreamManager] Stats (last 10s): Video ${videoBitrate.toFixed(2)} kbps @ ${fps.toFixed(
          2
        )} fps, Audio ${audioBitrate.toFixed(2)} kbps`
      );
      this.videoBytes = 0;
      this.videoFrames = 0;
      this.audioBytes = 0;
    }, 10000);
  }

  public handleVideoChunk = (chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata | undefined) => {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (this.baseTime === null) this.baseTime = chunk.timestamp;
    let timestamp = Math.max(0, Math.floor((chunk.timestamp - this.baseTime) / 1000));

    // Ensure strictly monotonic timestamps
    if (timestamp <= this.lastVideoTimestamp) {
      timestamp = this.lastVideoTimestamp + 1;
    }
    this.lastVideoTimestamp = timestamp;

    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);

    const config = (metadata?.decoderConfig?.description as ArrayBuffer) || this.lastSeenVideoConfig;
    if (config && (metadata?.decoderConfig?.description || !this.videoConfigSent)) {
      this.videoConfigSent = true;
      this.lastSeenVideoConfig = config;
      const videoPacket = new Uint8Array(5 + config.byteLength);
      videoPacket[0] = 0x17;
      videoPacket[1] = 0x00;
      videoPacket[2] = 0;
      videoPacket[3] = 0;
      videoPacket[4] = 0;
      videoPacket.set(new Uint8Array(config), 5);

      const msg = new Uint8Array(5 + videoPacket.length);
      msg[0] = 9;
      new DataView(msg.buffer).setUint32(1, timestamp);
      msg.set(videoPacket, 5);
      this.ws.send(msg);
      this.videoBytes += msg.byteLength;
      this.videoChunkCount++;
    }

    const videoPacket = new Uint8Array(5 + data.byteLength);
    const isKey = chunk.type === "key";
    videoPacket[0] = isKey ? 0x17 : 0x27;
    videoPacket[1] = 0x01;
    videoPacket[2] = 0;
    videoPacket[3] = 0;
    videoPacket[4] = 0;
    videoPacket.set(data, 5);

    const totalMsg = new Uint8Array(5 + videoPacket.length);
    totalMsg[0] = 9;
    new DataView(totalMsg.buffer).setUint32(1, timestamp);
    totalMsg.set(videoPacket, 5);
    this.ws.send(totalMsg);
    this.videoBytes += totalMsg.byteLength;
    this.videoFrames++;
    this.videoChunkCount++;
  };

  public handleAudioChunk = (chunk: EncodedAudioChunk, metadata: EncodedAudioChunkMetadata | undefined, settings: MediaTrackSettings) => {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (this.baseTime === null) this.baseTime = chunk.timestamp;
    let timestamp = Math.max(0, Math.floor((chunk.timestamp - this.baseTime) / 1000));

    // Ensure strictly monotonic timestamps
    if (timestamp <= this.lastAudioTimestamp) {
      timestamp = this.lastAudioTimestamp + 1;
    }
    this.lastAudioTimestamp = timestamp;

    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);

    // For AAC, it's almost always 0xAF (AAC, 44kHz, 16bit, Stereo) in RTMP/FLV
    // regardless of mono/stereo, as the actual config is in the AudioSpecificConfig.
    const audioHeader = 0xAF;

    const config = (metadata?.decoderConfig?.description as ArrayBuffer) || this.lastSeenAudioConfig;

    if (config && (metadata?.decoderConfig?.description || !this.audioConfigSent)) {
      console.log("[StreamManager] Sending Audio Sequence Header", config);
      this.audioConfigSent = true;
      this.lastSeenAudioConfig = config;
      const audioPacket = new Uint8Array(2 + config.byteLength);
      audioPacket[0] = audioHeader;
      audioPacket[1] = 0x00;
      audioPacket.set(new Uint8Array(config), 2);

      const msg = new Uint8Array(5 + audioPacket.length);
      msg[0] = 8;
      new DataView(msg.buffer).setUint32(1, timestamp);
      msg.set(audioPacket, 5);
      this.ws.send(msg);
      this.audioBytes += msg.byteLength;
      this.audioChunkCount++;
    }

    const audioPacket = new Uint8Array(2 + data.byteLength);
    audioPacket[0] = audioHeader;
    audioPacket[1] = 0x01;
    audioPacket.set(data, 2);

    const totalMsg = new Uint8Array(5 + audioPacket.length);
    totalMsg[0] = 8;
    new DataView(totalMsg.buffer).setUint32(1, timestamp);
    totalMsg.set(audioPacket, 5);
    this.ws.send(totalMsg);
    this.audioBytes += totalMsg.byteLength;
    this.audioChunkCount++;
  };

  public getStats() {
    return { videoChunks: this.videoChunkCount, audioChunks: this.audioChunkCount };
  }

  public stop() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.ws.close();
  }
}
