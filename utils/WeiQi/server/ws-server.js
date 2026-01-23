/* eslint-disable no-console */
const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');

const port = Number.parseInt(process.env.PORT, 10) || 3001;
const sslKeyPath = process.env.SSL_KEY;
const sslCertPath = process.env.SSL_CERT;
let wss;
let server;

if (sslKeyPath && sslCertPath) {
    const options = {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath)
    };
    server = https.createServer(options);
    wss = new WebSocket.Server({ server });
    server.listen(port);
} else {
    wss = new WebSocket.Server({ port });
}

const rooms = new Map();

function normalizeRoomId(roomId) {
    return String(roomId || '').trim();
}

function getOrCreateRoom(roomId, password) {
    const existing = rooms.get(roomId);
    if (existing) {
        return existing;
    }
    const room = {
        roomId,
        password,
        players: new Map(),
        spectators: new Set(),
        game: null
    };
    rooms.set(roomId, room);
    return room;
}

function removeFromRoom(ws) {
    const roomId = ws.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (ws.role === 'player' && ws.clientId) {
        room.players.delete(ws.clientId);
    } else {
        room.spectators.delete(ws);
    }

    if (room.players.size === 0 && room.spectators.size === 0) {
        rooms.delete(roomId);
    }
}

function broadcastRoom(room, message, excludeId) {
    const payload = JSON.stringify(message);
    room.players.forEach((entry, clientId) => {
        if (excludeId && clientId === excludeId) {
            return;
        }
        if (entry.ws.readyState === WebSocket.OPEN) {
            entry.ws.send(payload);
        }
    });
    room.spectators.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
        }
    });
}

function assignColor(room) {
    const colors = Array.from(room.players.values()).map(player => player.color);
    return colors.includes(1) ? 2 : 1;
}

wss.on('connection', ws => {
    ws.on('message', raw => {
        let data;
        try {
            data = JSON.parse(raw.toString());
        } catch (error) {
            return;
        }

        if (!data || typeof data !== 'object') {
            return;
        }

        if (data.type === 'join') {
            const roomId = normalizeRoomId(data.roomId);
            const password = String(data.password || '');
            const role = data.role === 'spectator' ? 'spectator' : 'player';
            const clientId = String(data.clientId || '');

            if (!roomId || !password || !clientId) {
                ws.send(JSON.stringify({ type: 'join-ack', ok: false, reason: '房间号或密码无效。' }));
                return;
            }

            let room = rooms.get(roomId);
            if (!room) {
                if (role === 'spectator') {
                    ws.send(JSON.stringify({ type: 'join-ack', ok: false, reason: '房间不存在，无法观战。' }));
                    return;
                }
                room = getOrCreateRoom(roomId, password);
            }

            if (room.password !== password) {
                ws.send(JSON.stringify({ type: 'join-ack', ok: false, reason: '房间号或密码错误。' }));
                return;
            }

            ws.roomId = roomId;
            ws.clientId = clientId;
            ws.role = role;

            if (role === 'player') {
                if (room.players.has(clientId)) {
                    const existing = room.players.get(clientId);
                    room.players.set(clientId, { ws, color: existing.color });
                } else {
                    if (room.players.size >= 2) {
                        ws.send(JSON.stringify({ type: 'join-ack', ok: false, reason: '房间已满，可观战。' }));
                        return;
                    }
                    const color = assignColor(room);
                    room.players.set(clientId, { ws, color });
                }
            } else {
                room.spectators.add(ws);
            }

            const player = room.players.get(clientId);
            ws.send(JSON.stringify({
                type: 'join-ack',
                ok: true,
                roomId: roomId,
                role: role,
                color: player ? player.color : null,
                game: room.game || null
            }));
            return;
        }

        if (data.type === 'leave') {
            removeFromRoom(ws);
            return;
        }

        if (data.type === 'game') {
            const roomId = normalizeRoomId(data.roomId);
            const room = rooms.get(roomId);
            if (!room || ws.role !== 'player') {
                return;
            }
            room.game = data.game || null;
            broadcastRoom(room, {
                type: 'game',
                game: room.game,
                source: data.clientId || ws.clientId || ''
            }, data.clientId);
        }
    });

    ws.on('close', () => {
        removeFromRoom(ws);
    });
});

const scheme = sslKeyPath && sslCertPath ? 'wss' : 'ws';
console.log(`WeiQi LAN server running on ${scheme}://0.0.0.0:${port}`);
