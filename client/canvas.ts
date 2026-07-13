// client/canvas.ts
import { SocketManager } from './websocket.js';

export interface Point { x: number; y: number; }
export type Tool = 'brush' | 'eraser' | 'stroke-eraser' | 'shape' | 'text';
export type ShapeType = 'rectangle' | 'circle' | 'line';

export interface Stroke {
    id: string;
    userId: string;
    tool: Tool;
    color: string;
    width: number;
    points: Point[];
    shapeType?: ShapeType;
    text?: string;
}

export class CanvasManager {
    private staticCtx: CanvasRenderingContext2D;
    private dynamicCtx: CanvasRenderingContext2D;
    
    private width = 0;
    private height = 0;
    
    private scale = 1;
    private offsetX = 0;
    private offsetY = 0;
    
    private isDrawing = false;
    private isPanning = false;
    private lastPanPoint: Point | null = null;
    private currentStroke: Stroke | null = null;
    
    private history: Stroke[] = [];
    private activeRemoteStrokes = new Map<string, Stroke>();
    private remoteCursors = new Map<string, Point>();
    public users = new Map<string, any>();
    
    public activeTool: Tool = 'brush';
    public activeShapeType: ShapeType = 'rectangle';
    public activeColor: string = '#000000';
    public activeWidth: number = 5;
    public myUserId: string = '';
    
    constructor(
        private staticCanvas: HTMLCanvasElement,
        private dynamicCanvas: HTMLCanvasElement,
        private socket: SocketManager
    ) {
        this.staticCtx = this.staticCanvas.getContext('2d', { alpha: false })!;
        this.dynamicCtx = this.dynamicCanvas.getContext('2d')!;
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.setupEvents();
        this.startRenderLoop();
    }
    
    private resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        
        this.staticCanvas.width = this.width;
        this.staticCanvas.height = this.height;
        this.dynamicCanvas.width = this.width;
        this.dynamicCanvas.height = this.height;
        
        this.redrawStaticCanvas();
    }
    
    private toWorld(screenPoint: Point): Point {
        return {
            x: (screenPoint.x - this.offsetX) / this.scale,
            y: (screenPoint.y - this.offsetY) / this.scale
        };
    }
    
    private applyTransform(ctx: CanvasRenderingContext2D) {
        ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    }
    
    private setupEvents() {
        const el = this.dynamicCanvas;
        
        el.addEventListener('pointerdown', this.onPointerDown.bind(this));
        el.addEventListener('pointermove', this.onPointerMove.bind(this));
        el.addEventListener('pointerup', this.onPointerUp.bind(this));
        el.addEventListener('pointercancel', this.onPointerUp.bind(this));
        
        el.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
        el.addEventListener('contextmenu', e => e.preventDefault());
    }
    
    private onPointerDown(e: PointerEvent) {
        if (e.button === 1 || e.button === 2 || e.shiftKey) {
            this.isPanning = true;
            this.lastPanPoint = { x: e.clientX, y: e.clientY };
            return;
        }
        
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        
        this.isDrawing = true;
        const worldPt = this.toWorld({ x: e.clientX, y: e.clientY });
        
        if (this.activeTool === 'stroke-eraser') {
            this.isDrawing = true;
            this.checkErase(worldPt);
            return;
        }

        if (this.activeTool === 'text') {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            this.isDrawing = false;
            this.spawnTextInput(e.clientX, e.clientY, worldPt);
            return;
        }
        
        this.isDrawing = true;
        this.currentStroke = {
            id: Math.random().toString(36).substr(2, 9),
            userId: this.myUserId,
            tool: this.activeTool,
            color: this.activeTool === 'eraser' ? '#ffffff' : this.activeColor,
            width: this.activeWidth,
            points: [worldPt],
            ...(this.activeTool === 'shape' ? { shapeType: this.activeShapeType } : {})
        };
        
        this.socket.send({ type: 'draw-start', stroke: this.currentStroke });
    }

    private spawnTextInput(clientX: number, clientY: number, worldPt: Point) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'floating-text-input';
        input.style.left = `${clientX}px`;
        input.style.top = `${clientY}px`;
        input.style.fontSize = `${this.activeWidth * 4 * this.scale}px`;
        input.style.color = this.activeColor;
        
        document.body.appendChild(input);
        
        // Delay focus to prevent mousedown on canvas from instantly blurring it
        setTimeout(() => input.focus(), 50);

        let finalized = false;
        const finalizeText = () => {
            if (finalized) return;
            finalized = true;
            
            const text = input.value.trim();
            input.remove();
            if (text) {
                const stroke: Stroke = {
                    id: Math.random().toString(36).substr(2, 9),
                    userId: this.myUserId,
                    tool: 'text',
                    color: this.activeColor,
                    width: this.activeWidth,
                    points: [worldPt],
                    text: text
                };
                this.history.push(stroke);
                this.socket.send({ type: 'draw-end', stroke: stroke });
                this.renderStroke(this.staticCtx, stroke);
            }
        };

        input.addEventListener('blur', finalizeText);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finalizeText();
            if (e.key === 'Escape') input.remove();
        });
    }
    
    private onPointerMove(e: PointerEvent) {
        if (this.isPanning && this.lastPanPoint) {
            const dx = e.clientX - this.lastPanPoint.x;
            const dy = e.clientY - this.lastPanPoint.y;
            this.offsetX += dx;
            this.offsetY += dy;
            this.lastPanPoint = { x: e.clientX, y: e.clientY };
            this.redrawStaticCanvas();
            return;
        }
        
        const worldPt = this.toWorld({ x: e.clientX, y: e.clientY });
        
        if (this.isDrawing) {
            if (this.activeTool === 'stroke-eraser') {
                this.checkErase(worldPt);
            } else if (this.currentStroke) {
                if (this.activeTool === 'shape') {
                    this.currentStroke.points[1] = worldPt;
                } else {
                    this.currentStroke.points.push(worldPt);
                }
                this.socket.send({ type: 'draw-move', point: worldPt, strokeId: this.currentStroke.id });
            }
        } else {
            this.socket.send({ type: 'cursor-move', point: worldPt });
        }
    }
    
    private onPointerUp(e: PointerEvent) {
        if (this.isPanning) {
            this.isPanning = false;
            return;
        }
        
        if (this.isDrawing) {
            this.isDrawing = false;
            
            if (this.activeTool !== 'stroke-eraser' && this.currentStroke) {
                this.history.push(this.currentStroke);
                this.socket.send({ type: 'draw-end', stroke: this.currentStroke });
                this.renderStroke(this.staticCtx, this.currentStroke);
                this.currentStroke = null;
            }
        }
    }
    
    private distToSegmentSquared(p: Point, v: Point, w: Point) {
        const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
        if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
    }

    private checkErase(worldPt: Point) {
        const threshold = this.activeWidth / 2; 
        let erased = false;
        
        for (let i = this.history.length - 1; i >= 0; i--) {
            const stroke = this.history[i];
            const strokeThreshold = (stroke.width / 2) + threshold;
            const strokeThresholdSq = strokeThreshold * strokeThreshold;
            
            let hit = false;
            if (stroke.points.length === 1) {
                const p = stroke.points[0];
                const distSq = (worldPt.x - p.x)**2 + (worldPt.y - p.y)**2;
                if (distSq <= strokeThresholdSq) hit = true;
            } else {
                for (let j = 0; j < stroke.points.length - 1; j++) {
                    const p1 = stroke.points[j];
                    const p2 = stroke.points[j+1];
                    const distSq = this.distToSegmentSquared(worldPt, p1, p2);
                    if (distSq <= strokeThresholdSq) {
                        hit = true;
                        break;
                    }
                }
            }
            
            if (hit) {
                this.history.splice(i, 1);
                this.socket.send({ type: 'erase-stroke', strokeId: stroke.id });
                erased = true;
            }
        }
        
        if (erased) {
            this.redrawStaticCanvas();
        }
    }
    
    private onWheel(e: WheelEvent) {
        e.preventDefault();
        
        if (e.ctrlKey || e.metaKey) {
            const zoomSensitivity = 0.001;
            const delta = -e.deltaY * zoomSensitivity;
            const newScale = Math.min(Math.max(0.1, this.scale + delta), 5);
            
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            
            this.offsetX = mouseX - (mouseX - this.offsetX) * (newScale / this.scale);
            this.offsetY = mouseY - (mouseY - this.offsetY) * (newScale / this.scale);
            this.scale = newScale;
            
            this.redrawStaticCanvas();
        } else {
            this.offsetX -= e.deltaX;
            this.offsetY -= e.deltaY;
            this.redrawStaticCanvas();
        }
    }
    
    public setZoom(zoomIn: boolean) {
        const factor = zoomIn ? 1.2 : 0.8;
        const newScale = Math.min(Math.max(0.1, this.scale * factor), 5);
        
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        this.offsetX = centerX - (centerX - this.offsetX) * (newScale / this.scale);
        this.offsetY = centerY - (centerY - this.offsetY) * (newScale / this.scale);
        this.scale = newScale;
        
        this.redrawStaticCanvas();
    }
    
    public resetZoom() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.redrawStaticCanvas();
    }
    
    public setHistory(history: Stroke[]) {
        this.history = history;
        this.redrawStaticCanvas();
    }
    
    public addRemoteStrokeStart(userId: string, stroke: Stroke) {
        this.activeRemoteStrokes.set(userId, stroke);
    }
    
    public updateRemoteStroke(userId: string, strokeId: string, point: Point) {
        const stroke = this.activeRemoteStrokes.get(userId);
        if (stroke && stroke.id === strokeId) {
            if (stroke.tool === 'shape') {
                stroke.points[1] = point;
            } else {
                stroke.points.push(point);
            }
        }
    }
    
    public finishRemoteStroke(userId: string, stroke: Stroke) {
        this.activeRemoteStrokes.delete(userId);
        this.history.push(stroke);
        this.renderStroke(this.staticCtx, stroke);
    }
    
    public updateRemoteCursor(userId: string, point: Point) {
        this.remoteCursors.set(userId, point);
    }
    
    public removeRemoteUser(userId: string) {
        this.activeRemoteStrokes.delete(userId);
        this.remoteCursors.delete(userId);
        this.users.delete(userId);
    }
    
    public removeStroke(strokeId: string) {
        this.history = this.history.filter(s => s.id !== strokeId);
        this.redrawStaticCanvas();
    }
    
    public addStrokeHistory(stroke: Stroke) {
        this.history.push(stroke);
        this.redrawStaticCanvas();
    }
    
    public redrawStaticCanvas() {
        const bgColor = getComputedStyle(document.body).getPropertyValue('--canvas-bg').trim() || '#ffffff';
        
        this.staticCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.staticCtx.fillStyle = bgColor;
        this.staticCtx.fillRect(0, 0, this.width, this.height);
        
        this.applyTransform(this.staticCtx);
        for (const stroke of this.history) {
            this.renderStroke(this.staticCtx, stroke);
        }
    }
    
    private renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
        if (stroke.points.length === 0) return;
        
        ctx.beginPath();
        ctx.strokeStyle = stroke.tool === 'eraser' ? 
            getComputedStyle(document.body).getPropertyValue('--canvas-bg').trim() : 
            stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (stroke.tool === 'text' && stroke.text) {
            ctx.font = `${stroke.width * 4}px 'Inter', sans-serif`;
            ctx.fillText(stroke.text, stroke.points[0].x, stroke.points[0].y + (stroke.width * 4));
            return;
        }

        if (stroke.tool === 'shape' && stroke.points.length > 1) {
            const p1 = stroke.points[0];
            const p2 = stroke.points[1];
            
            if (stroke.shapeType === 'rectangle') {
                ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
            } else if (stroke.shapeType === 'circle') {
                const r = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
                ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (stroke.shapeType === 'line') {
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
            return;
        }
        
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        
        if (stroke.points.length === 1) {
            ctx.lineTo(stroke.points[0].x, stroke.points[0].y + 0.001);
        } else {
            for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
        }
        
        ctx.stroke();
    }
    
    private startRenderLoop() {
        const render = () => {
            this.dynamicCtx.clearRect(0, 0, this.width, this.height);
            
            this.applyTransform(this.dynamicCtx);
            
            if (this.isDrawing && this.currentStroke) {
                this.renderStroke(this.dynamicCtx, this.currentStroke);
            }
            
            for (const stroke of this.activeRemoteStrokes.values()) {
                this.renderStroke(this.dynamicCtx, stroke);
            }
            
            this.dynamicCtx.setTransform(1, 0, 0, 1, 0, 0);
            
            for (const [userId, point] of this.remoteCursors.entries()) {
                const user = this.users.get(userId);
                if (!user) continue;
                
                const screenX = point.x * this.scale + this.offsetX;
                const screenY = point.y * this.scale + this.offsetY;
                
                this.dynamicCtx.beginPath();
                this.dynamicCtx.fillStyle = user.color;
                this.dynamicCtx.arc(screenX, screenY, 6, 0, Math.PI * 2);
                this.dynamicCtx.fill();
                this.dynamicCtx.strokeStyle = '#fff';
                this.dynamicCtx.lineWidth = 1;
                this.dynamicCtx.stroke();
                
                this.dynamicCtx.font = '12px Inter, sans-serif';
                const textWidth = this.dynamicCtx.measureText(user.name).width;
                this.dynamicCtx.fillStyle = user.color;
                this.dynamicCtx.fillRect(screenX + 10, screenY, textWidth + 10, 20);
                this.dynamicCtx.fillStyle = '#fff';
                this.dynamicCtx.fillText(user.name, screenX + 15, screenY + 14);
            }
            
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
}
