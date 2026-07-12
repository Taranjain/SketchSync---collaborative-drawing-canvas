# Architecture & Technical Decisions

## Data Flow Diagram
```text
Client A (Draw Move) -> WebSocket (JSON) -> Express Server -> WebSocket Broadcast -> Client B (Render)
```

## WebSocket Protocol
The application communicates via native JSON messages over WebSockets.
- `join` -> `{ type: 'join', name: 'User' }`
- `init-state` <- Server sends back online users and full canvas stroke history.
- `draw-start` / `draw-move` / `draw-end` <-> Streams point coordinates in real-time.
- `cursor-move` <-> Broadcasts mouse positions to display labeled indicators.
- `undo` / `redo` / `clear` <-> Global state modification events.

## Layered Canvas Strategy (Performance)
To handle high-frequency mouse events without stuttering, the app uses **two superimposed canvases**:
1. **Static Canvas (Bottom Layer)**: Renders only finalized strokes from the server's history. It is only redrawn when a stroke finishes, an undo/redo occurs, or the user zooms/pans.
2. **Dynamic Canvas (Top Layer)**: Redrawn continuously using `requestAnimationFrame`. It renders currently active (in-progress) strokes for all users and their moving cursors.

This avoids the $O(N)$ cost of redrawing thousands of historical strokes every time the mouse moves.

## Global Undo/Redo Strategy
Undo/Redo operates on a **Shared Global History Stack**:
- The server maintains `activeStrokes` and a `redoStack`.
- When a user clicks Undo, the server pops the last stroke from `activeStrokes` and pushes it to `redoStack`.
- The server broadcasts an `undo-event` with the `strokeId`.
- Clients remove that stroke from their local history array and trigger a full redraw of the `Static Canvas`.
- **Conflict Resolution**: By recalculating the canvas solely from the chronological history array, conflicts are resolved naturally. If User A undoes User B's stroke, the canvas renders the exact remaining history, maintaining the correct overlapping visual order seamlessly.

## Zoom and Pan Math
The canvas operates on a virtual "world coordinate" system.
When drawing, screen coordinates $(x, y)$ are converted to world coordinates:
```javascript
worldX = (screenX - offsetX) / scale;
worldY = (screenY - offsetY) / scale;
```
When rendering, the context applies the transformation matrix: 
```javascript
ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
```
This guarantees that zooming centers correctly and panning shifts the infinite plane intuitively.
