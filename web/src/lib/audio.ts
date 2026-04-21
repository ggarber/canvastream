export class AudioMixer {
  private context: AudioContext;
  private destination: MediaStreamAudioDestinationNode;
  private sources: Map<string, MediaStreamAudioSourceNode> = new Map();

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 48000,
    });
    this.destination = this.context.createMediaStreamDestination();
  }

  addStream(id: string, stream: MediaStream) {
    // Check if we already have it
    if (this.sources.has(id)) return;

    const setupSource = () => {
      if (this.sources.has(id)) return;
      if (stream.getAudioTracks().length === 0) return;
      
      try {
        const source = this.context.createMediaStreamSource(stream);
        source.connect(this.destination);
        this.sources.set(id, source);
        console.log(`[AudioMixer] Added stream ${id}`);
      } catch(e) {
        console.error(`[AudioMixer] Failed to add stream ${id}:`, e);
      }
    };

    if (stream.getAudioTracks().length > 0) {
      setupSource();
    } else {
      // In case we receive the stream before the audio track is added (e.g. WebRTC)
      stream.addEventListener('addtrack', () => {
        if (!this.sources.has(id) && stream.getAudioTracks().length > 0) {
          setupSource();
        }
      });
    }
  }

  removeStream(id: string) {
    const source = this.sources.get(id);
    if (source) {
      source.disconnect();
      this.sources.delete(id);
      console.log(`[AudioMixer] Removed stream ${id}`);
    }
  }

  getMixedStream(): MediaStream {
    return this.destination.stream;
  }
  
  resume() {
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  close() {
    this.sources.forEach(source => source.disconnect());
    this.sources.clear();
    this.context.close();
  }
}
