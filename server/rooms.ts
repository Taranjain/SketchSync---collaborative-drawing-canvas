// server/rooms.ts
import { WebSocket } from 'ws';
import { DrawingState } from './drawing-state.js';

export interface User {
    id: string;
    name: string;
    color: string;
    ws: WebSocket;
}

export class RoomManager {
    private users: Map<string, User> = new Map();
    public drawingState: DrawingState = new DrawingState();
    
    private userColors = [
        '#FF6B6B',
        '#4ECDC4',
        '#45B7D1',
        '#96CEB4',
        '#F3A683',
        '#D4A5A5',
        '#9B59B6',
        '#3498DB'
    ];
    private colorIndex = 0;
    
    addUser(id: string, name: string, ws: WebSocket): User {
        const color = this.userColors[this.colorIndex % this.userColors.length];
        this.colorIndex++;
        
        const user: User = { id, name, color, ws };
        this.users.set(id, user);
        return user;
    }
    
    removeUser(id: string) {
        this.users.delete(id);
    }
    
    getAllUsersSafe() {
        return Array.from(this.users.values()).map(u => ({
            id: u.id,
            name: u.name,
            color: u.color
        }));
    }
    
    broadcast(message: any, excludeId?: string) {
        const data = JSON.stringify(message);
        for (const [id, user] of this.users.entries()) {
            if (id !== excludeId && user.ws.readyState === WebSocket.OPEN) {
                user.ws.send(data);
            }
        }
    }
}

export const rooms: Map<string, RoomManager> = new Map();

// Initialize the default public rooms
rooms.set('public-a', new RoomManager());
rooms.set('public-b', new RoomManager());

export function getOrCreateRoom(roomId: string): RoomManager {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new RoomManager());
    }
    return rooms.get(roomId)!;
}
