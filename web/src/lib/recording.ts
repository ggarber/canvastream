import * as Mp4Muxer from 'mp4-muxer';

export class ChunkedRecordManager {
  private muxer: Mp4Muxer.Muxer<Mp4Muxer.ArrayBufferTarget>;
  private target: Mp4Muxer.ArrayBufferTarget;
  private lastSeenVideoConfig: ArrayBuffer | null = null;
  private lastSeenAudioConfig: ArrayBuffer | null = null;
  private chunkCount = 0;

  constructor(audioSampleRate: number = 44100, audioChannelCount: number = 1) {
    console.log("Initializing ChunkedRecordManager (mp4-muxer based)");
    this.target = new Mp4Muxer.ArrayBufferTarget();
    this.muxer = new Mp4Muxer.Muxer({
      target: this.target,
      video: {
        codec: 'avc',
        width: 1280,
        height: 720
      },
      audio: {
        codec: 'aac',
        numberOfChannels: audioChannelCount,
        sampleRate: audioSampleRate
      },
      firstTimestampBehavior: 'offset',
      fastStart: "in-memory"
    });
  }

  public handleVideoChunk = (chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata | undefined) => {
    try {
      const config = (metadata?.decoderConfig?.description as ArrayBuffer) || this.lastSeenVideoConfig;
      if (config) this.lastSeenVideoConfig = config;

      this.muxer.addVideoChunk(chunk, config ? {
        ...metadata,
        decoderConfig: {
          codec: metadata?.decoderConfig?.codec || 'avc1.42E01F',
          description: config,
          codedWidth: metadata?.decoderConfig?.codedWidth || 1280,
          codedHeight: metadata?.decoderConfig?.codedHeight || 720
        }
      } : metadata);
      this.chunkCount++;
    } catch (e) {
      console.error("ChunkedRecordManager error adding video chunk:", e);
    }
  };

  public handleAudioChunk = (chunk: EncodedAudioChunk, metadata: EncodedAudioChunkMetadata | undefined) => {
    try {
      const config = (metadata?.decoderConfig?.description as ArrayBuffer) || this.lastSeenAudioConfig;
      if (config) this.lastSeenAudioConfig = config;

      this.muxer.addAudioChunk(chunk, config ? {
        ...metadata,
        decoderConfig: {
          codec: metadata?.decoderConfig?.codec || 'mp4a.40.2',
          description: config,
          numberOfChannels: metadata?.decoderConfig?.numberOfChannels || 1,
          sampleRate: metadata?.decoderConfig?.sampleRate || 44100
        }
      } : metadata);
      this.chunkCount++;
    } catch (e) {
      console.error("ChunkedRecordManager error adding audio chunk:", e);
    }
  };

  public getStats() {
    return { chunks: this.chunkCount };
  }

  public start() {
    // Current bitstream-based record manager doesn't need explicit start
    // since it just waits for chunks.
  }

  public stopAndDownload(filename: string = "recording.mp4") {
    try {
      console.log("Finalizing chunked recording. target buffer size before finalize:", this.target.buffer?.byteLength || 0);
      this.muxer.finalize();
      const buffer = this.target.buffer;

      if (!buffer || buffer.byteLength === 0) {
        console.error("ChunkedRecordManager: Finalized buffer is empty or null.");
        return;
      }

      console.log(`Chunked Recording finalized. Size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

      let safeFilename = filename
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '');

      if (!safeFilename || safeFilename === '.mp4') {
        safeFilename = `recording-${Date.now()}.mp4`;
      } else if (!safeFilename.toLowerCase().endsWith('.mp4')) {
        safeFilename += '.mp4';
      }

      const blob = new Blob([buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.style.display = 'none';
      a.href = url;
      a.download = safeFilename;

      document.body.appendChild(a);

      try {
        a.click();
        console.log(`Download triggered successfully for: ${safeFilename}`);
      } catch (clickError) {
        console.error("Error triggering download click:", clickError);
      }

      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
      }, 30000);
    } catch (e) {
      console.error("ChunkedRecordManager stopAndDownload error:", e);
    }
  }
}

export class RecordManager {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private chunkCount = 0;

  constructor(stream: MediaStream) {
    console.log("Initializing RecordManager (MediaRecorder based)");
    const types = [
      'video/mp4;codecs=h264',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm'
    ];

    let selectedType = '';
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedType = type;
        break;
      }
    }

    console.log("MediaRecorder using type:", selectedType);

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedType,
      videoBitsPerSecond: 5000000 // 5Mbps
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
        this.chunkCount++;
      }
    };
  }

  public getStats() {
    return { chunks: this.chunkCount };
  }

  public start() {
    this.recordedChunks = [];
    this.mediaRecorder?.start(1000); // 1s chunks
    console.log("MediaRecorder started");
  }

  public handleVideoChunk = (_chunk: EncodedVideoChunk, _metadata: EncodedVideoChunkMetadata | undefined) => { };
  public handleAudioChunk = (_chunk: EncodedAudioChunk, _metadata: EncodedAudioChunkMetadata | undefined) => { };

  public stopAndDownload(filename: string = "recording.mp4") {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

    this.mediaRecorder.onstop = () => {
      // By omitting the type, we bypass Chrome's strict MIME-type extension enforcement
      // which occasionally strips extensions if it thinks the blob format contradicts the filename
      const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'video/mp4' });

      const url = URL.createObjectURL(blob);

      let safeFilename = filename
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '');

      if (!safeFilename || safeFilename === '.mp4') {
        safeFilename = `recording-${Date.now()}.mp4`;
      }

      const isWebm = this.mediaRecorder?.mimeType.includes('webm');
      const extension = isWebm ? '.webm' : '.mp4';

      if (!safeFilename.toLowerCase().endsWith('.mp4') && !safeFilename.toLowerCase().endsWith('.webm')) {
        safeFilename += extension;
      } else if (safeFilename.toLowerCase().endsWith('.mp4') && isWebm) {
        safeFilename = safeFilename.replace(/\.mp4$/i, '.webm');
      } else if (safeFilename.toLowerCase().endsWith('.webm') && !isWebm) {
        safeFilename = safeFilename.replace(/\.webm$/i, '.mp4');
      }

      console.log(`Preparing download. Filename: ${safeFilename}, Size: ${blob.size}, Url: ${url}`);

      const a = document.createElement("a");
      a.style.display = 'none';
      a.href = url;
      // Use both property and explicit attribute for maximum compatibility down to older Chromium 
      a.download = safeFilename;
      a.setAttribute('download', safeFilename);

      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
      }, 30000);

      this.recordedChunks = [];
    };

    this.mediaRecorder.stop();
    console.log("MediaRecorder stopped");
  }
}

/**
 * StreamingRecordManager
 * Uses the File System Access API to stream recording data directly to disk.
 * This avoids memory issues for very long recordings.
 * NOTE: .start() MUST be called after a user gesture (e.g., button click).
 */
export class StreamingRecordManager {
  private mediaRecorder: MediaRecorder | null = null;
  private writable: FileSystemWritableFileStream | null = null;
  private isRecording = false;
  private chunkCount = 0;

  constructor(private stream: MediaStream) {
    console.log("Initializing StreamingRecordManager (File System Access API)");
  }

  public async start(baseName: string = "recording") {
    if (this.isRecording) return;
    this.chunkCount = 0;

    // 1. Identify supported codec and extension BEFORE showing picker
    const types = [
      'video/mp4;codecs=h264',
      'video/webm;codecs=h264',
      'video/webm'
    ];
    let selectedType = '';
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedType = type;
        break;
      }
    }

    const isWebm = selectedType.includes('webm');
    const extension = isWebm ? '.webm' : '.mp4';
    const suggestedName = baseName.toLowerCase().endsWith(extension)
      ? baseName
      : `${baseName}${extension}`;

    try {
      // 2. Request file handle from user (requires user gesture)
      // @ts-ignore - showSaveFilePicker is not in all type definitions yet
      const fileHandle = await window.showSaveFilePicker({
        suggestedName,
        types: [{
          description: isWebm ? 'WebM Video' : 'MP4 Video',
          accept: isWebm ? { 'video/webm': ['.webm'] } : { 'video/mp4': ['.mp4'] },
        }],
      });

      // 3. Create a writable stream
      this.writable = await fileHandle.createWritable();

      console.log("StreamingRecordManager using type:", selectedType);
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: selectedType,
        videoBitsPerSecond: 5000000
      });

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.writable) {
          try {
            await this.writable.write(event.data);
            this.chunkCount++;
          } catch (err) {
            console.error("Failed to write chunk to disk:", err);
            this.stop();
          }
        }
      };

      this.mediaRecorder.onstop = async () => {
        console.log("MediaRecorder stopped, closing file stream...");
        if (this.writable) {
          await this.writable.close();
          this.writable = null;
        }
        this.isRecording = false;
      };

      // 4. Start recording with small intervals to flush to disk frequently
      this.mediaRecorder.start(1000);
      this.isRecording = true;
      console.log("Streaming recording started directly to disk.");
    } catch (err) {
      console.error("StreamingRecordManager failed to start:", err);
      throw err; // Re-throw so UI can handle cancellation or error
    }
  }

  public stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  public handleVideoChunk = (_chunk: EncodedVideoChunk, _metadata: EncodedVideoChunkMetadata | undefined) => { };
  public handleAudioChunk = (_chunk: EncodedAudioChunk, _metadata: EncodedAudioChunkMetadata | undefined) => { };

  public getStats() {
    return { chunks: this.chunkCount };
  }
}


