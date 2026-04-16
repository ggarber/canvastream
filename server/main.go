package main

import (
	"log"
	"net/http"
	"os"

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

	certFile := os.Getenv("SSL_CERT_FILE")
	keyFile := os.Getenv("SSL_KEY_FILE")

	port := os.Getenv("PORT")
	if port == "" {
		port = "3003"
	}

	if certFile != "" && keyFile != "" {
		log.Printf("Starting WSS/HTTPS server on :%s (using %s and %s)", port, certFile, keyFile)
		if err := http.ListenAndServeTLS(":"+port, certFile, keyFile, nil); err != nil {
			log.Fatal(err)
		}
	} else {
		log.Printf("Starting WebSocket server on ws://localhost:%s", port)
		log.Println(" - /stream: RTMP proxy")
		log.Println(" - /session: Messaging session")
		log.Println(" - /stats: HTTP stats")

		if err := http.ListenAndServe(":"+port, nil); err != nil {
			log.Fatal(err)
		}
	}
}


