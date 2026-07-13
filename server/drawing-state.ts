// server/drawing-state.ts

export type Tool = 'brush' | 'eraser' | 'stroke-eraser' | 'shape' | 'text';
export type ShapeType = 'rectangle' | 'circle' | 'line';

export interface Point {
    x: number;
    y: number;
}

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

export class DrawingState {
    private activeStrokes: Stroke[] = [];
    private redoStack: Stroke[] = [];
    
    constructor() {}
    
    addStroke(stroke: Stroke) {
        this.activeStrokes.push(stroke);
        this.redoStack = []; 
    }
    
    removeStroke(strokeId: string) {
        this.activeStrokes = this.activeStrokes.filter(s => s.id !== strokeId);
    }
    
    undo(): Stroke |null {
        const stroke = this.activeStrokes.pop();
        if (stroke) {
            this.redoStack.push(stroke);
            return stroke;
        }
        return null;
    }
    
    redo(): Stroke |null {
        const stroke = this.redoStack.pop();
        if (stroke) {
            this.activeStrokes.push(stroke);
            return stroke;
        }
        return null;
    }
    
    clear() {
        this.activeStrokes = [];
        this.redoStack = [];
    }
    
    getHistory(): Stroke[] {
        return this.activeStrokes;
    }
}
