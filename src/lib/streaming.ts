export class StreamManager {
  private ws: WebSocket;
  private lastSeenVideoConfig: ArrayBuffer | null = null;
  private lastSeenAudioConfig: ArrayBuffer | null = null;
  private videoConfigSent = false;
  private audioConfigSent = false;
  private videoStartTime: number | null = null;
  private audioStartTime: number | null = null;
  private lastVideoTimestamp = -1;
  private lastAudioTimestamp = -1;
  private chunkCount = 0;

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
    const url = new URL(`ws://localhost:3003/stream/${sessionId}`);
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
  }

  public handleVideoChunk = (chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata | undefined) => {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (this.videoStartTime === null) this.videoStartTime = chunk.timestamp;
    let timestamp = Math.max(0, Math.floor((chunk.timestamp - this.videoStartTime) / 1000));
    
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
      this.chunkCount++;
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
    this.chunkCount++;
  };

  public handleAudioChunk = (chunk: EncodedAudioChunk, metadata: EncodedAudioChunkMetadata | undefined, settings: MediaTrackSettings) => {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (this.audioStartTime === null) this.audioStartTime = chunk.timestamp;
    let timestamp = Math.max(0, Math.floor((chunk.timestamp - this.audioStartTime) / 1000));

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
      this.chunkCount++;
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
    this.chunkCount++;
  };

  public getStats() {
    return { chunks: this.chunkCount };
  }

  public stop() {
    this.ws.close();
  }
}
