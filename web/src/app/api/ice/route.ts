import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Implements the TURN REST API convention to generate time-limited credentials.
 * Reference: https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    const turnSecret = process.env.TURN_SECRET;
    const turnServers = process.env.TURN_SERVERS;

    // Default STUN servers if TURN is not configured
    if (!turnSecret || !turnServers) {
        return NextResponse.json({
            uris: ['stun:stun.l.google.com:19302'],
            ttl: 86400
        });
    }

    // Expiration: 5 minutes from now
    const ttl = 300;
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    
    // Include sessionId in username if available
    const username = sessionId ? `${expiry}:${sessionId}` : `${expiry}`;
    
    // Generate HMAC-SHA1 password using the shared secret
    const hmac = crypto.createHmac('sha1', turnSecret);
    hmac.update(username);
    const password = hmac.digest('base64');

    const uris = turnServers.split(',').map(s => s.trim());

    return NextResponse.json({
        username: username,
        password: password,
        uris: uris,
        ttl: ttl
    });
}
