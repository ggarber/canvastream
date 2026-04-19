
export type StreamConnectionStatus = RTCPeerConnectionState | 'initializing';

/**
 * Fetches ICE configuration (STUN/TURN servers) from the server.
 * Follows the TURN REST API convention.
 */
export async function getIceConfig(sessionId?: string): Promise<RTCConfiguration> {
    try {
        const url = sessionId ? `/api/ice?sessionId=${sessionId}` : '/api/ice';
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch ICE config');
        
        const data = await response.json();
        
        // Map TURN REST API format to browser RTCConfiguration
        if (data.username && data.password) {
            return {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    {
                        urls: data.uris,
                        username: data.username,
                        credential: data.password
                    }
                ]
            };
        } else {
            return {
                iceServers: [{ urls: data.uris || ['stun:stun.l.google.com:19302'] }]
            };
        }
    } catch (error) {
        console.error('Error fetching ICE config, falling back to default:', error);
        return {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };
    }
}

export class StreamConnection {
    pc: RTCPeerConnection;
    streamId: string;
    remoteClientId: string;
    isInitiator: boolean;
    onStatusChange: (status: StreamConnectionStatus) => void;
    onTrack?: (track: MediaStreamTrack, stream: MediaStream) => void;
    onIceCandidate?: (candidate: RTCIceCandidate) => void;

    constructor(
        streamId: string,
        remoteClientId: string,
        isInitiator: boolean,
        onStatusChange: (status: StreamConnectionStatus) => void,
        onTrack?: (track: MediaStreamTrack, stream: MediaStream) => void,
        onIceCandidate?: (candidate: RTCIceCandidate) => void,
        config?: RTCConfiguration
    ) {
        this.streamId = streamId;
        this.remoteClientId = remoteClientId;
        this.isInitiator = isInitiator;
        this.onStatusChange = onStatusChange;
        this.onTrack = onTrack;
        this.onIceCandidate = onIceCandidate;

        this.pc = new RTCPeerConnection(config || {
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

        this.pc.onicecandidate = (event) => {
            if (event.candidate && this.onIceCandidate) {
                this.onIceCandidate(event.candidate);
            }
        };
    }

    async createOffer(): Promise<RTCSessionDescriptionInit> {
        this.pc.addTransceiver('audio', { direction: 'recvonly' });
        this.pc.addTransceiver('video', { direction: 'recvonly' });

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        
        // We no longer wait for ICE gathering to complete.
        // Candidates will be sent via Trickle ICE as they are discovered.
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

        // We no longer wait for ICE gathering to complete.
        return this.pc.localDescription!;
    }

    async handleAnswer(sdp: RTCSessionDescriptionInit) {
        if (this.pc.signalingState !== "stable") {
            await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
    }

    async addIceCandidate(candidate: RTCIceCandidateInit) {
        try {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error("[WebRTC] Error adding received ice candidate", e);
        }
    }

    close() {
        this.pc.close();
    }
}

