const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    // This part is for HTTP requests, which our WebSocket server doesn't use directly for client communication.
    // However, Render might probe it.
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server is running.\n');
});

const wss = new WebSocket.Server({ server });

// Store active rooms and their users
const rooms = new Map();
// Store emoji ratings for tokens
const tokenRatings = new Map();

wss.on('connection', (ws, req) => {
    console.log(`Client connected: ${req.socket.remoteAddress}`); // Log client connection
    let currentRoom = null;
    let username = null;

    ws.on('message', (message) => {
        console.log(`Received message from client: ${message}`); // Log raw message
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'joinRoom':
                console.log(`Server received joinRoom message for room: ${data.roomId}`);
                // Leave previous room if any
                if (currentRoom) {
                    const room = rooms.get(currentRoom);
                    if (room) {
                        room.delete(ws);
                        if (room.size === 0) {
                            rooms.delete(currentRoom);
                        }
                    }
                }
                
                // Join new room
                currentRoom = data.roomId;
                if (!rooms.has(currentRoom)) {
                    rooms.set(currentRoom, new Set());
                }
                rooms.get(currentRoom).add(ws);
                
                // Send current emoji stats if it's a token room
                if (currentRoom.startsWith('token-')) {
                    const tokenAddress = currentRoom.split('token-')[1];
                    const stats = tokenRatings.get(tokenAddress) || {};
                    ws.send(JSON.stringify({
                        type: 'emojiUpdate',
                        stats
                    }));
                }
                break;

            case 'chat':
                console.log(`Server received chat message. currentRoom: ${currentRoom}, data.username: ${data.username}, data.content: ${data.content}`);
                if (currentRoom && data.username && data.content) {
                    const message = {
                        type: 'chat',
                        roomId: currentRoom,
                        username: data.username,
                        content: data.content,
                        timestamp: Date.now()
                    };
                    
                    console.log(`Broadcasting message to room ${currentRoom}:`, message); // Log before broadcast
                    // Broadcast to all users in the room
                    rooms.get(currentRoom)?.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(message));
                            console.log(`Sent message to client in room ${currentRoom}.`); // Log each send attempt
                        } else {
                            console.warn(`Skipping client in room ${currentRoom} due to readyState: ${client.readyState}`);
                        }
                    });
                } else {
                    console.warn(`Broadcast condition not met for chat message. currentRoom: ${currentRoom}, username: ${data.username}, content: ${data.content}`);
                }
                break;

            case 'rateToken':
                if (data.tokenAddress && data.emoji) {
                    const tokenAddress = data.tokenAddress;
                    if (!tokenRatings.has(tokenAddress)) {
                        tokenRatings.set(tokenAddress, {});
                    }
                    
                    const stats = tokenRatings.get(tokenAddress);
                    stats[data.emoji] = (stats[data.emoji] || 0) + 1;
                    
                    // Broadcast updated stats to all users in the token room
                    const roomId = `token-${tokenAddress}`;
                    rooms.get(roomId)?.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'emojiUpdate',
                                stats
                            }));
                        }
                    });
                }
                break;

            case 'updateUsername':
                username = data.username;
                break;
            
            case 'audio': // NEW: Handle incoming audio data
                if (currentRoom && data.data) {
                    const audioMessage = {
                        type: 'audio',
                        roomId: currentRoom,
                        data: data.data // The audio ArrayBuffer as an array of numbers
                    };
                    console.log(`Broadcasting audio data to room ${currentRoom}.`);
                    rooms.get(currentRoom)?.forEach(client => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) { // Don't send back to sender
                            client.send(JSON.stringify(audioMessage));
                        }
                    });
                } else {
                    console.warn(`Audio data broadcast condition not met. currentRoom: ${currentRoom}, data.data: ${data.data}`);
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected from room ${currentRoom || 'N/A'}`); // Log client disconnection
        if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) {
                room.delete(ws);
                if (room.size === 0) {
                    rooms.delete(currentRoom);
                }
            }
        }
    });

    ws.on('error', (error) => {
        console.error(`WebSocket client error: ${error.message}`); // Log WebSocket client errors
    });
});

// Listen for HTTP server errors
server.on('error', (err) => {
    console.error('HTTP server error:', err);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => { // Explicitly bind to 0.0.0.0
    console.log(`WebSocket server is running on port ${PORT}`);
    console.log(`process.env.PORT is: ${process.env.PORT}`); // Log the actual environment variable
}); 