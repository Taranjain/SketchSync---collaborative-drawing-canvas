// client/websocket.ts

export class SocketManager {
    private ws: WebSocket | null = null;
    private onMessageCallback: (msg: any) => void = () => {};
    private onConnectionChange: (connected: boolean) => void = () => {};
    private username: string = '';
    private roomId: string = '';
    
    constructor() {}
    
    connect(username: string, roomId: string) {
        this.username = username;
        this.roomId = roomId;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.onConnectionChange(true);
            this.send({ type: 'join', name: this.username, roomId: this.roomId });
        };
        
        this.ws.onclose = () => {
            this.onConnectionChange(false);
            setTimeout(() => this.connect(this.username, this.roomId), 3000);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.onMessageCallback(data);
            } catch (e) {
                console.error("Message parsing error", e);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error("WebSocket error:", error);
        };
    }
    
    send(data: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    
    onMessage(callback: (msg: any) => void) {
        this.onMessageCallback = callback;
    }
    
    onStatusChange(callback: (connected: boolean) => void) {
        this.onConnectionChange = callback;
    }
}
