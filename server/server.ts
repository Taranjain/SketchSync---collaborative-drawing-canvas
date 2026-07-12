// server/server.ts
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { defaultRoom } from './rooms.js';
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
    
    ws.on('message', (message: string) => {
        try {
            const data = JSON.parse(message.toString());
            
            switch (data.type) {
                case 'join': {
                    const userName = data.name || 'Anonymous';
                    const user = defaultRoom.addUser(userId, userName, ws);
                    
                    ws.send(JSON.stringify({
                        type: 'init-state',
                        userId: user.id,
                        color: user.color,
                        history: defaultRoom.drawingState.getHistory(),
                        users: defaultRoom.getAllUsersSafe()
                    }));
                    
                    defaultRoom.broadcast({
                        type: 'user-joined',
                        user: { id: user.id, name: user.name, color: user.color }
                    }, userId);
                    
                    defaultRoom.broadcast({
                        type: 'user-list',
                        users: defaultRoom.getAllUsersSafe()
                    });
                    break;
                }
                
                case 'draw-start':
                case 'draw-move':
                case 'cursor-move': {
                    data.userId = userId;
                    defaultRoom.broadcast(data, userId);
                    break;
                }
                
                case 'draw-end': {
                    const stroke = data.stroke as Stroke;
                    stroke.userId = userId; 
                    
                    defaultRoom.drawingState.addStroke(stroke);
                    
                    defaultRoom.broadcast({
                        type: 'draw-end',
                        stroke: stroke
                    }, userId);
                    break;
                }
                
                case 'undo': {
                    const undoneStroke = defaultRoom.drawingState.undo();
                    if (undoneStroke) {
                        const undoMsg = {
                            type: 'undo-event',
                            strokeId: undoneStroke.id
                        };
                        defaultRoom.broadcast(undoMsg);
                        ws.send(JSON.stringify(undoMsg));
                    }
                    break;
                }
                
                case 'redo': {
                    const redoneStroke = defaultRoom.drawingState.redo();
                    if (redoneStroke) {
                        const redoMsg = {
                            type: 'redo-event',
                            stroke: redoneStroke
                        };
                        defaultRoom.broadcast(redoMsg);
                        ws.send(JSON.stringify(redoMsg));
                    }
                    break;
                }
                
                case 'clear': {
                    defaultRoom.drawingState.clear();
                    const clearMsg = { type: 'clear-event' };
                    defaultRoom.broadcast(clearMsg);
                    ws.send(JSON.stringify(clearMsg));
                    break;
                }
            }
        } catch (e) {
            console.error("Failed to parse or process WebSocket message", e);
        }
    });

    ws.on('close', () => {
        defaultRoom.removeUser(userId);
        
        defaultRoom.broadcast({
            type: 'user-left',
            userId: userId
        });
        
        defaultRoom.broadcast({
            type: 'user-list',
            users: defaultRoom.getAllUsersSafe()
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
