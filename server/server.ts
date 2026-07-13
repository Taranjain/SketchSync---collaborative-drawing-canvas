// server/server.ts
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOrCreateRoom } from './rooms.js';
import { Stroke } from './drawing-state.js';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isCompiled = __dirname.includes('dist');
const clientPath = isCompiled 
    ? path.join(__dirname, '../../client') 
    : path.join(__dirname, '../client');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(clientPath));

wss.on('connection', (ws: WebSocket) => {
    const userId = randomUUID();
    let currentRoomId: string | null = null;
    
    ws.on('message', (message: string) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'join') {
                currentRoomId = data.roomId || 'public-a';
                const currentRoom = getOrCreateRoom(currentRoomId!);
                
                const userName = data.name || 'Anonymous';
                const user = currentRoom.addUser(userId, userName, ws);
                
                ws.send(JSON.stringify({
                    type: 'init-state',
                    userId: user.id,
                    color: user.color,
                    history: currentRoom.drawingState.getHistory(),
                    users: currentRoom.getAllUsersSafe()
                }));
                
                currentRoom.broadcast({
                    type: 'user-joined',
                    user: { id: user.id, name: user.name, color: user.color }
                }, userId);
                
                currentRoom.broadcast({
                    type: 'user-list',
                    users: currentRoom.getAllUsersSafe()
                });
                return;
            }

            if (!currentRoomId) return;
            const currentRoom = getOrCreateRoom(currentRoomId);

            switch (data.type) {
                case 'draw-start':
                case 'draw-move':
                case 'cursor-move': {
                    data.userId = userId;
                    currentRoom.broadcast(data, userId);
                    break;
                }
                
                case 'draw-end': {
                    const stroke = data.stroke as Stroke;
                    stroke.userId = userId; 
                    
                    currentRoom.drawingState.addStroke(stroke);
                    
                    currentRoom.broadcast({
                        type: 'draw-end',
                        userId: userId,
                        stroke: stroke
                    }, userId);
                    break;
                }
                
                case 'undo': {
                    const undoneStroke = currentRoom.drawingState.undo();
                    if (undoneStroke) {
                        const undoMsg = {
                            type: 'undo-event',
                            strokeId: undoneStroke.id
                        };
                        currentRoom.broadcast(undoMsg);
                        ws.send(JSON.stringify(undoMsg));
                    }
                    break;
                }
                
                case 'redo': {
                    const redoneStroke = currentRoom.drawingState.redo();
                    if (redoneStroke) {
                        const redoMsg = {
                            type: 'redo-event',
                            stroke: redoneStroke
                        };
                        currentRoom.broadcast(redoMsg);
                        ws.send(JSON.stringify(redoMsg));
                    }
                    break;
                }
                
                case 'clear': {
                    currentRoom.drawingState.clear();
                    const clearMsg = { type: 'clear-event' };
                    currentRoom.broadcast(clearMsg);
                    ws.send(JSON.stringify(clearMsg));
                    break;
                }
                
                case 'erase-stroke': {
                    const strokeId = data.strokeId;
                    if (strokeId) {
                        currentRoom.drawingState.removeStroke(strokeId);
                        currentRoom.broadcast({
                            type: 'erase-stroke-event',
                            strokeId: strokeId
                        }, userId);
                    }
                    break;
                }
            }
        } catch (e) {
            console.error("Failed to parse or process WebSocket message", e);
        }
    });

    ws.on('close', () => {
        if (currentRoomId) {
            const currentRoom = getOrCreateRoom(currentRoomId);
            currentRoom.removeUser(userId);
            
            currentRoom.broadcast({
                type: 'user-left',
                userId: userId
            });
            
            currentRoom.broadcast({
                type: 'user-list',
                users: currentRoom.getAllUsersSafe()
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
