export function setupSharedVideoEncoder(
  onChunk: (chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata | undefined) => void
) {
  const encoder = new VideoEncoder({
    output: onChunk,
    error: (e) => console.error("VideoEncoder error: ", e),
  });
  
  encoder.configure({
    codec: "avc1.42E01F", // Baseline profile
    width: 1280,
    height: 720,
    bitrate: 2_500_000,
    framerate: 30,
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

  encoder.configure({
    codec: "mp4a.40.2",
    numberOfChannels: settings.channelCount || 1,
    sampleRate: settings.sampleRate || 44100,
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
