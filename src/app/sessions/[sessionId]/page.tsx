"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { User, StopCircle, PlayCircle, Monitor, Image as ImageIcon, Layout as LayoutIcon, LayoutGrid, Presentation, Check, ChevronDown, Users, Copy, X, Link as LinkIcon, Circle, MessageSquare, Settings2, ChevronLeft, ChevronRight, Pencil, Mic, MicOff, Video, VideoOff, AlertCircle } from "lucide-react";
import { useParams } from "next/navigation";
import Chat, { Message } from "@/components/Chat";
import Debug from "@/components/Debug";
import Guests from "@/components/Guests";
import { LAYOUTS, Layout, Placeholder } from "@/types/layout";
import { setupSharedVideoEncoder, setupSharedAudioEncoder } from "@/lib/encoding";
import { StreamManager } from "@/lib/streaming";
import { StreamingRecordManager } from "@/lib/recording";
import { StreamConnection, StreamConnectionStatus } from "@/lib/webrtc";
import { AudioMixer } from "@/lib/audio";

const COOL_NAMES = [
  "Neon Phoenix", "Turbo Shadow", "Cyber Wolf", "Quantum Pulse", 
  "Solar Flare", "Static Void", "Arctic Byte", "Cobalt Storm", 
  "Digital Ghost", "Echo Spark", "Midnight Rider", "Lunar Blade",
  "Prism Ray", "Obsidian Core", "Vortex Shadow"
];

export default function SessionPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [stats, setStats] = useState({ recordedChunks: 0, streamedChunks: 0 });
  const [pollCount, setPollCount] = useState(0);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [currentLayout, setCurrentLayout] = useState<Layout>(LAYOUTS[0]);
  const [assignedSlots, setAssignedSlots] = useState<{ source: string; placeholder: Placeholder }[]>([]);
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const params = useParams();
  const sessionId = params.sessionId as string;
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [userName, setUserName] = useState<string>("");
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [streams, setStreams] = useState<Record<string, { streamId: string, source: string; from: string }>>({});
  const [myClientId, setMyClientId] = useState<string | null>(null);
  const [streamConnectionsStatus, setStreamConnectionsStatus] = useState<Record<string, string>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [activeTab, setActiveTab] = useState<'chat' | 'debug' | 'guests'>('chat');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [sessionState, setSessionState] = useState<any>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [dragInfo, setDragInfo] = useState<{
    index: number;
    type: 'move' | 'resize';
    edge?: string;
    startX: number;
    startY: number;
    startPlaceholder: Placeholder;
  } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const [rtmpUrl, setRtmpUrl] = useState<string>("");
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const interactionRequiredElements = useRef<HTMLVideoElement[]>([]);


  const socketRef = useRef<WebSocket | null>(null);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const videoEncoderRef = useRef<VideoEncoder | null>(null);
  const audioEncoderRef = useRef<AudioEncoder | null>(null);
  const streamManagerRef = useRef<StreamManager | null>(null);
  const recordManagerRef = useRef<StreamingRecordManager | null>(null);
  const streamConnectionsRef = useRef<Record<string, StreamConnection>>({});
  const audioEncoderSetupRef = useRef<{ close: () => void, settings: any } | null>(null);
  const lastVideoConfigRef = useRef<ArrayBuffer | null>(null);
  const lastAudioConfigRef = useRef<ArrayBuffer | null>(null);
  const frameCountRef = useRef(0);
  const animationIdRef = useRef<number | null>(null);
  const streamStartTimeRef = useRef<number | null>(null);
  const audioMixerRef = useRef<AudioMixer | null>(null);

  const getAudioMixer = useCallback(() => {
    if (!audioMixerRef.current) {
      audioMixerRef.current = new AudioMixer();
    }
    return audioMixerRef.current;
  }, []);
  
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Ball state in refs to prevent resetting on re-renders/effect restarts
  const ballState = useRef({ x: 320, y: 240, dx: 3, dy: 3 });

  const cameraStreamIdRef = useRef<string | null>(null);
  const screenStreamIdRef = useRef<string | null>(null);
  const myClientIdRef = useRef<string | null>(null);
  const remoteVideosRef = useRef<Record<string, HTMLVideoElement>>({});

  // Load RTMP URL from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("canvastream_rtmp_url");
    if (saved) setRtmpUrl(saved);
  }, []);

  const handleInteractionRetry = useCallback(async () => {
    setShowInteractionModal(false);
    getAudioMixer().resume();
    
    const elements = [...interactionRequiredElements.current];
    interactionRequiredElements.current = [];
    
    for (const el of elements) {
      try {
        await el.play();
      } catch (err) {
        console.error("Retry play failed:", err);
      }
    }
  }, [getAudioMixer]);

  // Map sources to layout placeholders
  useEffect(() => {
    const activeSources: { type: string; id: string }[] = [];
    
    // Local sources
    if (isScreenSharing) activeSources.push({ type: "screen", id: "screen" });
    if (isCameraActive) activeSources.push({ type: "camera", id: "camera" });
    
    // Remote sources
    Object.values(streams).forEach(stream => {
      if (stream.from !== myClientId) {
        if (stream.source === "display") {
          activeSources.push({ type: "screen", id: stream.streamId });
        } else {
          activeSources.push({ type: "remote", id: stream.streamId });
        }
      }
    });
    
    const assignments: { source: string; placeholder: Placeholder }[] = [];
    const usedSourceIds = new Set<string>();

    // Pass 1: Specific tags (excluding "any")
    currentLayout.placeholders.forEach((placeholder) => {
      const specificTags = placeholder.tags.filter(t => t !== "any");
      const matchingSource = activeSources.find(s => !usedSourceIds.has(s.id) && specificTags.includes(s.type as any));
      if (matchingSource) {
        assignments.push({ source: matchingSource.id, placeholder });
        usedSourceIds.add(matchingSource.id);
      }
    });

    // Pass 2: "any" tag
    currentLayout.placeholders.forEach((placeholder) => {
      if (assignments.some(a => a.placeholder === placeholder)) return;

      if (placeholder.tags.includes("any")) {
        const matchingSource = activeSources.find(s => !usedSourceIds.has(s.id));
        if (matchingSource) {
          assignments.push({ source: matchingSource.id, placeholder });
          usedSourceIds.add(matchingSource.id);
        } else if (currentLayout.id === "2x2") {
          // Fill grid with animation if empty
          assignments.push({ source: "animation", placeholder });
        }
      }
    });

    setAssignedSlots(assignments);
  }, [isCameraActive, isScreenSharing, currentLayout, streams, myClientId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const time = Date.now() / 1000;
      const { width, height } = canvas;

      const drawStaticBackground = (qx: number, qy: number, qw: number, qh: number) => {
        // Main gradient: Deep, professional blue
        const gradient = ctx.createLinearGradient(qx, qy, qx + qw, qy + qh);
        gradient.addColorStop(0, "#001a3d"); 
        gradient.addColorStop(0.4, "#00428a"); 
        gradient.addColorStop(0.7, "#0060ad"); 
        gradient.addColorStop(1, "#001a3d"); 
        ctx.fillStyle = gradient;
        ctx.fillRect(qx, qy, qw, qh);

        // Bloom Glow 1: Top-right light blue highlight
        const bloom1 = ctx.createRadialGradient(
          qx + qw * 0.8, qy + qh * 0.2, 0,
          qx + qw * 0.8, qy + qh * 0.2, qw * 0.8
        );
        bloom1.addColorStop(0, "rgba(0, 120, 212, 0.2)");
        bloom1.addColorStop(0.5, "rgba(0, 120, 212, 0.05)");
        bloom1.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = bloom1;
        ctx.fillRect(qx, qy, qw, qh);

        // Bloom Glow 2: Bottom-left subtle purple/blue tint
        const bloom2 = ctx.createRadialGradient(
          qx + qw * 0.2, qy + qh * 0.9, 0,
          qx + qw * 0.2, qy + qh * 0.9, qw * 0.6
        );
        bloom2.addColorStop(0, "rgba(58, 110, 165, 0.15)");
        bloom2.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = bloom2;
        ctx.fillRect(qx, qy, qw, qh);

        // Subtle noise/grain texture (optional, but premium)
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = "rgba(255, 255, 255, 0.01)";
        for (let i = 0; i < 50; i++) {
          ctx.fillRect(qx + Math.random() * qw, qy + Math.random() * qh, 2, 2);
        }
        ctx.globalCompositeOperation = "source-over";
      };
      
      // 1. Draw Background (Cover style) or Base Animation
      if (bgImage) {
        const srt = bgImage.width / bgImage.height;
        const drt = width / height;
        let sw, sh, sx, sy;
        if (srt > drt) {
          sh = bgImage.height;
          sw = bgImage.height * drt;
          sx = (bgImage.width - sw) / 2;
          sy = 0;
        } else {
          sw = bgImage.width;
          sh = bgImage.width / drt;
          sx = 0;
          sy = (bgImage.height - sh) / 2;
        }
        ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, width, height);
      } else {
        // Draw static background if no background image
        drawStaticBackground(0, 0, width, height);
      }

      // 2. Draw Layout Placeholders
      currentLayout.placeholders.forEach((placeholder) => {
        const { x, y, width: qw, height: qh, rounded } = placeholder;
        const assignment = assignedSlots.find(a => a.placeholder === placeholder);
        const source = assignment?.source;

        const drawWithStyle = (el: HTMLVideoElement | HTMLCanvasElement, fit: "contain" | "cover") => {
          ctx.save();
          if (rounded) {
            ctx.beginPath();
            ctx.roundRect(x, y, qw, qh, 12);
            ctx.clip();
          }

          let imgWidth = 0;
          let imgHeight = 0;
          if (el instanceof HTMLVideoElement) {
            imgWidth = el.videoWidth;
            imgHeight = el.videoHeight;
          } else {
            imgWidth = el.width;
            imgHeight = el.height;
          }

          if (imgWidth === 0 || imgHeight === 0) {
            ctx.restore();
            return;
          }

          const imgRatio = imgWidth / imgHeight;
          const targetRatio = qw / qh;

          if (fit === "cover") {
            let sx, sy, sw, sh;
            if (imgRatio > targetRatio) {
              sh = imgHeight;
              sw = sh * targetRatio;
              sx = (imgWidth - sw) / 2;
              sy = 0;
            } else {
              sw = imgWidth;
              sh = sw / targetRatio;
              sx = 0;
              sy = (imgHeight - sh) / 2;
            }
            ctx.drawImage(el, sx, sy, sw, sh, x, y, qw, qh);
          } else {
            // contain
            let dw, dh, dx, dy;
            if (imgRatio > targetRatio) {
              dw = qw;
              dh = qw / imgRatio;
              dx = x;
              dy = y + (qh - dh) / 2;
            } else {
              dh = qh;
              dw = qh * imgRatio;
              dx = x + (qw - dw) / 2;
              dy = y;
            }
            ctx.drawImage(el, dx, dy, dw, dh);
          }
          ctx.restore();
        };

        if (source === "camera" && isCameraActive && previewVideoRef.current && previewVideoRef.current.readyState >= 2) {
          drawWithStyle(previewVideoRef.current, "cover");
        } else if (source === "screen" && isScreenSharing && screenVideoRef.current && screenVideoRef.current.readyState >= 2) {
          drawWithStyle(screenVideoRef.current, "contain");
        } else if (source && remoteVideosRef.current[source] && remoteVideosRef.current[source].readyState >= 2) {
          // Check if it's a remote stream or remote screen
          const streamInfo = streams[source];
          drawWithStyle(remoteVideosRef.current[source], streamInfo?.source === "display" ? "contain" : "cover");
        } else if (source === "animation") {
          // Skip drawing per-quadrant background, as it's already drawn for the whole canvas
        } else if (currentLayout.id !== "presentation" && (placeholder.tags.includes("camera") || placeholder.tags.includes("remote"))) {
          // Draw a placeholder box for small video slots if empty, but only if not in presentation layout
          ctx.save();
          if (rounded) {
            ctx.beginPath();
            ctx.roundRect(x, y, qw, qh, 12);
            ctx.clip();
          }
          ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
          ctx.fillRect(x, y, qw, qh);
          ctx.restore();
        }
      });

      // 3. Encoding & Streaming
      if ((isStreaming || isRecording) && videoEncoderRef.current && canvasRef.current) {
        const timestamp = performance.now() * 1000;
        const frame = new VideoFrame(canvasRef.current, { timestamp });
        const keyFrame = frameCountRef.current % 30 === 0;
        if (videoEncoderRef.current.state === "configured") {
            videoEncoderRef.current.encode(frame, { keyFrame });
        }
        frame.close();
        frameCountRef.current++;
      }

      animationIdRef.current = requestAnimationFrame(draw);
    };

    animationIdRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    };
  }, [isStreaming, isRecording, isCameraActive, isScreenSharing, assignedSlots, currentLayout, bgImage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => setBgImage(img);
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleMute = () => {
    if (mediaStreamRef.current) {
      const audioTracks = mediaStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(prev => !prev);
    }
  };

  const toggleVideo = () => {
    if (mediaStreamRef.current) {
      const videoTracks = mediaStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(prev => !prev);
    }
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      if (sessionSocketRef.current?.readyState === WebSocket.OPEN && cameraStreamIdRef.current) {
        sessionSocketRef.current.send(JSON.stringify({
          type: "DESTROY_STREAM",
          requestId: Math.random().toString(36).substr(2, 9),
          data: { streamId: cameraStreamIdRef.current }
        }));
      }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
      setIsCameraActive(false);
      cameraStreamIdRef.current = null;
      getAudioMixer().removeStream('camera');
      setIsMuted(false);
      setIsVideoOff(false);
      if (audioEncoderSetupRef.current) {
        audioEncoderSetupRef.current.close();
        audioEncoderSetupRef.current = null;
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        mediaStreamRef.current = stream;
        setIsCameraActive(true);
        setIsMuted(false);
        setIsVideoOff(false);
        getAudioMixer().resume();
        getAudioMixer().addStream('camera', stream);
        if (sessionSocketRef.current?.readyState === WebSocket.OPEN) {
          sessionSocketRef.current.send(JSON.stringify({
            type: "CREATE_STREAM",
            requestId: Math.random().toString(36).substr(2, 9),
            data: { source: "camera" }
          }));
        }
        if (isStreaming || isRecording) {
            startEncodersIfNeeded();
        }
      } catch (err) {
        console.error("Failed to get user media", err);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (sessionSocketRef.current?.readyState === WebSocket.OPEN && screenStreamIdRef.current) {
        sessionSocketRef.current.send(JSON.stringify({
          type: "DESTROY_STREAM",
          requestId: Math.random().toString(36).substr(2, 9),
          data: { streamId: screenStreamIdRef.current }
        }));
      }
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      screenStreamIdRef.current = null;
      getAudioMixer().removeStream('screen');
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = stream;
        setIsScreenSharing(true);
        getAudioMixer().resume();
        getAudioMixer().addStream('screen', stream);
        if (sessionSocketRef.current?.readyState === WebSocket.OPEN) {
          sessionSocketRef.current.send(JSON.stringify({
            type: "CREATE_STREAM",
            requestId: Math.random().toString(36).substr(2, 9),
            data: { source: "display" }
          }));
        }
        stream.getVideoTracks()[0].onended = () => {
          if (sessionSocketRef.current?.readyState === WebSocket.OPEN && screenStreamIdRef.current) {
            sessionSocketRef.current.send(JSON.stringify({
              type: "DESTROY_STREAM",
              requestId: Math.random().toString(36).substr(2, 9),
              data: { streamId: screenStreamIdRef.current }
            }));
          }
          setIsScreenSharing(false);
          screenStreamIdRef.current = null;
          getAudioMixer().removeStream('screen');
        };
      } catch (err) {
        console.error("Failed to display media", err);
      }
    }
  };

  useEffect(() => {
    if (previewVideoRef.current && mediaStreamRef.current) {
      previewVideoRef.current.srcObject = mediaStreamRef.current;
      previewVideoRef.current.play().catch(e => {
        if (e.name === 'NotAllowedError') {
          setShowInteractionModal(true);
          if (!interactionRequiredElements.current.includes(previewVideoRef.current!)) {
            interactionRequiredElements.current.push(previewVideoRef.current!);
          }
        }
        console.error("Video play failed", e);
      });
    }
  }, [isCameraActive, mediaStreamRef.current]);

  useEffect(() => {
    if (screenVideoRef.current && screenStreamRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
      screenVideoRef.current.play().catch(e => {
        if (e.name === 'NotAllowedError') {
          setShowInteractionModal(true);
          if (!interactionRequiredElements.current.includes(screenVideoRef.current!)) {
            interactionRequiredElements.current.push(screenVideoRef.current!);
          }
        }
        console.error("Screen play failed", e);
      });
    }
  }, [isScreenSharing, screenStreamRef.current]);

  const startEncodersIfNeeded = () => {
    const handleVideoChunk = (chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata | undefined) => {
      if (metadata?.decoderConfig?.description) {
        lastVideoConfigRef.current = metadata.decoderConfig.description as ArrayBuffer;
      }
      if (streamManagerRef.current) streamManagerRef.current.handleVideoChunk(chunk, metadata);
      if (recordManagerRef.current) recordManagerRef.current.handleVideoChunk(chunk, metadata);
    };

    const handleAudioChunk = (chunk: EncodedAudioChunk, metadata: EncodedAudioChunkMetadata | undefined) => {
      if (metadata?.decoderConfig?.description) {
        lastAudioConfigRef.current = metadata.decoderConfig.description as ArrayBuffer;
      }
      if (streamManagerRef.current && audioEncoderSetupRef.current) {
        streamManagerRef.current.handleAudioChunk(chunk, metadata, audioEncoderSetupRef.current.settings);
      }
      if (recordManagerRef.current) {
        recordManagerRef.current.handleAudioChunk(chunk, metadata);
      }
    };

    if (!videoEncoderRef.current) {
      videoEncoderRef.current = setupSharedVideoEncoder(handleVideoChunk);
    }
    
    if (getAudioMixer().getMixedStream() && !audioEncoderSetupRef.current) {
      audioEncoderSetupRef.current = setupSharedAudioEncoder(getAudioMixer().getMixedStream(), handleAudioChunk);
    }
  };

  const startStreaming = async () => {
    if (!rtmpUrl) {
      setIsSettingsOpen(true);
      return;
    }
    setStreamingError(null);
    setIsConnecting(true);
    const sm = new StreamManager(
      sessionId,
      () => {
        setIsStreaming(true);
        setIsConnecting(false);
        setStreamingError(null);
        startEncodersIfNeeded();
      },
      (msg) => {
        setStreamingError(msg);
        stopStreaming();
      },
      () => {
        stopStreaming();
      },
      rtmpUrl,
      lastVideoConfigRef.current || undefined,
      lastAudioConfigRef.current || undefined
    );
    streamManagerRef.current = sm;
  };

  useEffect(() => {
    if (!sessionId) return;

    // Pick a random name if not already set
    const name = userName || COOL_NAMES[Math.floor(Math.random() * COOL_NAMES.length)];
    if (!userName) {
      setUserName(name);
      return;
    }

    let reconnectCount = 0;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let messageTimeout: ReturnType<typeof setTimeout>;
    const sessionStartTime = Date.now();
    const MAX_RECONNECT_DURATION = 60 * 60 * 1000; // 60 minutes
    const HEARTBEAT_INTERVAL = 30000;
    const INACTIVITY_TIMEOUT = 60000;
    let heartbeatInterval: ReturnType<typeof setInterval>;

    const connect = () => {
      if (Date.now() - sessionStartTime > MAX_RECONNECT_DURATION) {
        console.log("Max reconnection duration reached. Stopping retries.");
        return;
      }

      console.log(`Connecting to session... (Attempt ${reconnectCount + 1})`);
      const sessionWs = new WebSocket(`ws://localhost:3003/session/${sessionId}`);
      sessionSocketRef.current = sessionWs;
      setSessionStatus('connecting');

      const resetMessageTimeout = () => {
        if (messageTimeout) clearTimeout(messageTimeout);
        messageTimeout = setTimeout(() => {
          console.warn(`No message received for ${INACTIVITY_TIMEOUT/1000}s, disconnecting and reconnecting...`);
          if (sessionWs.readyState === WebSocket.OPEN) {
            sessionWs.close();
          }
        }, INACTIVITY_TIMEOUT);
      };

      sessionWs.onopen = () => {
        console.log(`Session connected: ${sessionId} as ${name}`);
        setSessionStatus('connected');
        const requestId = "init-" + Math.random().toString(36).substr(2, 9);
        sessionWs.send(JSON.stringify({ 
          type: "connect", 
          requestId,
          name: name 
        }));
        reconnectCount = 0; // Reset count on successful connection
        resetMessageTimeout();
        
        heartbeatInterval = setInterval(() => {
          if (sessionWs.readyState === WebSocket.OPEN) {
            sessionWs.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, HEARTBEAT_INTERVAL);
      };

      sessionWs.onmessage = (e) => {
        resetMessageTimeout();
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "chat") {
            setMessages(prev => [...prev, {
              id: Math.random().toString(36).substr(2, 9),
              text: msg.data.text,
              sender: msg.fromName || msg.from || "External",
              timestamp: Date.now(),
              isMe: false
            }]);
          } else if (msg.type === "CONNECTED") {
            setParticipants(prev => ({
              ...prev,
              [msg.from]: msg.fromName || msg.name || "Unknown"
            }));
          } else if (msg.type === "DISCONNECTED") {
            setParticipants(prev => {
              const next = { ...prev };
              delete next[msg.from];
              return next;
            });
            // Also cleanup streams of this participant
            setStreams(prev => {
              const next = { ...prev };
              Object.keys(next).forEach(id => {
                if (next[id].from === msg.from) {
                  delete next[id];
                }
              });
              return next;
            });
            // Cleanup connections related to this participant
            Object.keys(streamConnectionsRef.current).forEach(key => {
              if (key.startsWith(`${msg.from}||`)) {
                streamConnectionsRef.current[key].close();
                delete streamConnectionsRef.current[key];
                setStreamConnectionsStatus(prev => {
                  const next = { ...prev };
                  delete next[key];
                  return next;
                });
                // Cleanup remote video
                const streamIdPart = key.split('||')[1];
                if (audioMixerRef.current) audioMixerRef.current.removeStream(streamIdPart);
                if (remoteVideosRef.current[streamIdPart]) {
                  remoteVideosRef.current[streamIdPart].srcObject = null;
                  delete remoteVideosRef.current[streamIdPart];
                }
                setRemoteStreams(prev => {
                  const next = { ...prev };
                  delete next[streamIdPart];
                  return next;
                });
              }
            });
          } else if (msg.type === "STREAM_DESTROYED") {
            const streamId = msg.data.streamId;
            setStreams(prev => {
              const next = { ...prev };
              delete next[streamId];
              return next;
            });
            // Cleanup connection
            Object.keys(streamConnectionsRef.current).forEach(key => {
              if (key.endsWith(`||${streamId}`)) {
                streamConnectionsRef.current[key].close();
                delete streamConnectionsRef.current[key];
                setStreamConnectionsStatus(prev => {
                  const next = { ...prev };
                  delete next[key];
                  return next;
                });
                // Cleanup remote video
                if (audioMixerRef.current) audioMixerRef.current.removeStream(streamId);
                if (remoteVideosRef.current[streamId]) {
                  remoteVideosRef.current[streamId].srcObject = null;
                  delete remoteVideosRef.current[streamId];
                }
                setRemoteStreams(prev => {
                  const next = { ...prev };
                  delete next[streamId];
                  return next;
                });
              }
            });
          } else if (msg.type === "STREAM_CREATED") {
            const stream = msg.data;
            console.log("STREAM_CREATED received:", stream);
            setStreams(prev => ({
              ...prev,
              [stream.streamId]: stream
            }));
            
            console.log(`[Signaling] Comparing stream.from (${stream.from}) with myClientIdRef.current (${myClientIdRef.current})`);
            
            // If it's my stream, store the ID
            if (stream.from === myClientIdRef.current) {
                console.log(`[Signaling] Received our own stream ${stream.streamId}, skipping WebRTC initiation`);
                if (stream.source === "camera") cameraStreamIdRef.current = stream.streamId;
                if (stream.source === "display") screenStreamIdRef.current = stream.streamId;
            } else {
              // We are the receiver, initiate connection
              const key = `${stream.from}||${stream.streamId}`;
              if (!streamConnectionsRef.current[key]) {
                const conn = new StreamConnection(
                  stream.streamId,
                  stream.from,
                  true,
                  (status) => {
                    setStreamConnectionsStatus(prev => ({ ...prev, [key]: status }));
                  },
                  (track, remoteStream) => {
                    console.log(`[WebRTC] Received remote track for ${stream.streamId} from ${stream.from}`);
                    if (!remoteVideosRef.current[stream.streamId]) {
                      const video = document.createElement('video');
                      video.autoplay = true;
                      video.playsInline = true;
                      video.srcObject = remoteStream;
                      // We don't need to add it to the DOM, but we need it to play
                      video.onloadedmetadata = () => {
                        video.play().catch(e => {
                          if (e.name === 'NotAllowedError') {
                            setShowInteractionModal(true);
                            if (!interactionRequiredElements.current.includes(video)) {
                              interactionRequiredElements.current.push(video);
                            }
                          }
                        });
                      };
                      remoteVideosRef.current[stream.streamId] = video;
                    }
                    setRemoteStreams(prev => ({ ...prev, [stream.streamId]: remoteStream }));
                    getAudioMixer().addStream(stream.streamId, remoteStream);
                  }
                );
                console.log(`[Signaling] Initiating connection for stream ${stream.streamId} from ${stream.from}`);
                streamConnectionsRef.current[key] = conn;
                conn.createOffer().then(offer => {
                  console.log(`[Signaling] Sending OFFER to ${stream.from} for stream ${stream.streamId}`);
                  sessionWs.send(JSON.stringify({
                    type: "OFFER",
                    to: stream.from,
                    data: { streamId: stream.streamId, sdp: offer }
                  }));
                }).catch(err => {
                  console.error(`[Signaling] Failed to create OFFER for ${stream.streamId}:`, err);
                });
              } else {
                console.log(`[Signaling] Connection already exists for stream ${stream.streamId}`);
              }
            }
          } else if (msg.type === "response") {
            if (msg.data?.status === "connected") {
                console.log(`[Signaling] Registered with connectionId: ${msg.data.connectionId}`);
                myClientIdRef.current = msg.data.connectionId;
                setMyClientId(msg.data.connectionId);
            }
            // For CREATE_STREAM/DESTROY_STREAM responses, we rely on the broadcast for state
          } else if (msg.type === "SESSION_STATE") {
            setSessionState(msg.data);
            if (msg.data.layout) {
              const layout = LAYOUTS.find(l => l.id === msg.data.layout);
              if (layout) {
                if (msg.data.placeholders) {
                  setCurrentLayout({ ...layout, placeholders: msg.data.placeholders });
                } else {
                  setCurrentLayout(layout);
                }
              }
            }
          } else if (msg.type === "OFFER") {
            const { streamId, sdp } = msg.data;
            const from = msg.from;
            const key = `${from}||${streamId}`;
            console.log(`OFFER received from ${from} for stream ${streamId}`);
            
            if (!streamConnectionsRef.current[key]) {
              const conn = new StreamConnection(
                streamId,
                from,
                false,
                (status) => {
                  setStreamConnectionsStatus(prev => ({ ...prev, [key]: status }));
                },
                (track, remoteStream) => {
                  console.log(`[WebRTC] Received remote track for ${streamId} from ${from}`);
                  if (!remoteVideosRef.current[streamId]) {
                    const video = document.createElement('video');
                    video.autoplay = true;
                    video.playsInline = true;
                    video.srcObject = remoteStream;
                    video.onloadedmetadata = () => {
                      video.play().catch(e => {
                        if (e.name === 'NotAllowedError') {
                          setShowInteractionModal(true);
                          if (!interactionRequiredElements.current.includes(video)) {
                            interactionRequiredElements.current.push(video);
                          }
                        }
                      });
                    };
                    remoteVideosRef.current[streamId] = video;
                  }
                  setRemoteStreams(prev => ({ ...prev, [streamId]: remoteStream }));
                  getAudioMixer().addStream(streamId, remoteStream);
                }
              );
              streamConnectionsRef.current[key] = conn;

              // We are the sender, attach our stream if we have it
              let myStream: MediaStream | null = null;
              if (streamId === cameraStreamIdRef.current) myStream = mediaStreamRef.current;
              else if (streamId === screenStreamIdRef.current) myStream = screenStreamRef.current;
              
              if (!myStream) {
                console.warn(`[Signaling] Received OFFER for unknown streamId: ${streamId}. Cannot send ANSWER.`);
                // We'll still keep the connection object but it won't have tracks
              }

              conn.handleOffer(sdp, myStream || undefined).then(answer => {
                console.log(`[Signaling] Sending ANSWER to ${from} for stream ${streamId}`);
                sessionWs.send(JSON.stringify({
                  type: "ANSWER",
                  to: from,
                  data: { streamId, sdp: answer }
                }));
              }).catch(err => {
                console.error(`[Signaling] Failed to handle OFFER from ${from}:`, err);
              });
            } else {
              console.log(`[Signaling] Already have a connection for ${key}, ignoring new OFFER`);
            }
          } else if (msg.type === "ANSWER") {
            const { streamId, sdp } = msg.data;
            const from = msg.from;
            const key = `${from}||${streamId}`;
            console.log(`[Signaling] ANSWER received from ${from} for stream ${streamId}`);
            const conn = streamConnectionsRef.current[key];
            if (conn) {
              conn.handleAnswer(sdp).then(() => {
                console.log(`[Signaling] Connected to stream ${streamId} via WebRTC`);
              }).catch(err => {
                console.error(`[Signaling] Failed to finalize WebRTC connection for ${streamId}:`, err);
              });
            } else {
              console.warn(`[Signaling] Received ANSWER from ${from} but no pending connection for ${key}`);
            }
          }
        } catch (err) {
          console.error("Failed to parse session message", err);
        }
      };

      sessionWs.onclose = () => {
        console.log(`Session disconnected: ${sessionId}`);
        setSessionStatus('disconnected');
        sessionSocketRef.current = null;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (messageTimeout) clearTimeout(messageTimeout);

        // Calculate next retry delay: 0, 1s, 2s, 4s, 8s, 16s, 32s, 60s
        const delay = reconnectCount === 0 ? 0 : Math.min(60000, Math.pow(2, reconnectCount - 1) * 1000);
        console.log(`Retrying connection in ${delay}ms... (Attempt ${reconnectCount + 1})`);
        
        reconnectTimeout = setTimeout(() => {
          reconnectCount++;
          connect();
        }, delay);
      };

      sessionWs.onerror = (err) => {
        console.error(`Session error:`, err);
        // onclose will be called after onerror, handling retry there
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (messageTimeout) clearTimeout(messageTimeout);
      if (sessionSocketRef.current) {
        sessionSocketRef.current.onclose = null;
        sessionSocketRef.current.onerror = null;
        sessionSocketRef.current.close();
      }
      setSessionStatus('disconnected');
    };
  }, [sessionId, userName]);

  // Expose session info globally
  useEffect(() => {
    (window as any).__SESSION = {
      sessionId,
      userName,
      participants,
      streams,
      myClientId,
      sessionStatus,
      sessionState
    };
  }, [sessionId, userName, participants, streams, myClientId, sessionStatus]);

  const handleSendMessage = useCallback((text: string) => {
    if (sessionSocketRef.current?.readyState === WebSocket.OPEN) {
      const payload = {
        type: "chat",
        data: { text }
      };
      console.log("Sending chat message:", payload);
      sessionSocketRef.current.send(JSON.stringify(payload));

      // Add to local view immediately
      setMessages(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        text,
        sender: "Me",
        timestamp: Date.now(),
        isMe: true
      }]);
    }
  }, []);

  const stopStreaming = () => {
    setIsStreaming(false);
    setIsConnecting(false);
    if (streamManagerRef.current) {
      streamManagerRef.current.stop();
      streamManagerRef.current = null;
    }
  };

  const startRecording = async () => {
    console.log("Starting streaming recording process...");
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Capture canvas stream at 30fps
    // @ts-ignore - captureStream might not be in all TS sets
    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getTracks()];

    // Add audio tracks if available from the camera/mic stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        tracks.push(track);
      });
    }

    const combinedStream = new MediaStream(tracks);
    const rm = new StreamingRecordManager(combinedStream);
    
    try {
      // Accessing the file system requires a user gesture, which we have here from the button click
      await rm.start(`session-${sessionId}`);
      recordManagerRef.current = rm;
      setIsRecording(true);
      startEncodersIfNeeded();
    } catch (err) {
        console.error("Recording start failed or was cancelled:", err);
    }
  };

  const stopRecording = () => {
    console.log("Stopping recording process...");
    if (recordManagerRef.current) {
      recordManagerRef.current.stop();
      recordManagerRef.current = null;
    }
    setIsRecording(false);
  };

  const handleMouseDown = (e: React.MouseEvent, index: number, type: 'move' | 'resize', edge?: string) => {
    if (!isEditMode) return;
    const placeholder = currentLayout.placeholders[index];
    setDragInfo({
      index,
      type,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startPlaceholder: { ...placeholder }
    });
    e.stopPropagation();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragInfo) return;

    const dx = (e.clientX - dragInfo.startX) * (1280 / (canvasRef.current?.clientWidth || 1280));
    const dy = (e.clientY - dragInfo.startY) * (720 / (canvasRef.current?.clientHeight || 720));

    const newPlaceholders = [...currentLayout.placeholders];
    const p = { ...dragInfo.startPlaceholder };

    if (dragInfo.type === 'move') {
      p.x = Math.max(0, Math.min(1280 - p.width, p.x + dx));
      p.y = Math.max(0, Math.min(720 - p.height, p.y + dy));
    } else if (dragInfo.type === 'resize' && dragInfo.edge) {
      if (dragInfo.edge.includes('e')) p.width = Math.max(50, p.width + dx);
      if (dragInfo.edge.includes('s')) p.height = Math.max(50, p.height + dy);
      if (dragInfo.edge.includes('w')) {
        const newWidth = Math.max(50, p.width - dx);
        p.x = p.x + (p.width - newWidth);
        p.width = newWidth;
      }
      if (dragInfo.edge.includes('n')) {
        const newHeight = Math.max(50, p.height - dy);
        p.y = p.y + (p.height - newHeight);
        p.height = newHeight;
      }
    }

    newPlaceholders[dragInfo.index] = p;
    const updatedLayout = { ...currentLayout, placeholders: newPlaceholders };
    setCurrentLayout(updatedLayout);

    // Sync state if connected
    if (sessionSocketRef.current?.readyState === WebSocket.OPEN) {
        sessionSocketRef.current.send(JSON.stringify({
            type: "SESSION_STATE",
            data: { 
                layout: currentLayout.id,
                placeholders: newPlaceholders
            }
        }));
    }
  };

  const handleMouseUp = () => {
    setDragInfo(null);
  };

  useEffect(() => {
    if (!isStreaming && !isRecording) {
      if (videoEncoderRef.current && videoEncoderRef.current.state !== 'closed') {
        videoEncoderRef.current.close();
      }
      videoEncoderRef.current = null;
      if (audioEncoderSetupRef.current) {
        audioEncoderSetupRef.current.close();
        audioEncoderSetupRef.current = null;
      }
      frameCountRef.current = 0;
    }
  }, [isStreaming, isRecording]);
  
  // Stats polling
  useEffect(() => {
    if (!isStreaming && !isRecording) {
      setStats({ recordedChunks: 0, streamedChunks: 0 });
      setPollCount(0);
      return;
    }

    const updateStats = () => {
      setStats({
        recordedChunks: recordManagerRef.current?.getStats().chunks ?? 0,
        streamedChunks: streamManagerRef.current?.getStats().chunks ?? 0
      });
      setPollCount(prev => prev + 1);
    };

    const interval = setInterval(updateStats, 5000);

    return () => clearInterval(interval);
  }, [isStreaming, isRecording]);

  return (
    <main className="flex flex-col h-screen bg-white text-gray-900 font-sans selection:bg-blue-500/30 overflow-hidden pl-[32px] py-[32px] pr-0">
      {/* Warning Banner */}
      {streamingError && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 duration-300">
          <div className="bg-red-600/90 backdrop-blur-md text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-4 border border-white/10">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
              <AlertCircle size={20} />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Streaming Error</span>
              <span className="font-bold text-sm">{streamingError}</span>
            </div>
            <button 
                onClick={() => setStreamingError(null)}
                className="hover:bg-white/20 p-2 rounded-xl transition-all cursor-pointer ml-2"
            >
                <X size={18} />
            </button>
          </div>
        </div>
      )}

      {pollCount > 0 && ((isStreaming && stats.streamedChunks === 0) || (isRecording && stats.recordedChunks === 0)) && (
        <div className="fixed top-0 left-0 right-0 z-[200] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-3 font-bold animate-in slide-in-from-top duration-300">
          <div className="bg-white/20 p-1.5 rounded-full">
            <Settings2 size={16} className="animate-pulse" />
          </div>
          <p>
            Warning: {isStreaming && stats.streamedChunks === 0 ? "Streaming" : ""}{isStreaming && stats.streamedChunks === 0 && isRecording && stats.recordedChunks === 0 ? " and " : ""}{isRecording && stats.recordedChunks === 0 ? "Recording" : ""} could be not working (0 chunks processed).
          </p>
        </div>
      )}

      {/* Header Bar */}
      <header className="flex justify-between items-center mb-6 shrink-0 pr-[32px]">
        <div className="flex items-center gap-6">
          <h1 className="text-3xl font-black text-[#002b5c]">
            CanvaStream
          </h1>

          {/* Participants list moved to sidebar */}
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center px-6 py-2 rounded-full font-semibold transition-all shadow-lg active:scale-95 cursor-pointer text-white ${
                isRecording 
                    ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20' 
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
            }`}
          >
            <Circle size={18} className="mr-2" fill="currentColor" />
            {isRecording ? 'Stop Recording' : 'Record'}
          </button>

          {!isStreaming ? (
            <div className="flex items-center gap-2">
              <button
                onClick={startStreaming}
                disabled={isConnecting}
                title={isConnecting ? "Establishing connection..." : "Start broadcasting your stream"}
                className={`flex items-center px-6 py-2 rounded-full font-semibold transition-all shadow-lg active:scale-95 cursor-pointer text-white ${
                  isConnecting 
                    ? 'bg-blue-600/50 cursor-wait' 
                    : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/20'
                }`}
              >
                <PlayCircle className={`w-5 h-5 mr-2 ${isConnecting ? 'animate-spin' : ''}`} />
                {isConnecting ? 'Connecting...' : 'Go Live'}
              </button>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-all active:scale-90 cursor-pointer"
                title="Stream Settings"
              >
                <Settings2 size={20} />
              </button>
            </div>
          ) : (
            <button
              onClick={stopStreaming}
              title="Stop broadcasting and disconnect"
              className="flex items-center px-6 py-2 bg-red-600 hover:bg-red-700 rounded-full font-semibold transition-all shadow-lg hover:shadow-red-500/20 active:scale-95 cursor-pointer text-white"
            >
              <StopCircle className="w-5 h-5 mr-2" />
              End Stream
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex gap-[32px] min-h-0">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative min-w-0 min-h-0">

        <div className="w-full h-full flex flex-col items-center justify-center min-h-0 py-12">
          <div className="flex-1 flex items-center justify-center min-h-0 min-w-0">
            <div className="relative group overflow-hidden rounded-3xl border border-gray-200 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.1)] bg-black transition-all duration-300">
                {/* 16:9 Aspect Ratio Spacer */}
                <img 
                    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9' width='1600' height='900'%3E%3C/svg%3E" 
                    className="block w-full h-auto max-w-full max-h-full opacity-0 pointer-events-none"
                    alt="" 
                />
                <div className="absolute inset-0">
                    <canvas ref={canvasRef} width={1280} height={720} className="w-full h-full" />
                    
                    {isEditMode && (
                        <div 
                            className="absolute inset-0 z-10 cursor-default"
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            {currentLayout.placeholders.map((p, i) => {
                                const left = (p.x / 1280) * 100;
                                const top = (p.y / 1280) * 100 * (16/9); // Adjust for container aspect ratio? 
                                // Actually, since the container is exactly 16:9 and canvas is 1280x720 (16:9), 
                                // we can just use percentages of the container.
                                const width = (p.width / 1280) * 100;
                                const height = (p.height / 720) * 100;

                                return (
                                    <div 
                                        key={i}
                                        className={`absolute border-2 transition-colors ${dragInfo?.index === i ? 'border-amber-500 bg-amber-500/10' : 'border-blue-500/50 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/10'}`}
                                        style={{
                                            left: `${(p.x / 1280) * 100}%`,
                                            top: `${(p.y / 720) * 100}%`,
                                            width: `${(p.width / 1280) * 100}%`,
                                            height: `${(p.height / 720) * 100}%`,
                                            cursor: dragInfo ? 'grabbing' : 'grab'
                                        }}
                                        onMouseDown={(e) => handleMouseDown(e, i, 'move')}
                                    >
                                        {/* Resize handles */}
                                        <div className="absolute -top-1 -left-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-nw-resize" onMouseDown={(e) => handleMouseDown(e, i, 'resize', 'nw')} />
                                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-ne-resize" onMouseDown={(e) => handleMouseDown(e, i, 'resize', 'ne')} />
                                        <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-sw-resize" onMouseDown={(e) => handleMouseDown(e, i, 'resize', 'sw')} />
                                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-se-resize" onMouseDown={(e) => handleMouseDown(e, i, 'resize', 'se')} />
                                        
                                        <div className="absolute top-1/2 -left-1 w-2 h-4 bg-white border border-blue-500 rounded-sm cursor-w-resize -translate-y-1/2" onMouseDown={(e) => handleMouseDown(e, i, 'resize', 'w')} />
                                        <div className="absolute top-1/2 -right-1 w-2 h-4 bg-white border border-blue-500 rounded-sm cursor-e-resize -translate-y-1/2" onMouseDown={(e) => handleMouseDown(e, i, 'resize', 'e')} />
                                        <div className="absolute -top-1 left-1/2 w-4 h-2 bg-white border border-blue-500 rounded-sm cursor-n-resize -translate-x-1/2" onMouseDown={(e) => handleMouseDown(e, i, 'resize', 'n')} />
                                        <div className="absolute -bottom-1 left-1/2 w-4 h-2 bg-white border border-blue-500 rounded-sm cursor-s-resize -translate-x-1/2" onMouseDown={(e) => handleMouseDown(e, i, 'resize', 's')} />
                                        
                                        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-blue-600 text-white text-[8px] font-bold rounded uppercase tracking-tighter opacity-80 pointer-events-none">
                                            {p.tags.join(', ')}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                
                    <video 
                        ref={previewVideoRef} 
                        autoPlay 
                        muted 
                        playsInline 
                        className="absolute opacity-0 pointer-events-none" 
                        style={{ width: '1px', height: '1px' }}
                    />
                    <video 
                        ref={screenVideoRef} 
                        autoPlay 
                        muted 
                        playsInline 
                        className="absolute opacity-0 pointer-events-none" 
                        style={{ width: '1px', height: '1px' }}
                    />
                </div>
            </div>

          {/* Toolbar */}
          <div className="mt-8 flex items-center gap-3 bg-gray-100 border border-gray-200 p-2 rounded-2xl shrink-0">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
              <button 
                  onClick={toggleCamera}
                  title={isCameraActive ? "Turn off camera/mic" : "Turn on camera/mic"}
                  className={`p-4 rounded-xl transition-all cursor-pointer ${isCameraActive ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-500'}`}
              >
                  <Video size={24} />
              </button>

              {isCameraActive && (
                  <>
                      <button 
                          onClick={toggleMute}
                          title={isMuted ? "Unmute microphone" : "Mute microphone"}
                          className={`p-4 rounded-xl transition-all cursor-pointer ${isMuted ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-500'}`}
                      >
                          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                      </button>
                      <button 
                          onClick={toggleVideo}
                          title={isVideoOff ? "Enable video" : "Disable video"}
                          className={`p-4 rounded-xl transition-all cursor-pointer ${isVideoOff ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-500'}`}
                      >
                          {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                      </button>
                  </>
              )}
              <button 
                  onClick={toggleScreenShare}
                  title={isScreenSharing ? "Stop sharing screen" : "Share your screen"}
                  className={`p-4 rounded-xl transition-all cursor-pointer ${isScreenSharing ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-500'}`}
              >
                  <Monitor size={24} />
              </button>
              <div className="w-[1px] h-8 bg-gray-200 mx-2" />
              <div className="relative">
                <button 
                    onClick={() => setIsLayoutMenuOpen(!isLayoutMenuOpen)}
                    title="Change video layout"
                    className={`flex items-center gap-2 px-4 py-4 rounded-xl transition-all cursor-pointer ${isLayoutMenuOpen ? 'bg-gray-100 text-[#002b5c]' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-500'}`}
                >
                    <LayoutIcon size={24} />
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isLayoutMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isLayoutMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-30" 
                      onClick={() => setIsLayoutMenuOpen(false)} 
                    />
                    <div className="absolute bottom-full mb-4 left-0 w-56 bg-white border border-gray-200 rounded-2xl p-2 shadow-2xl z-40 animate-in fade-in slide-in-from-bottom-4 duration-200">
                      <p className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Select Layout</p>
                      {LAYOUTS.map((layout) => (
                        <button
                          key={layout.id}
                          onClick={() => {
                            setCurrentLayout(layout);
                            setIsLayoutMenuOpen(false);
                            if (sessionSocketRef.current?.readyState === WebSocket.OPEN) {
                              const data = { layout: layout.id };
                              sessionSocketRef.current.send(JSON.stringify({
                                type: "SESSION_STATE",
                                data
                              }));
                              setSessionState(data);
                            }
                          }}
                          className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all mb-1 last:mb-0 cursor-pointer ${
                            currentLayout.id === layout.id 
                              ? 'bg-blue-600 text-white' 
                              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {layout.id === '2x2' ? <LayoutGrid size={18} /> : <Presentation size={18} />}
                            <span className="text-sm font-medium">{layout.name}</span>
                          </div>
                          {currentLayout.id === layout.id && <Check size={16} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button 
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload background image"
                  className={`p-4 rounded-xl transition-all cursor-pointer ${bgImage ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-500'}`}
              >
                  <ImageIcon size={24} />
              </button>
              <button 
                  onClick={() => setIsEditMode(!isEditMode)}
                  title={isEditMode ? "Exit edit mode" : "Enter edit mode"}
                  className={`p-4 rounded-xl transition-all cursor-pointer ${isEditMode ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-500'}`}
              >
                  <Pencil size={24} />
              </button>
              <div className="w-[1px] h-8 bg-gray-200 mx-2" />
              <button 
                  onClick={() => setIsInviteOpen(true)}
                  title="Invite others to join this session"
                  className="p-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 transition-all cursor-pointer relative"
              >
                  <Users size={24} />
              </button>


          </div>
        </div>

        {/* Invite Popup */}
        {isInviteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
              className="absolute inset-0" 
              onClick={() => setIsInviteOpen(false)} 
            />
            <div className="relative w-full max-w-md bg-gray-900 border border-white/10 rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <button 
                onClick={() => setIsInviteOpen(false)}
                className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
              
              <h3 className="text-2xl font-bold mb-2">Invite Others</h3>
              <p className="text-gray-400 mb-6">Share this link with participants to join your session.</p>
              
              <div className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center text-gray-500">
                    <LinkIcon size={18} />
                  </div>
                  <input 
                    readOnly 
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/sessions/${sessionId}`}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
                
                <button 
                  onClick={() => {
                    const url = `${window.location.origin}/sessions/${sessionId}`;
                    navigator.clipboard.writeText(url);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold transition-all ${
                    isCopied 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-blue-500/20 active:scale-[0.98]'
                  }`}
                >
                  {isCopied ? (
                    <>
                      <Check size={20} />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={20} />
                      <span>Copy Invitation Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar Area (Floating) */}
      <div className="relative z-20 flex flex-col justify-center h-full shrink-0">
        {isSidebarCollapsed ? (
            <div className="flex flex-col items-center py-6 h-full bg-white/90 backdrop-blur-xl border border-gray-200 border-r-0 w-20 rounded-l-xl rounded-r-none transition-all duration-300">
                <button 
                    onClick={() => setIsSidebarCollapsed(false)}
                    className="p-3 rounded-2xl hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-all cursor-pointer"
                    title="Expand Sidebar"
                >
                    <ChevronLeft size={24} />
                </button>
                <div className="mt-8 flex flex-col items-center gap-6">
                    <button onClick={() => { setActiveTab('chat'); setIsSidebarCollapsed(false); }} className="relative group">
                        <MessageSquare className={activeTab === 'chat' ? "text-blue-600" : "text-gray-300 group-hover:text-gray-400"} size={24} />
                        {activeTab === 'chat' && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
                        )}
                    </button>
                    <button onClick={() => { setActiveTab('guests'); setIsSidebarCollapsed(false); }} className="relative group">
                        <Users className={activeTab === 'guests' ? "text-blue-600" : "text-gray-300 group-hover:text-gray-400"} size={24} />
                        {activeTab === 'guests' && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
                        )}
                    </button>
                    <button onClick={() => { setActiveTab('debug'); setIsSidebarCollapsed(false); }} className="relative group">
                        <Settings2 className={activeTab === 'debug' ? "text-blue-600" : "text-gray-300 group-hover:text-gray-400"} size={24} />
                        {activeTab === 'debug' && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
                        )}
                    </button>
                </div>
            </div>
        ) : (
            <div className="flex flex-col h-full bg-white/95 backdrop-blur-xl border border-gray-200 border-r-0 w-[360px] rounded-l-xl rounded-r-none transition-all duration-500 relative overflow-hidden group">
                {/* Tabs Header */}
                <div className="flex bg-gray-50/30 p-1 border-b border-gray-100">
                    <button 
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 py-3 rounded-lg font-bold text-[13px] uppercase tracking-wide transition-all cursor-pointer ${
                            activeTab === 'chat' 
                                ? 'bg-white text-blue-600 shadow-[0_1px_3px_rgba(0,0,0,0.1)]' 
                                : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
                        }`}
                    >
                        Chat
                    </button>
                    <button 
                        onClick={() => setActiveTab('guests')}
                        className={`flex-1 py-3 rounded-lg font-bold text-[13px] uppercase tracking-wide transition-all cursor-pointer ${
                            activeTab === 'guests' 
                                ? 'bg-white text-blue-600 shadow-[0_1px_3px_rgba(0,0,0,0.1)]' 
                                : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
                        }`}
                    >
                        Guests
                    </button>
                    <button 
                        onClick={() => setActiveTab('debug')}
                        className={`flex-1 py-3 rounded-lg font-bold text-[13px] uppercase tracking-wide transition-all cursor-pointer ${
                            activeTab === 'debug' 
                                ? 'bg-white text-blue-600 shadow-[0_1px_3px_rgba(0,0,0,0.1)]' 
                                : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
                        }`}
                    >
                        Debug
                    </button>
                    <button 
                        onClick={() => setIsSidebarCollapsed(true)}
                        className="w-8 h-10 flex items-center justify-center text-gray-300 hover:text-gray-600 transition-all cursor-pointer"
                        title="Collapse Sidebar"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    <div className={`absolute inset-0 transition-all duration-300 transform ${activeTab === 'chat' ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}>
                        <Chat 
                            messages={messages} 
                            onSendMessage={handleSendMessage} 
                            status={sessionStatus} 
                            userName={userName} 
                            participants={participants}
                            hideHeader={true}
                        />
                    </div>
                    <div className={`absolute inset-0 transition-all duration-300 transform ${activeTab === 'guests' ? 'translate-x-0 opacity-100' : (activeTab === 'chat' ? 'translate-x-full' : '-translate-x-full') + ' opacity-0 pointer-events-none'}`}>
                        <Guests 
                            participants={participants}
                            userName={userName}
                            myClientId={myClientId}
                        />
                    </div>
                    <div className={`absolute inset-0 transition-all duration-300 transform ${activeTab === 'debug' ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}>
                        <Debug 
                            status={sessionStatus}
                            participants={participants}
                            streams={streams}
                            myClientId={myClientId}
                            streamConnections={streamConnectionsStatus}
                            sessionState={sessionState}
                            hideHeader={true}
                        />
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8">
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl font-black text-[#002b5c]">Stream Settings</h2>
                      <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer">
                          <X size={20} className="text-gray-400" />
                      </button>
                  </div>
                  
                  <div className="space-y-6">
                      <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">RTMP Destination URL</label>
                          <div className="relative">
                              <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                              <input 
                                  type="text" 
                                  value={rtmpUrl}
                                  onChange={(e) => setRtmpUrl(e.target.value)}
                                  placeholder="rtmp://localhost:1935/live/stream1"
                                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-600 font-medium"
                              />
                          </div>
                          <p className="mt-2 text-xs text-gray-400">Specify the ingest URL of your streaming service (YouTube, Twitch, or local FFmpeg).</p>
                      </div>

                      <div className="pt-4 flex gap-3">
                          <button 
                              onClick={() => {
                                  localStorage.setItem("canvastream_rtmp_url", rtmpUrl);
                                  setIsSettingsOpen(false);
                              }}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer"
                          >
                              Save Configuration
                          </button>
                      </div>
                  </div>
              </div>
          </div>
        </div>
      )}

      {showInteractionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                  <PlayCircle className="text-blue-600" size={40} />
                </div>
                <h2 className="text-2xl font-black text-[#002b5c] mb-3">Playback Paused</h2>
                <p className="text-gray-500 mb-8 leading-relaxed font-medium">
                  Browser security requires a click to enable audio and video from other participants.
                </p>
                <button
                  onClick={handleInteractionRetry}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer"
                >
                  Enable Audio & Video
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
