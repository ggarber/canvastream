package main

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	// API Endpoints
	http.HandleFunc("/stream/", handleStream)
	http.HandleFunc("/session/", handleSession)
	http.HandleFunc("/stats", handleStats)

	log.Println("Starting WebSocket server on ws://localhost:3003")
	log.Println(" - /stream: RTMP proxy")
	log.Println(" - /session: Messaging session")
	log.Println(" - /stats: HTTP stats")

	if err := http.ListenAndServe(":3003", nil); err != nil {
		log.Fatal(err)
	}
}

