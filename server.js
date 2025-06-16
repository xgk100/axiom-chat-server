const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Store active rooms and their users
const rooms = new Map();
// Store emoji ratings for tokens
const tokenRatings = new Map();

wss.on('connection', (ws) => {
    let currentRoom = null;
    let username = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'joinRoom':
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
                // Use data.username directly from the client's message
                if (currentRoom && data.username && data.content) {
                    const message = {
                        type: 'chat',
                        username: data.username, // Get username from the message payload
                        content: data.content // Ensure content is from data.content, not data.message
                    };
                    
                    // Broadcast to all users in the room
                    rooms.get(currentRoom)?.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(message));
                        }
                    });
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
        }
    });

    ws.on('close', () => {
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
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`WebSocket server is running on port ${PORT}`);
}); 