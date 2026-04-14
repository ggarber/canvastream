package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type SessionMessage struct {
	Type      string      `json:"type"`
	RequestId string      `json:"requestId,omitempty"`
	From      string      `json:"from,omitempty"`
	To        string      `json:"to,omitempty"`
	Name      string      `json:"name,omitempty"`
	FromName  string      `json:"fromName,omitempty"`
	Data      interface{} `json:"data,omitempty"`
}

var (
	sessionsMu sync.RWMutex
	// sessionId -> clientID -> connection
	sessions     = make(map[string]map[string]*websocket.Conn)
	sessionNames = make(map[string]map[string]string)
	// sessionId -> streamID -> MediaStreamInfo
	sessionStreams = make(map[string]map[string]MediaStreamInfo)
	// sessionId -> state data
	sessionStates = make(map[string]interface{})
)

type MediaStreamInfo struct {
	StreamId string `json:"streamId"`
	Source   string `json:"source"`
	From     string `json:"from"`
}

func handleSession(w http.ResponseWriter, r *http.Request) {
	// Extract sessionId from path: /session/{sessionId}
	sessionId := r.URL.Path[len("/session/"):]
	if sessionId == "" {
		log.Println("session error: sessionId required in path")
		http.Error(w, "sessionId required", http.StatusBadRequest)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[%s] upgrade: %v\n", sessionId, err)
		return
	}
	defer ws.Close()

	log.Printf("[%s] session connection opened\n", sessionId)

	var clientID string

	// 1 minute timeout setup
	resetTimeout := func() {
		ws.SetReadDeadline(time.Now().Add(1 * time.Minute))
	}

	resetTimeout()

	registered := false

	defer func() {
		if registered && clientID != "" {
			sessionsMu.Lock()
			if clients, ok := sessions[sessionId]; ok {
				name := sessionNames[sessionId][clientID]
				delete(clients, clientID)
				if names, ok := sessionNames[sessionId]; ok {
					delete(names, clientID)
				}

				// Clean up streams belonging to this client
				if streams, ok := sessionStreams[sessionId]; ok {
					for streamID, stream := range streams {
						if stream.From == clientID {
							delete(streams, streamID)
							// Notify others about stream destruction
							destroyedMsg := SessionMessage{
								Type: "STREAM_DESTROYED",
								From: clientID,
								Data: map[string]string{"streamId": streamID},
							}
							for _, targetConn := range clients {
								targetConn.WriteJSON(destroyedMsg)
							}
						}
					}
				}

				if len(clients) == 0 {
					delete(sessions, sessionId)
					delete(sessionNames, sessionId)
					delete(sessionStreams, sessionId)
					delete(sessionStates, sessionId)
				} else {
					// Notify others about disconnection
					disconnectedMsg := SessionMessage{
						Type:     "DISCONNECTED",
						From:     clientID,
						FromName: name,
					}
					for id, targetConn := range clients {
						if id != clientID {
							targetConn.WriteJSON(disconnectedMsg)
						}
					}
				}
			}
			sessionsMu.Unlock()
		}
		log.Printf("[%s] session connection closed clientID=%s\n", sessionId, clientID)
	}()

	for {
		_, message, err := ws.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("[%s] session read error: %v\n", sessionId, err)
			}
			break
		}
		resetTimeout()

		var msg SessionMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("[%s] session unmarshal error: %v\n", sessionId, err)
			continue
		}

		log.Printf("[%s] RECV [%s]: type=%s\n", sessionId, clientID, msg.Type)

		if !registered {
			if msg.Type != "connect" {
				log.Printf("[%s] session error: first message must be 'connect', got %s\n", sessionId, msg.Type)
				break
			}

			// Generate a unique clientID for this connection
			clientID = time.Now().Format("150405") + "-" + r.RemoteAddr
			displayName := msg.Name
			if displayName == "" {
				displayName = clientID
			}

			sessionsMu.Lock()
			if sessions[sessionId] == nil {
				sessions[sessionId] = make(map[string]*websocket.Conn)
				sessionNames[sessionId] = make(map[string]string)
				sessionStreams[sessionId] = make(map[string]MediaStreamInfo)
			}

			// Notify new user about existing participants
			for id, name := range sessionNames[sessionId] {
				existingMsg := SessionMessage{
					Type:     "CONNECTED",
					From:     id,
					FromName: name,
				}
				ws.WriteJSON(existingMsg)
			}

			// Notify new user about existing streams
			for _, stream := range sessionStreams[sessionId] {
				streamMsg := SessionMessage{
					Type: "STREAM_CREATED",
					From: stream.From,
					Data: stream,
				}
				ws.WriteJSON(streamMsg)
			}

			// Notify new user about current session state
			if state, ok := sessionStates[sessionId]; ok {
				stateMsg := SessionMessage{
					Type: "SESSION_STATE",
					From: "server",
					Data: state,
				}
				ws.WriteJSON(stateMsg)
			}

			sessions[sessionId][clientID] = ws
			sessionNames[sessionId][clientID] = displayName

			// Notify others about new connection
			connectedMsg := SessionMessage{
				Type:     "CONNECTED",
				From:     clientID,
				FromName: displayName,
			}
			for id, targetConn := range sessions[sessionId] {
				if id != clientID {
					targetConn.WriteJSON(connectedMsg)
				}
			}
			sessionsMu.Unlock()

			msg.From = "server"
			msg.Type = "response"
			msg.Data = map[string]string{
				"status":       "connected",
				"connectionId": clientID,
			}

			registered = true
			log.Printf("[%s] REGISTERED clientID=%s name=%s\n", sessionId, clientID, displayName)
			if err := ws.WriteJSON(msg); err != nil {
				log.Printf("[%s] session write connect error: %v\n", sessionId, err)
				break
			}
			continue
		}

		// Handle heartbeat
		if msg.Type == "heartbeat" {
			heartbeatMsg := SessionMessage{
				Type: "response",
				Data: "pong",
				From: "server",
			}
			if err := ws.WriteJSON(heartbeatMsg); err != nil {
				log.Printf("[%s] session write response error: %v\n", sessionId, err)
				break
			}
			continue
		}

		// Handle Stream Events
		if msg.Type == "CREATE_STREAM" {
			source := ""
			if data, ok := msg.Data.(map[string]interface{}); ok {
				if s, ok := data["source"].(string); ok {
					source = s
				}
			}
			if source == "" {
				continue
			}

			streamID := time.Now().Format("150405.000") + "-" + clientID
			stream := MediaStreamInfo{
				StreamId: streamID,
				Source:   source,
				From:     clientID,
			}

			sessionsMu.Lock()
			if _, ok := sessionStreams[sessionId]; !ok {
				sessionStreams[sessionId] = make(map[string]MediaStreamInfo)
			}
			sessionStreams[sessionId][streamID] = stream
			senderName := sessionNames[sessionId][clientID]
			sessionsMu.Unlock()

			// Send explicit response to sender
			responseMsg := SessionMessage{
				Type:      "response",
				RequestId: msg.RequestId,
				From:      "server",
				Data: map[string]string{
					"status":   "success",
					"streamId": streamID,
				},
			}
			ws.WriteJSON(responseMsg)

			// Broadcast STREAM_CREATED to others
			createdMsg := SessionMessage{
				Type:     "STREAM_CREATED",
				From:     clientID,
				FromName: senderName,
				Data:     stream,
			}

			sessionsMu.RLock()
			for _, targetConn := range sessions[sessionId] {
				targetConn.WriteJSON(createdMsg)
			}
			sessionsMu.RUnlock()
			continue
		}

		if msg.Type == "DESTROY_STREAM" {
			streamID := ""
			if data, ok := msg.Data.(map[string]interface{}); ok {
				if id, ok := data["streamId"].(string); ok {
					streamID = id
				}
			}
			if streamID == "" {
				continue
			}

			sessionsMu.Lock()
			if streams, ok := sessionStreams[sessionId]; ok {
				if stream, ok := streams[streamID]; ok {
					if stream.From == clientID {
						delete(streams, streamID)
						senderName := sessionNames[sessionId][clientID]
						sessionsMu.Unlock()

						// Send explicit response to sender
						responseMsg := SessionMessage{
							Type:      "response",
							RequestId: msg.RequestId,
							From:      "server",
							Data:      map[string]string{"status": "success"},
						}
						ws.WriteJSON(responseMsg)

						// Broadcast STREAM_DESTROYED to others
						destroyedMsg := SessionMessage{
							Type:     "STREAM_DESTROYED",
							From:     clientID,
							FromName: senderName,
							Data:     map[string]string{"streamId": streamID},
						}

						sessionsMu.RLock()
						for _, targetConn := range sessions[sessionId] {
							targetConn.WriteJSON(destroyedMsg)
						}
						sessionsMu.RUnlock()
						continue
					}
				}
			}
			sessionsMu.Unlock()
		}

		if msg.Type == "SESSION_STATE" {
			sessionsMu.Lock()
			sessionStates[sessionId] = msg.Data
			sessionsMu.Unlock()
			// Will be broadcast by the logic below
		}

		// Forward or Broadcast message within the same room
		if msg.To != "" {
			sessionsMu.RLock()
			var targetConn *websocket.Conn
			if clients, ok := sessions[sessionId]; ok {
				targetConn = clients[msg.To]
			}
			senderName := sessionNames[sessionId][clientID]
			sessionsMu.RUnlock()

			if targetConn != nil {
				if msg.From == "" {
					msg.From = clientID
				}
				if msg.FromName == "" {
					msg.FromName = senderName
				}
				log.Printf("[%s] FORWARD from=%s (%s) to=%s type=%s\n", sessionId, msg.From, msg.FromName, msg.To, msg.Type)
				if err := targetConn.WriteJSON(msg); err != nil {
					log.Printf("[%s] session forward error to %s: %v\n", sessionId, msg.To, err)
				}
			}
		} else {
			// Broadcast to all others in the same session
			sessionsMu.RLock()
			clients := sessions[sessionId]
			senderName := sessionNames[sessionId][clientID]
			if clients != nil {
				for id, targetConn := range clients {
					if id != clientID {
						if msg.From == "" {
							msg.From = clientID
						}
						if msg.FromName == "" {
							msg.FromName = senderName
						}
						log.Printf("[%s] BROADCAST from=%s (%s) to=%s type=%s\n", sessionId, msg.From, msg.FromName, id, msg.Type)
						if err := targetConn.WriteJSON(msg); err != nil {
							log.Printf("[%s] session broadcast error to %s: %v\n", sessionId, id, err)
						}
					}
				}
			}
			sessionsMu.RUnlock()
		}
	}
}
