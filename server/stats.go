package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type StatsResponse struct {
	Streams  []StreamInfo `json:"streams"`
	Sessions []string     `json:"sessions"` // Just IDs for session
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	streamsMu.RLock()
	streamsList := make([]StreamInfo, 0, len(streams))
	for _, s := range streams {
		streamsList = append(streamsList, s)
	}
	streamsMu.RUnlock()

	sessionsMu.RLock()
	sessionsList := make([]string, 0, len(sessions))
	for id := range sessions {
		sessionsList = append(sessionsList, id)
	}
	sessionsMu.RUnlock()

	resp := StatsResponse{
		Streams:  streamsList,
		Sessions: sessionsList,
	}

	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Println("stats error:", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}
