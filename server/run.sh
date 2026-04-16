export SSL_CERT_FILE=/etc/letsencrypt/live/canvastreamserver.livetok.io/fullchain.pem
export SSL_KEY_FILE=/etc/letsencrypt/live/canvastreamserver.livetok.io/privkey.pem
export PORT=3003 # Optional
go run .
