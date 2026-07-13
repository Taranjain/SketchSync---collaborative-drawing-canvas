// client/main.ts
import { SocketManager } from './websocket.js';
import { CanvasManager } from './canvas.js';

const overlay = document.getElementById('join-overlay')!;
const usernameInput = document.getElementById('username-input') as HTMLInputElement;
const btnPublicA = document.getElementById('btn-public-a')!;
const btnPublicB = document.getElementById('btn-public-b')!;
const btnPrivateJoin = document.getElementById('btn-private-join')!;
const privateRoomInput = document.getElementById('private-room-input') as HTMLInputElement;
const app = document.getElementById('app')!;
const statusIndicator = document.getElementById('connection-status')!;
const userListEl = document.getElementById('user-list')!;
const themeToggle = document.getElementById('theme-toggle')!;

const staticCanvas = document.getElementById('static-canvas') as HTMLCanvasElement;
const dynamicCanvas = document.getElementById('dynamic-canvas') as HTMLCanvasElement;

const toolBrush = document.getElementById('tool-brush')!;
const toolEraser = document.getElementById('tool-eraser')!;
const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
const widthSlider = document.getElementById('width-slider') as HTMLInputElement;
const btnUndo = document.getElementById('btn-undo')!;
const btnRedo = document.getElementById('btn-redo')!;
const btnClear = document.getElementById('btn-clear')!;
const btnZoomIn = document.getElementById('btn-zoom-in')!;
const btnZoomOut = document.getElementById('btn-zoom-out')!;
const btnZoomReset = document.getElementById('btn-zoom-reset')!;

const eraserOptions = document.getElementById('eraser-options')!;
const eraserModeToggle = document.getElementById('eraser-mode-toggle') as HTMLInputElement;

const socket = new SocketManager();
const canvas = new CanvasManager(staticCanvas, dynamicCanvas, socket);

function init() {
    const savedName = localStorage.getItem('sketchSyncUsername');
    if (savedName) {
        usernameInput.value = savedName;
    }

    const joinRoom = (roomId: string) => {
        const name = usernameInput.value.trim() || 'Anonymous';
        localStorage.setItem('sketchSyncUsername', name);
        socket.connect(name, roomId);
        overlay.classList.add('hidden');
        app.classList.remove('hidden');
        canvas.redrawStaticCanvas();
    };

    btnPublicA.addEventListener('click', () => joinRoom('public-a'));
    btnPublicB.addEventListener('click', () => joinRoom('public-b'));
    btnPrivateJoin.addEventListener('click', () => {
        const roomId = privateRoomInput.value.trim();
        if (roomId) joinRoom(roomId);
        else alert('Please enter a Room ID');
    });

    privateRoomInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') btnPrivateJoin.click();
    });

    setupToolbar();
    setupSocketEvents();
}

function setupToolbar() {
    const tools = ['brush', 'eraser', 'shape', 'text'];
    const eraserOptions = document.getElementById('eraser-options')!;
    const shapeOptions = document.getElementById('shape-options')!;
    const eraserModeToggle = document.getElementById('eraser-mode-toggle') as HTMLInputElement;
    const shapeTypeSelect = document.getElementById('shape-type-select') as HTMLSelectElement;
    
    tools.forEach(tool => {
        document.getElementById(`tool-${tool}`)?.addEventListener('click', (e) => {
            document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            
            if (tool === 'eraser') {
                canvas.activeTool = eraserModeToggle.checked ? 'stroke-eraser' : 'eraser';
                eraserOptions.classList.remove('hidden');
                shapeOptions.classList.add('hidden');
            } else if (tool === 'shape') {
                canvas.activeTool = 'shape';
                canvas.activeShapeType = shapeTypeSelect.value as any;
                shapeOptions.classList.remove('hidden');
                eraserOptions.classList.add('hidden');
            } else {
                canvas.activeTool = tool as any;
                eraserOptions.classList.add('hidden');
                shapeOptions.classList.add('hidden');
            }
        });
    });

    eraserModeToggle.addEventListener('change', (e) => {
        if (canvas.activeTool === 'eraser' || canvas.activeTool === 'stroke-eraser') {
            canvas.activeTool = (e.target as HTMLInputElement).checked ? 'stroke-eraser' : 'eraser';
        }
    });

    shapeTypeSelect.addEventListener('change', (e) => {
        canvas.activeShapeType = (e.target as HTMLSelectElement).value as any;
        if (canvas.activeTool !== 'shape') {
            document.getElementById('tool-shape')?.click();
        }
    });

    colorPicker.addEventListener('input', (e) => {
        canvas.activeColor = (e.target as HTMLInputElement).value;
    });

    widthSlider.addEventListener('input', (e) => {
        canvas.activeWidth = parseInt((e.target as HTMLInputElement).value, 10);
    });

    btnUndo.addEventListener('click', () => socket.send({ type: 'undo' }));
    btnRedo.addEventListener('click', () => socket.send({ type: 'redo' }));
    
    btnClear.addEventListener('click', () => {
        if(confirm("Are you sure you want to clear the canvas for everyone?")) {
            socket.send({ type: 'clear' });
        }
    });

    btnZoomIn.addEventListener('click', () => canvas.setZoom(true));
    btnZoomOut.addEventListener('click', () => canvas.setZoom(false));
    btnZoomReset.addEventListener('click', () => canvas.resetZoom());

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        canvas.redrawStaticCanvas();
    });
}

function setupSocketEvents() {
    socket.onStatusChange((connected) => {
        statusIndicator.className = 'status ' + (connected ? 'connected' : 'disconnected');
        statusIndicator.title = connected ? 'Connected' : 'Disconnected';
    });

    socket.onMessage((msg) => {
        switch (msg.type) {
            case 'init-state':
                canvas.myUserId = msg.userId;
                canvas.setHistory(msg.history);
                updateUserList(msg.users);
                break;
                
            case 'user-list':
                updateUserList(msg.users);
                break;
                
            case 'user-left':
                canvas.removeRemoteUser(msg.userId);
                break;
                
            case 'draw-start':
                canvas.addRemoteStrokeStart(msg.userId, msg.stroke);
                break;
                
            case 'draw-move':
                canvas.updateRemoteStroke(msg.userId, msg.strokeId, msg.point);
                break;
                
            case 'draw-end':
                canvas.finishRemoteStroke(msg.userId, msg.stroke);
                break;
                
                case 'cursor-move':
                canvas.updateRemoteCursor(msg.userId, msg.point);
                break;
                
            case 'undo-event':
                canvas.removeStroke(msg.strokeId);
                break;
                
            case 'redo-event':
                canvas.addStrokeHistory(msg.stroke);
                break;
                
            case 'erase-stroke-event':
                canvas.removeStroke(msg.strokeId);
                break;
                
            case 'clear-event':
                canvas.setHistory([]);
                break;
        }
    });
}

function updateUserList(users: any[]) {
    canvas.users.clear();
    userListEl.innerHTML = '';
    
    for (const u of users) {
        canvas.users.set(u.id, u);
        
        const li = document.createElement('li');
        li.className = 'user-item';
        
        const colorIndicator = document.createElement('div');
        colorIndicator.className = 'user-color';
        colorIndicator.style.backgroundColor = u.color;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = u.name + (u.id === canvas.myUserId ? ' (You)' : '');
        
        li.appendChild(colorIndicator);
        li.appendChild(nameSpan);
        userListEl.appendChild(li);
    }
}

init();
