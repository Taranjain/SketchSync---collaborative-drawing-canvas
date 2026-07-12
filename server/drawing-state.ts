// server/drawing-state.ts

export type Tool = 'brush' | 'eraser';

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
}

export class DrawingState {
    private activeStrokes: Stroke[] = [];
    private redoStack: Stroke[] = [];
    
    constructor() {}
    
    addStroke(stroke: Stroke) {
        this.activeStrokes.push(stroke);
        this.redoStack = []; 
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
