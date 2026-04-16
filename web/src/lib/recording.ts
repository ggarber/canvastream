/**
 * RecordManager
 * Uses the File System Access API to stream recording data directly to disk.
 * This avoids memory issues for very long recordings.
 * NOTE: .start() MUST be called after a user gesture (e.g., button click).
 */
export class RecordManager {
  private mediaRecorder: MediaRecorder | null = null;
  private writable: FileSystemWritableFileStream | null = null;
  private isRecording = false;
  private chunkCount = 0;
  private recordedBytes = 0;
  private videoFrames = 0;
  private statsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private stream: MediaStream) {
    console.log("Initializing RecordManager (File System Access API)");
  }

  public async start(baseName: string = "recording") {
    if (this.isRecording) return;
    this.chunkCount = 0;
    this.recordedBytes = 0;
    this.videoFrames = 0;

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

      console.log("RecordManager using type:", selectedType);
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: selectedType,
        videoBitsPerSecond: 3000000
      });

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.writable) {
          try {
            await this.writable.write(event.data);
            this.chunkCount++;
            this.recordedBytes += event.data.size;
          } catch (err) {
            console.error("Failed to write chunk to disk:", err);
            this.stop();
          }
        }
      };

      this.mediaRecorder.onstop = async () => {
        console.log("MediaRecorder stopped, closing file stream...");
        this.stopStats();
        if (this.writable) {
          await this.writable.close();
          this.writable = null;
        }
        this.isRecording = false;
      };

      // 4. Start recording with small intervals to flush to disk frequently
      this.mediaRecorder.start(1000);
      this.isRecording = true;
      this.startStats();
      console.log("Recording started directly to disk.");
    } catch (err) {
      console.error("RecordManager failed to start:", err);
      throw err; // Re-throw so UI can handle cancellation or error
    }
  }

  private startStats() {
    let lastBytes = 0;
    let lastFrames = 0;
    
    this.statsInterval = setInterval(() => {
      const bytesDelta = this.recordedBytes - lastBytes;
      const framesDelta = this.videoFrames - lastFrames;
      const bitrate = (bytesDelta * 8) / 10 / 1000; // kbps over 10s
      const fps = framesDelta / 10;
      
      console.log(
        `[RecordManager] Stats (last 10s): ${bitrate.toFixed(2)} kbps @ ${fps.toFixed(2)} fps`
      );
      
      lastBytes = this.recordedBytes;
      lastFrames = this.videoFrames;
    }, 10000);
  }

  private stopStats() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  public stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  // These handlers are called by SessionPage to provide encoded frame counts for stats
  public handleVideoChunk = (_chunk: EncodedVideoChunk, _metadata: EncodedVideoChunkMetadata | undefined) => {
    this.videoFrames++;
  };
  
  public handleAudioChunk = (_chunk: EncodedAudioChunk, _metadata: EncodedAudioChunkMetadata | undefined) => { };

  public getStats() {
    return { 
      // We use videoFrames as "chunks" for the UI warning to be consistent with StreamManager
      chunks: this.videoFrames,
      bytes: this.recordedBytes
    };
  }
}

