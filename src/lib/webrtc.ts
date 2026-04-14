
export type StreamConnectionStatus = RTCPeerConnectionState | 'initializing';

export class StreamConnection {
    pc: RTCPeerConnection;
    streamId: string;
    remoteClientId: string;
    isInitiator: boolean;
    onStatusChange: (status: StreamConnectionStatus) => void;
    onTrack?: (track: MediaStreamTrack, stream: MediaStream) => void;

    constructor(
        streamId: string,
        remoteClientId: string,
        isInitiator: boolean,
        onStatusChange: (status: StreamConnectionStatus) => void,
        onTrack?: (track: MediaStreamTrack, stream: MediaStream) => void
    ) {
        this.streamId = streamId;
        this.remoteClientId = remoteClientId;
        this.isInitiator = isInitiator;
        this.onStatusChange = onStatusChange;
        this.onTrack = onTrack;

        this.pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        // Set initial status
        this.onStatusChange('initializing');

        this.pc.onconnectionstatechange = () => {
            this.onStatusChange(this.pc.connectionState);
        };

        this.pc.ontrack = (event) => {
            if (this.onTrack) {
                this.onTrack(event.track, event.streams[0]);
            }
        };

        // Handle ICE candidates (simplified: usually needs trickle ICE, but we can bundle for simplicity or use a signaling message)
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                // In a production app, we'd send individual candidates via the socket.
                // For this implementation, we might wait for the complete SDP or use a simpler signaling.
                // However, the user request says "after initializing... sender will reply with an ANSWER after setRemoteDescription and getLocalDescription() calls".
                // This implies we send the SDP after ICE gathering might be done, or just send the initial SDP.
            }
        };
    }

    async createOffer(): Promise<RTCSessionDescriptionInit> {
        // "initializing the PeerConnection to receive 1 audio and 1 video stream"
        this.pc.addTransceiver('audio', { direction: 'recvonly' });
        this.pc.addTransceiver('video', { direction: 'recvonly' });

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        
        // Wait for ICE gathering to complete before returning the final SDP
        // This makes signaling simpler as we don't need to handle ICE candidates separately
        if (this.pc.iceGatheringState !== 'complete') {
            await new Promise<void>((resolve) => {
                const checkState = () => {
                    if (this.pc.iceGatheringState === 'complete') {
                        this.pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                this.pc.addEventListener('icegatheringstatechange', checkState);
            });
        }

        return this.pc.localDescription!;
    }

    async handleOffer(sdp: RTCSessionDescriptionInit, localStream?: MediaStream): Promise<RTCSessionDescriptionInit> {
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));

        if (localStream) {
            localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, localStream);
            });
        }

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        // Wait for ICE gathering
        if (this.pc.iceGatheringState !== 'complete') {
            await new Promise<void>((resolve) => {
                const checkState = () => {
                    if (this.pc.iceGatheringState === 'complete') {
                        this.pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                this.pc.addEventListener('icegatheringstatechange', checkState);
            });
        }

        return this.pc.localDescription!;
    }

    async handleAnswer(sdp: RTCSessionDescriptionInit) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    close() {
        this.pc.close();
    }
}
