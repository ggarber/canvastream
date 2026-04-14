package main

import (
	"bytes"
	"encoding/binary"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/yutopp/go-rtmp"
	rtmpmsg "github.com/yutopp/go-rtmp/message"
	"sync/atomic"
	"net/url"
	"strings"
)

type StreamInfo struct {
	ID         string    `json:"id"`
	StartTime  time.Time `json:"startTime"`
	AudioCount int64     `json:"audioCount"`
	VideoCount int64     `json:"videoCount"`
}

var (
	streams   = make(map[string]StreamInfo)
	streamsMu sync.RWMutex
)

func handleStream(w http.ResponseWriter, r *http.Request) {
	// Extract sessionId from path: /stream/{sessionId}
	sessionId := r.URL.Path[len("/stream/"):]
	if sessionId == "" {
		log.Println("stream error: sessionId required in path")
		http.Error(w, "sessionId required", http.StatusBadRequest)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[%s] stream upgrade error: %v\n", sessionId, err)
		return
	}
	defer ws.Close()

	streamID := sessionId

	streamsMu.Lock()
	streams[streamID] = StreamInfo{
		ID:        streamID,
		StartTime: time.Now(),
	}
	streamsMu.Unlock()

	defer func() {
		streamsMu.Lock()
		delete(streams, streamID)
		streamsMu.Unlock()
	}()

	// Connect to local RTMP server (like FFmpeg listening)
	rtmpURL := r.URL.Query().Get("rtmp")
	if rtmpURL == "" {
		rtmpURL = "rtmp://127.0.0.1:1935/live/stream1"
	}

	host, app, streamName, err := parseRTMPURL(rtmpURL)
	if err != nil {
		log.Printf("[%s] Failed to parse RTMP URL %s: %v\n", sessionId, rtmpURL, err)
		ws.WriteJSON(map[string]string{"type": "error", "message": "Invalid RTMP URL format"})
		return
	}

	client, err := rtmp.Dial("rtmp", host, &rtmp.ConnConfig{})
	if err != nil {
		log.Printf("[%s] Failed to dial RTMP (%s): %+v\n", sessionId, host, err)
		ws.WriteJSON(map[string]string{"type": "error", "message": "Failed to connect to RTMP server. Is it running?"})
		return
	}
	defer client.Close()

	if err := client.Connect(&rtmpmsg.NetConnectionConnect{
		Command: rtmpmsg.NetConnectionConnectCommand{
			App:   app, 
			TCURL: "rtmp://" + host + "/" + app,
		},
	}); err != nil {
		log.Printf("[%s] Failed to connect RTMP: %+v\n", sessionId, err)
		ws.WriteJSON(map[string]string{"type": "error", "message": "Failed to handshake with RTMP server"})
		return
	}

	stream, err := client.CreateStream(nil, 128)
	if err != nil {
		log.Printf("[%s] Failed to create RTMP stream: %+v\n", sessionId, err)
		ws.WriteJSON(map[string]string{"type": "error", "message": "Failed to create RTMP stream"})
		return
	}
	defer stream.Close()

	if err := stream.Publish(&rtmpmsg.NetStreamPublish{
		PublishingName: streamName, 
		PublishingType: "live",
	}); err != nil {
		log.Printf("[%s] Failed to publish RTMP: %+v\n", sessionId, err)
		ws.WriteJSON(map[string]string{"type": "error", "message": "Failed to publish RTMP stream"})
		return
	}

	log.Printf("[%s] WS client connected and RTMP stream published\n", sessionId)
	ws.WriteJSON(map[string]string{"type": "connected"})

	// Stats tracking
	var audioCount int64
	var videoCount int64

	// Periodic logging ticker
	ticker := time.NewTicker(1 * time.Minute)
	stopStats := make(chan struct{})
	go func() {
		for {
			select {
			case <-ticker.C:
				vc := atomic.LoadInt64(&videoCount)
				ac := atomic.LoadInt64(&audioCount)
				log.Printf("[%s] Stream Stats: Records Received - Video: %d, Audio: %d\n", sessionId, vc, ac)
				
				streamsMu.Lock()
				if info, ok := streams[streamID]; ok {
					info.AudioCount = ac
					info.VideoCount = vc
					streams[streamID] = info
				}
				streamsMu.Unlock()
			case <-stopStats:
				ticker.Stop()
				return
			}
		}
	}()

	defer func() {
		close(stopStats)
		vc := atomic.LoadInt64(&videoCount)
		ac := atomic.LoadInt64(&audioCount)
		log.Printf("[%s] Stream Closed. Final Stats - Video: %d, Audio: %d\n", sessionId, vc, ac)
	}()


	for {
		mt, message, err := ws.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("[%s] WS read error: %v\n", sessionId, err)
			}
			break
		}
		if mt != websocket.BinaryMessage {
			continue
		}

		if len(message) < 5 {
			continue
		}

		msgType := message[0]
		timestamp := binary.BigEndian.Uint32(message[1:5])
		payload := message[5:]

		var csid uint32
		var rtmpMsg rtmpmsg.Message
		if msgType == 9 {
			atomic.AddInt64(&videoCount, 1)
			if videoCount < 20 || videoCount%500 == 0 {
				log.Printf("[%s] Received Video: size=%d, ts=%d, raw=%x\n", sessionId, len(payload), timestamp, message[1:5])
			}
			rtmpMsg = &rtmpmsg.VideoMessage{
				Payload: bytes.NewReader(payload),
			}
			csid = 5
		} else if msgType == 8 {
			atomic.AddInt64(&audioCount, 1)
			if audioCount < 20 || audioCount%500 == 0 {
				log.Printf("[%s] Received Audio: size=%d, ts=%d, raw=%x\n", sessionId, len(payload), timestamp, message[1:5])
			}
			rtmpMsg = &rtmpmsg.AudioMessage{
				Payload: bytes.NewReader(payload),
			}
			csid = 4
		} else {
			continue
		}

		if err := stream.Write(int(csid), timestamp, rtmpMsg); err != nil {
			log.Printf("[%s] Failed to write to RTMP stream: %v\n", sessionId, err)
			
			// Detect common disconnection errors
			errMsg := "RTMP stream error"
			errStr := err.Error()
			if strings.Contains(errStr, "broken pipe") || 
			   strings.Contains(errStr, "connection reset by peer") ||
			   strings.Contains(errStr, "EOF") {
				errMsg = "RTMP server disconnected (broken pipe)"
			}
			
			ws.WriteJSON(map[string]string{
				"type":    "error",
				"message": errMsg,
			})
			break
		}
	}
}

func parseRTMPURL(rawURL string) (host, app, streamName string, err error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "", "", err
	}
	host = u.Host
	if u.Port() == "" {
		host = host + ":1935"
	}
	path := strings.Trim(u.Path, "/")
	parts := strings.SplitN(path, "/", 2)
	if len(parts) > 0 {
		app = parts[0]
	}
	if len(parts) > 1 {
		streamName = parts[1]
	}
	if streamName == "" {
		streamName = "stream1"
	}
	return host, app, streamName, nil
}
