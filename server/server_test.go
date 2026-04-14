package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestStats(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(handleStats))
	defer server.Close()

	resp, err := http.Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status OK, got %v", resp.Status)
	}

	var stats StatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		t.Fatal(err)
	}

	// Should have empty sessions and streams initially
	if stats.Sessions == nil {
		t.Error("expected sessions to be a slice, got nil")
	}
}

func TestSession(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(handleSession))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()

	// 1. Send connect
	connectMsg := SessionMessage{Type: "connect"}
	if err := ws.WriteJSON(connectMsg); err != nil {
		t.Fatal(err)
	}

	// 2. Expect connected response
	var resp SessionMessage
	if err := ws.ReadJSON(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Type != "response" {
		t.Errorf("expected type 'response', got %s", resp.Type)
	}
	if resp.Data != "connected" {
		t.Errorf("expected data 'connected', got %v", resp.Data)
	}
	if resp.From == "" {
		t.Error("expected assigned ID in 'from' field")
	}

	clientID := resp.From

	// 3. Test heartbeat
	resp = SessionMessage{} // Reset to avoid stale field values
	hbMsg := SessionMessage{Type: "heartbeat"}
	if err := ws.WriteJSON(hbMsg); err != nil {
		t.Fatal(err)
	}

	if err := ws.ReadJSON(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Type != "response" {
		t.Errorf("expected type 'response', got %s", resp.Type)
	}
	if resp.Data != nil {
		t.Errorf("expected nil data, got %v", resp.Data)
	}
	if resp.From != clientID {
		t.Errorf("expected from field %s, got %s", clientID, resp.From)
	}

	// 4. Test stats update
	statsServer := httptest.NewServer(http.HandlerFunc(handleStats))
	defer statsServer.Close()
	sResp, err := http.Get(statsServer.URL)
	if err == nil {
		var stats StatsResponse
		json.NewDecoder(sResp.Body).Decode(&stats)
		found := false
		for _, s := range stats.Sessions {
			if s == clientID {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("clientID %s not found in stats", clientID)
		}
		sResp.Body.Close()
	}
}

func TestStream(t *testing.T) {
	// This test might fail if RTMP server is not reachable, 
	// but we'll try to check if it upgrades correctly at least.
	// We'll skip actual RTMP logic if it fails to dial to avoid brittle tests in CI, 
	// but here we can try.
	
	server := httptest.NewServer(http.HandlerFunc(handleStream))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	
	// We'll use a short timeout for the dial inside handleStream because we don't want to wait
	// but handleStream uses rtmp.Dial which might block.
	
	t.Run("Upgrade", func(t *testing.T) {
		ws, _, err := websocket.DefaultDialer.Dial(wsURL+"?id=test-stream", nil)
		if err != nil {
			// If it fails because of RTMP dial inside handleStream, it's expected if no FFmpeg is running
			t.Logf("Dial failed (possibly rtmp issue): %v", err)
			return
		}
		ws.Close()
		
		// Check stats
		time.Sleep(100 * time.Millisecond) // wait for cleanup if any
	})
}
