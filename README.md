# Real-Time Collaborative Drawing Canvas

A high-performance, real-time collaborative drawing canvas built with pure HTML5 Canvas, Vanilla TypeScript, Express, and native WebSockets.

## 🚀 Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the TypeScript files (both client and server):
   ```bash
   npm run build
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open `http://localhost:3000` in your browser.
5. To test collaboration, open the same URL in a new window or incognito tab!

## ✨ Features
- **Real-Time Sync**: View other users' drawings as they draw them, without waiting for the stroke to finish.
- **Global Undo/Redo**: A robust global state machine allows any user to undo the absolute last stroke drawn on the canvas, instantly syncing across all clients.
- **Layered Canvas Architecture**: Double-buffering using a static canvas (history) and dynamic canvas (active strokes/cursors) ensures smooth 60 FPS drawing even with thousands of strokes.
- **Zoom & Pan**: Infinite canvas feel with mouse-wheel panning, button zooms, and Ctrl+scroll zoom support.
- **Mobile Touch Support**: Full touch support ensuring drawing works perfectly on tablets and phones.
- **Dark Mode**: Switch seamlessly between light and dark themes.

## ⚠️ Known Limitations
- The canvas history is stored in-memory on the server. Restarting the server will clear the canvas.
- Erasing is implemented as a background-color stroke on top of existing strokes, rather than modifying the underlying path data mathematically.
