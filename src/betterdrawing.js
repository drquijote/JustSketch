// betterdrawing.js - Clean reimplementation of path and cycle drawing
import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

export class BetterDrawingManager {
    constructor() {
        this.isActive = false;
        this.currentPath = [];
        this.paths = [];
        this.snapRadius = 15;
        this.pixelsPerFoot = 8;
        
        // Bind methods
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
        this.handleCanvasMove = this.handleCanvasMove.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        
        // Ghost vertex for preview
        this.ghostVertex = null;
        
        // For distance/angle input
        this.waitingForInput = false;
        this.inputDistance = 0;
        this.inputAngle = 0;
    }
    
    activate() {
        if (this.isActive) return;
        console.log('🆕 BetterDrawing: Activating');
        this.isActive = true;
        
        // Add event listeners
        const canvas = AppState.canvas;
        if (canvas) {
            canvas.addEventListener('click', this.handleCanvasClick);
            canvas.addEventListener('mousemove', this.handleCanvasMove);
            document.addEventListener('keydown', this.handleKeyDown);
        }
        
        // Show drawing UI
        this.showDrawingUI();
        
        // If we have an incomplete path, continue from it
        if (this.currentPath.length > 0) {
            console.log('🆕 Continuing from existing path with', this.currentPath.length, 'vertices');
        }
        
        AppState.emit('betterdrawing:activated');
        CanvasManager.redraw();
    }
    
    deactivate() {
        if (!this.isActive) return;
        console.log('🆕 BetterDrawing: Deactivating');
        this.isActive = false;
        
        // Remove event listeners
        const canvas = AppState.canvas;
        if (canvas) {
            canvas.removeEventListener('click', this.handleCanvasClick);
            canvas.removeEventListener('mousemove', this.handleCanvasMove);
            document.removeEventListener('keydown', this.handleKeyDown);
        }
        
        // Hide drawing UI
        this.hideDrawingUI();
        
        AppState.emit('betterdrawing:deactivated');
        CanvasManager.redraw();
    }
    
    handleCanvasClick(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Get viewport for coordinate conversion
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        // Convert click coordinates to canvas world coordinates
        const worldX = (event.clientX - rect.left) - AppState.viewportTransform.x;
        const worldY = (event.clientY - rect.top) - AppState.viewportTransform.y;
        
        console.log('🆕 Canvas clicked at:', worldX, worldY);
        
        // Check what was clicked
        const clickResult = this.analyzeClick(worldX, worldY);
        
        if (clickResult.type === 'existingVertex') {
            // Clicked on existing vertex - continue from here
            this.continueFromVertex(clickResult.vertex, clickResult.pathIndex, clickResult.vertexIndex);
        } else if (clickResult.type === 'newPoint') {
            // Place new vertex
            if (this.currentPath.length === 0) {
                this.placeP0(clickResult.x, clickResult.y);
            } else {
                // For p1+, use distance/angle input
                this.promptForDistanceAngle(clickResult.x, clickResult.y);
            }
        }
        
        CanvasManager.redraw();
    }
    
    handleCanvasMove(event) {
        // Get viewport for coordinate conversion
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        // Convert to canvas world coordinates
        const worldX = (event.clientX - rect.left) - AppState.viewportTransform.x;
        const worldY = (event.clientY - rect.top) - AppState.viewportTransform.y;
        
        // Update ghost vertex position
        this.ghostVertex = { x: worldX, y: worldY };
        
        // Check for snap points
        const snapPoint = this.findSnapPoint(screenX, screenY);
        if (snapPoint) {
            this.ghostVertex = { x: snapPoint.x, y: snapPoint.y, snapped: true };
        }
        
        CanvasManager.redraw();
    }
    
    handleKeyDown(event) {
        if (!this.isActive) return;
        
        // Handle arrow keys for directional input
        const angleMap = {
            'ArrowRight': 0,
            'ArrowUp': 90,
            'ArrowLeft': 180,
            'ArrowDown': 270
        };
        
        if (angleMap[event.key] !== undefined) {
            event.preventDefault();
            this.inputAngle = angleMap[event.key];
            
            // Update angle display
            const angleInput = document.getElementById('angleDisplay');
            if (angleInput) {
                angleInput.value = this.inputAngle;
            }
            
            // Try to place vertex if we have distance
            this.checkAndPlaceVertex();
        }
        
        // Handle Ctrl+Z for undo
        if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
            event.preventDefault();
            this.undo();
        }
    }
    
    analyzeClick(x, y) {
        // First check if clicking on existing vertex
        const existingVertex = this.findClickedVertex(x, y);
        if (existingVertex) {
            return existingVertex;
        }
        
        // Check for snap points
        const snapPoint = this.findSnapPoint(x, y);
        if (snapPoint) {
            return { type: 'newPoint', x: snapPoint.x, y: snapPoint.y, snapped: true };
        }
        
        // Regular point
        return { type: 'newPoint', x: x, y: y };
    }
    
    findClickedVertex(x, y) {
        // Check current path
        for (let i = 0; i < this.currentPath.length; i++) {
            const vertex = this.currentPath[i];
            const dist = Math.sqrt(Math.pow(x - vertex.x, 2) + Math.pow(y - vertex.y, 2));
            if (dist <= this.snapRadius) {
                return { 
                    type: 'existingVertex', 
                    vertex: vertex, 
                    pathIndex: -1, // -1 means current path
                    vertexIndex: i 
                };
            }
        }
        
        // Check saved paths
        for (let pathIdx = 0; pathIdx < this.paths.length; pathIdx++) {
            const path = this.paths[pathIdx];
            for (let vertIdx = 0; vertIdx < path.vertices.length; vertIdx++) {
                const vertex = path.vertices[vertIdx];
                const dist = Math.sqrt(Math.pow(x - vertex.x, 2) + Math.pow(y - vertex.y, 2));
                if (dist <= this.snapRadius) {
                    return { 
                        type: 'existingVertex', 
                        vertex: vertex, 
                        pathIndex: pathIdx,
                        vertexIndex: vertIdx 
                    };
                }
            }
        }
        
        return null;
    }
    
    findSnapPoint(x, y) {
        // Check vertices in all paths for snapping
        const allVertices = [...this.currentPath];
        this.paths.forEach(path => allVertices.push(...path.vertices));
        
        for (const vertex of allVertices) {
            const dist = Math.sqrt(Math.pow(x - vertex.x, 2) + Math.pow(y - vertex.y, 2));
            if (dist <= this.snapRadius) {
                return { x: vertex.x, y: vertex.y };
            }
        }
        
        // Check for edge snapping
        const edgeSnap = this.findEdgeSnapPoint(x, y);
        if (edgeSnap) {
            return edgeSnap;
        }
        
        return null;
    }
    
    findEdgeSnapPoint(x, y) {
        // Check edges in all paths
        const checkPath = (vertices) => {
            for (let i = 0; i < vertices.length - 1; i++) {
                const v1 = vertices[i];
                const v2 = vertices[i + 1];
                const snapPoint = this.getClosestPointOnSegment(x, y, v1, v2);
                const dist = Math.sqrt(Math.pow(x - snapPoint.x, 2) + Math.pow(y - snapPoint.y, 2));
                if (dist <= this.snapRadius) {
                    return snapPoint;
                }
            }
            return null;
        };
        
        // Check current path
        if (this.currentPath.length > 1) {
            const snap = checkPath(this.currentPath);
            if (snap) return snap;
        }
        
        // Check saved paths
        for (const path of this.paths) {
            const snap = checkPath(path.vertices);
            if (snap) return snap;
        }
        
        return null;
    }
    
    getClosestPointOnSegment(px, py, v1, v2) {
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const lengthSquared = dx * dx + dy * dy;
        
        if (lengthSquared === 0) {
            return { x: v1.x, y: v1.y };
        }
        
        let t = ((px - v1.x) * dx + (py - v1.y) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));
        
        return {
            x: v1.x + t * dx,
            y: v1.y + t * dy
        };
    }
    
    placeP0(x, y) {
        console.log('🆕 Placing p0 at:', x, y);
        
        const vertex = {
            x: x,
            y: y,
            name: 'p0',
            timestamp: Date.now()
        };
        
        this.currentPath = [vertex];
        
        // Log to history
        this.logAction({
            type: 'placeP0',
            vertex: vertex
        });
        
        // Focus on distance input immediately
        const distanceInput = document.getElementById('distanceDisplay');
        if (distanceInput) {
            distanceInput.value = '0.0';
            setTimeout(() => {
                distanceInput.focus();
                distanceInput.select();
            }, 100);
        }
        
        CanvasManager.redraw();
    }
    
    placeNextVertex(distance, angle) {
        if (this.currentPath.length === 0) return;
        
        const lastVertex = this.currentPath[this.currentPath.length - 1];
        const angleRad = angle * Math.PI / 180;
        const distancePixels = distance * this.pixelsPerFoot;
        
        // Calculate new position
        let x = lastVertex.x + distancePixels * Math.cos(angleRad);
        let y = lastVertex.y - distancePixels * Math.sin(angleRad); // Negative because Y increases downward
        
        // Check for snapping
        const snapPoint = this.findSnapPoint(x, y);
        if (snapPoint) {
            x = snapPoint.x;
            y = snapPoint.y;
        }
        
        const vertex = {
            x: x,
            y: y,
            name: `p${this.currentPath.length}`,
            timestamp: Date.now()
        };
        
        this.currentPath.push(vertex);
        
        // Log to history
        this.logAction({
            type: 'placeVertex',
            vertex: vertex
        });
        
        // Clear inputs and focus on distance
        const distanceInput = document.getElementById('distanceDisplay');
        const angleInput = document.getElementById('angleDisplay');
        if (distanceInput) {
            distanceInput.value = '0';
            // Add slight delay to ensure proper focus
            setTimeout(() => {
                distanceInput.focus();
                distanceInput.select();
            }, 50);
        }
        if (angleInput) angleInput.value = '0';
        
        // Reset internal values
        this.inputDistance = 0;
        this.inputAngle = 0;
        
        CanvasManager.redraw();
    }
    
    continueFromVertex(vertex, pathIndex, vertexIndex) {
        console.log('🆕 Continuing from vertex:', vertex.name);
        
        if (pathIndex === -1) {
            // Continuing from current path
            // Truncate path to this vertex
            this.currentPath = this.currentPath.slice(0, vertexIndex + 1);
        } else {
            // Continuing from saved path
            const savedPath = this.paths[pathIndex];
            this.currentPath = savedPath.vertices.slice(0, vertexIndex + 1);
            
            // Remove the saved path as we're modifying it
            this.paths.splice(pathIndex, 1);
        }
        
        // Log action
        this.logAction({
            type: 'continueFrom',
            vertex: vertex,
            pathIndex: pathIndex,
            vertexIndex: vertexIndex
        });
        
        CanvasManager.redraw();
    }
    
    savePath() {
        if (this.currentPath.length < 2) {
            console.log('🆕 Path too short to save');
            return;
        }
        
        const path = {
            id: Date.now(),
            vertices: [...this.currentPath],
            type: 'path'
        };
        
        this.paths.push(path);
        this.currentPath = [];
        
        console.log('🆕 Path saved with', path.vertices.length, 'vertices');
        CanvasManager.redraw();
    }
    
    undo() {
        if (this.currentPath.length > 0) {
            const removed = this.currentPath.pop();
            console.log('🆕 Undid placement of', removed.name);
            
            // Log undo action
            this.logAction({
                type: 'undo',
                removed: removed
            });
            
            CanvasManager.redraw();
        }
    }
    
    logAction(action) {
        // This will be connected to the history system
        console.log('🆕 Action:', action);
        
        // Emit event for history tracking
        AppState.emit('betterdrawing:action', action);
    }
    
    draw(ctx) {
        if (!this.isActive) return;
        
        console.log('🎨 BetterDrawing: Drawing', this.currentPath.length, 'vertices');
        
        ctx.save();
        
        // Draw saved paths
        this.paths.forEach(path => {
            this.drawPath(ctx, path.vertices, '#27ae60', 2); // Green for saved
        });
        
        // Draw current path
        if (this.currentPath.length > 0) {
            this.drawPath(ctx, this.currentPath, '#3498db', 2); // Blue for current, thinner line
        }
        
        // Draw vertices
        [...this.paths.flatMap(p => p.vertices), ...this.currentPath].forEach(vertex => {
            this.drawVertex(ctx, vertex);
        });
        
        // No ghost vertex drawing
        
        ctx.restore();
    }
    
    drawPath(ctx, vertices, color, width) {
        if (vertices.length < 2) return;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        
        ctx.stroke();
        
        // Draw edge labels
        for (let i = 1; i < vertices.length; i++) {
            const v1 = vertices[i - 1];
            const v2 = vertices[i];
            const midX = (v1.x + v2.x) / 2;
            const midY = (v1.y + v2.y) / 2;
            
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const distance = Math.sqrt(dx * dx + dy * dy) / this.pixelsPerFoot;
            
            if (distance >= 1) {
                ctx.save();
                ctx.font = '12px Arial';
                ctx.fillStyle = '#2c3e50';
                ctx.textAlign = 'center';
                ctx.fillText(`${distance.toFixed(1)}'`, midX, midY - 5);
                ctx.restore();
            }
        }
    }
    
    drawVertex(ctx, vertex) {
        // Determine color based on vertex position
        let color = '#3498db'; // Blue default
        
        if (vertex.name === 'p0') {
            color = '#e74c3c'; // Red for start
        } else if (this.currentPath.length > 0 && 
                   vertex === this.currentPath[this.currentPath.length - 1]) {
            color = '#27ae60'; // Green for current end
        }
        
        // Draw vertex circle
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(vertex.x, vertex.y, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // White border
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw label
        ctx.save();
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = '#2c3e50';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(vertex.name, vertex.x, vertex.y - 20);
        ctx.restore();
    }
    
    showDrawingUI() {
        const drawPalette = document.getElementById('drawPalette');
        if (drawPalette) {
            drawPalette.classList.remove('hidden');
        }
        
        // Set up distance/angle inputs with legacy behavior
        const distanceInput = document.getElementById('distanceDisplay');
        const angleInput = document.getElementById('angleDisplay');
        
        if (distanceInput) {
            // Remove any existing listeners first
            distanceInput.removeEventListener('input', this.distanceInputHandler);
            distanceInput.removeEventListener('keydown', this.distanceKeyHandler);
            
            // Create new handlers with proper decimal input
            this.distanceKeyHandler = (e) => {
                const key = e.key;
                
                if (/^[0-9]$/.test(key)) {
                    e.preventDefault();
                    // Get current value without decimal point
                    let currentValue = distanceInput.value.replace('.', '');
                    if (currentValue === '0') currentValue = '';
                    
                    // Add new digit
                    currentValue += key;
                    
                    // Format as decimal (divide by 10)
                    const numValue = parseInt(currentValue) / 10;
                    distanceInput.value = numValue.toFixed(1);
                    this.inputDistance = numValue;
                    
                    // Check if we should auto-place
                    this.checkAndPlaceVertex();
                } else if (key === 'Backspace') {
                    e.preventDefault();
                    let currentValue = distanceInput.value.replace('.', '');
                    if (currentValue.length > 0) {
                        currentValue = currentValue.slice(0, -1);
                        if (currentValue === '') currentValue = '0';
                        const numValue = parseInt(currentValue) / 10;
                        distanceInput.value = numValue.toFixed(1);
                        this.inputDistance = numValue;
                    }
                } else if (key === 'Enter') {
                    e.preventDefault();
                    this.checkAndPlaceVertex();
                }
            };
            
            distanceInput.addEventListener('keydown', this.distanceKeyHandler);
            
            // Focus on distance input
            setTimeout(() => {
                distanceInput.focus();
                distanceInput.select();
            }, 100);
        }
        
        if (angleInput) {
            angleInput.addEventListener('input', () => {
                this.inputAngle = parseFloat(angleInput.value) || 0;
                this.checkAndPlaceVertex();
            });
        }
    }
    
    hideDrawingUI() {
        const drawPalette = document.getElementById('drawPalette');
        if (drawPalette) {
            drawPalette.classList.add('hidden');
        }
    }
    
    checkAndPlaceVertex() {
        if (this.currentPath.length === 0) return;
        if (this.inputDistance <= 0) return;
        
        console.log('🆕 Placing vertex with distance:', this.inputDistance, 'angle:', this.inputAngle);
        this.placeNextVertex(this.inputDistance, this.inputAngle);
        
        // Reset inputs
        this.inputDistance = 0;
        this.inputAngle = 0;
    }
    
    promptForDistanceAngle(clickX, clickY) {
        // Calculate distance and angle from last vertex
        if (this.currentPath.length === 0) return;
        
        const lastVertex = this.currentPath[this.currentPath.length - 1];
        const dx = clickX - lastVertex.x;
        const dy = clickY - lastVertex.y;
        
        const distance = Math.sqrt(dx * dx + dy * dy) / this.pixelsPerFoot;
        const angle = Math.atan2(-dy, dx) * 180 / Math.PI;
        
        // Set inputs to show what was placed
        const distanceInput = document.getElementById('distanceDisplay');
        const angleInput = document.getElementById('angleDisplay');
        
        if (distanceInput) {
            distanceInput.value = distance.toFixed(1);
            this.inputDistance = distance;
        }
        
        if (angleInput) {
            angleInput.value = ((angle + 360) % 360).toFixed(0);
            this.inputAngle = (angle + 360) % 360;
        }
        
        // Auto-place the vertex immediately (like legacy system)
        this.placeNextVertex(distance, (angle + 360) % 360);
    }
}