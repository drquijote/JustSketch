// src/modules/PathDrawing/PathDrawingManager.js - Complete fixed version
export class PathDrawingManager {
    constructor(eventBus, renderer, geometry, deviceDetection) {
        console.log('PathDrawingManager: Initializing complete fixed version');
        
        // Dependencies injected, not imported
        this.eventBus = eventBus;
        this.renderer = renderer;
        this.geometry = geometry;
        this.deviceDetection = deviceDetection;
        
        // Configuration
        this.PIXELS_PER_FOOT = 8;
        this.GRID_SIZE_PIXELS = 40;
        
        // State
        this.isActive = false;
        this.waitingForFirstVertex = true;
        this.activeInput = 'distance';
        this.distanceInputSequence = [];
        this.angleInputSequence = [];
        this.lastMousePosition = null;
        this.currentPath = [];
        this.currentVertexCounter = 0;

        // Mobile detection
        this.isMobile = this.detectMobileDevice();

        // Preset angles for direction buttons
        this.directionAngles = {
            'right': 0,
            'up-right': 45,
            'up': 90,
            'up-left': 135,
            'left': 180,
            'down-left': 225,
            'down': 270,
            'down-right': 315
        };

        // Bind event handlers
        this.boundHandleCanvasClick = this.handleCanvasClick.bind(this);
        this.boundHandleCanvasTouch = this.handleCanvasTouch.bind(this);
        this.boundHandleKeypadClick = this.handleKeypadClick.bind(this);
        this.boundHandleDirectionClick = this.handleDirectionClick.bind(this);
        this.boundHandleArrowKey = this.handleArrowKey.bind(this);
        this.boundHandleDistanceKeydown = (e) => this.handleDecimalInput(e, 'distance');
        this.boundHandleAngleKeydown = (e) => this.handleDecimalInput(e, 'angle');
        
        console.log('PathDrawingManager: Initialized');
    }

    // Activate drawing mode
    activate() {
        if (this.isActive) return;
        console.log('PathDrawingManager: Activating');
        
        this.isActive = true;
        this.waitingForFirstVertex = !this.currentPath || this.currentPath.length === 0;
        
        // Clear input sequences
        this.distanceInputSequence.length = 0;
        this.angleInputSequence.length = 0;
        
        this.showDrawingUI();
        this.setupEventListeners();
        
        // Set proper cursor for drawing mode
        this.setDrawingCursor();
        
        this.eventBus.emit('drawing:activated');
    }

    // Deactivate drawing mode
    deactivate() {
        if (!this.isActive) return;
        console.log('PathDrawingManager: Deactivating');
        
        this.isActive = false;
        this.hideDrawingUI();
        this.removeEventListeners();
        this.lastMousePosition = null;
        
        // Reset cursor
        this.resetCursor();
        
        this.eventBus.emit('drawing:deactivated');
    }

    // Set proper drawing cursor - FIXED VERSION
     // Set proper drawing cursor - FIXED VERSION
     setDrawingCursor() {
        const canvas = document.getElementById('drawingCanvas');
        if (canvas) {
            // Use setProperty to be more explicit than setting style.cursor directly.
            canvas.style.setProperty('cursor', 'crosshair', 'important');
        }
        
        // Also emit cursor change event
        this.eventBus.emit('cursor:set', { type: 'crosshair' });
        console.log('PathDrawingManager: Cursor set to crosshair');
    }

    // Reset cursor to default
    resetCursor() {
        const canvas = document.getElementById('drawingCanvas');
        if (canvas) {
            // Explicitly set the cursor back to 'move' which is the default for panning.
            // This is more robust than removeProperty().
            canvas.style.setProperty('cursor', 'move');
        }
        
        this.eventBus.emit('cursor:reset');
        console.log('PathDrawingManager: Cursor reset to default');
    }

    // Setup event listeners - FIXED VERSION
    setupEventListeners() {
        console.log('PathDrawingManager: Setting up event listeners');
        
        // Get the canvas viewport element
        const viewport = document.getElementById('canvasViewport');
        const canvas = document.getElementById('drawingCanvas');
        
        if (!viewport || !canvas) {
            console.warn('PathDrawingManager: Canvas viewport or canvas not found');
            return;
        }

        // Mouse events
        viewport.addEventListener('click', this.boundHandleCanvasClick);
        
        // Touch events for mobile
        if (this.isMobile) {
            viewport.addEventListener('touchend', this.boundHandleCanvasTouch, { passive: false });
        }

        // Keyboard events
        document.addEventListener('keydown', this.boundHandleArrowKey);
        
        // Keypad events (if keypad exists)
        const keypad = document.getElementById('keypad');
        if (keypad) {
            keypad.addEventListener('click', this.boundHandleKeypadClick);
        }

        // Direction buttons (if they exist)
        const directionBtns = document.querySelectorAll('.direction-btn');
        directionBtns.forEach(btn => {
            btn.addEventListener('click', this.boundHandleDirectionClick);
        });

        // Distance and angle input events
        const distanceInput = document.getElementById('distanceDisplay');
        const angleInput = document.getElementById('angleDisplay');
        
        if (distanceInput) {
            distanceInput.addEventListener('keydown', this.boundHandleDistanceKeydown);
        }
        
        if (angleInput) {
            angleInput.addEventListener('keydown', this.boundHandleAngleKeydown);
        }

        console.log('PathDrawingManager: Event listeners set up successfully');
    }

    // Remove event listeners - FIXED VERSION
    removeEventListeners() {
        console.log('PathDrawingManager: Removing event listeners');
        
        const viewport = document.getElementById('canvasViewport');
        const canvas = document.getElementById('drawingCanvas');
        
        if (viewport) {
            viewport.removeEventListener('click', this.boundHandleCanvasClick);
            viewport.removeEventListener('touchend', this.boundHandleCanvasTouch);
        }

        document.removeEventListener('keydown', this.boundHandleArrowKey);
        
        const keypad = document.getElementById('keypad');
        if (keypad) {
            keypad.removeEventListener('click', this.boundHandleKeypadClick);
        }

        const directionBtns = document.querySelectorAll('.direction-btn');
        directionBtns.forEach(btn => {
            btn.removeEventListener('click', this.boundHandleDirectionClick);
        });

        const distanceInput = document.getElementById('distanceDisplay');
        const angleInput = document.getElementById('angleDisplay');
        
        if (distanceInput) {
            distanceInput.removeEventListener('keydown', this.boundHandleDistanceKeydown);
        }
        
        if (angleInput) {
            angleInput.removeEventListener('keydown', this.boundHandleAngleKeydown);
        }

        console.log('PathDrawingManager: Event listeners removed');
    }

    // Handle canvas click for placing vertices
    handleCanvasClick(e) {
        if (!this.isActive) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const canvasPos = this.getCanvasPosition(e);
        console.log('PathDrawingManager: Canvas click at', canvasPos);
        
        // Rule 1: Placing the first vertex
        if (this.waitingForFirstVertex) {
            this.placeFirstVertex(canvasPos.x, canvasPos.y);
            return;
        }

        // Rule 2: Check for vertex clicks on current path
        const clickedVertexIndex = this.findClickedVertex(canvasPos.x, canvasPos.y);
        if (clickedVertexIndex !== -1) {
            if (clickedVertexIndex === 0 && this.currentPath.length >= 3) {
                console.log('PathDrawingManager: Cycle completion triggered');
                this.completeCycle();
            } else {
                this.continueFromVertex(clickedVertexIndex);
            }
            return;
        }

        // Rule 3: Check for helper point snapping
        const helperPoint = this.findClickedHelperPoint(canvasPos.x, canvasPos.y);
        if (helperPoint) {
            console.log('PathDrawingManager: Helper point clicked');
            this.addHelperAsVertex(helperPoint);
            return;
        }

        // Rule 4: Place in empty space (allow other systems to handle)
        console.log('PathDrawingManager: Click in empty space');
    }

    // Handle touch events (mobile) - FIXED VERSION
    handleCanvasTouch(e) {
        if (!this.isActive || !e.changedTouches) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const touch = e.changedTouches[0];
        const canvasEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => {},
            stopPropagation: () => {}
        };
        
        this.handleCanvasClick(canvasEvent);
    }

    // Get canvas position - FIXED VERSION with proper viewport transformation
    getCanvasPosition(e) {
        const viewport = document.getElementById('canvasViewport');
        if (!viewport) {
            console.warn('PathDrawingManager: Viewport not found');
            return { x: e.clientX || 0, y: e.clientY || 0 };
        }
        
        const rect = viewport.getBoundingClientRect();
        
        // Get viewport transform from global variables or modules
        let viewportTransform = { x: 0, y: 0, scale: 1 };
        
        // Try multiple ways to get the transform
        try {
            // Method 1: Check if AppState is available globally
            if (typeof AppState !== 'undefined' && AppState.viewportTransform) {
                viewportTransform = AppState.viewportTransform;
            }
            // Method 2: Check if CanvasManager is available globally
            else if (typeof CanvasManager !== 'undefined' && CanvasManager.getViewportTransform) {
                viewportTransform = CanvasManager.getViewportTransform();
            }
            // Method 3: Use window reference if available
            else if (window.floorPlanApp) {
                const canvasManager = window.floorPlanApp.modules.get('canvasManager');
                if (canvasManager && canvasManager.viewportTransform) {
                    viewportTransform = canvasManager.viewportTransform;
                }
            }
        } catch (error) {
            console.warn('PathDrawingManager: Could not get viewport transform, using default');
        }
        
        // Calculate canvas coordinates
        const canvasX = (e.clientX - rect.left - viewportTransform.x) / viewportTransform.scale;
        const canvasY = (e.clientY - rect.top - viewportTransform.y) / viewportTransform.scale;
        
        return {
            x: canvasX,
            y: canvasY
        };
    }

    // Place the first vertex of a new path - FIXED VERSION
    placeFirstVertex(x, y) {
        console.log('PathDrawingManager: Placing first vertex at', x, y);
        
        let finalX = x;
        let finalY = y;
        let snapInfo = null;

        // Check for snapping opportunities
        const snapResult = this.snapSystem?.findSnapPoint?.(x, y);
        if (snapResult) {
            finalX = snapResult.x;
            finalY = snapResult.y;
            snapInfo = snapResult;
            console.log('PathDrawingManager: First vertex snapped');
        }

        const firstPoint = {
            x: finalX,
            y: finalY,
            name: 'p0',
            snapInfo: snapInfo
        };

        this.currentPath = [firstPoint];
        this.currentVertexCounter = 1;
        this.waitingForFirstVertex = false;

        // Update helper points
        this.helperSystem?.updateHelperPoints?.(this.currentPath);

        // Trigger proper rendering
        this.triggerRedraw();
        
        console.log('PathDrawingManager: First vertex placed successfully', firstPoint);
    }

    // ADDED: Trigger proper redraw of the canvas
    triggerRedraw() {
        try {
            // Method 1: Use CanvasManager if available
            if (typeof CanvasManager !== 'undefined' && CanvasManager.redraw) {
                CanvasManager.redraw();
                console.log('PathDrawingManager: Triggered redraw via CanvasManager');
                return;
            }
            
            // Method 2: Use RenderManager if available
            if (typeof RenderManager !== 'undefined' && RenderManager.forceRender) {
                RenderManager.forceRender();
                console.log('PathDrawingManager: Triggered redraw via RenderManager');
                return;
            }
            
            // Method 3: Emit event for redraw
            this.eventBus.emit('canvas:redraw:complete');
            console.log('PathDrawingManager: Triggered redraw via event');
            
        } catch (error) {
            console.warn('PathDrawingManager: Could not trigger redraw', error);
        }
    }

    // ADDED: Draw current path method - this is what the rendering system calls
    drawCurrentPath(renderData) {
        if (!this.currentPath || this.currentPath.length === 0) return;
        if (!renderData || !renderData.ctx) return;

        const ctx = renderData.ctx;
        
        ctx.save();
        
        try {
            // Draw vertices
            this.currentPath.forEach((point, index) => {
                this.drawVertex(ctx, point, index);
            });
            
            // Draw lines between vertices
            if (this.currentPath.length > 1) {
                this.drawPathLines(ctx);
            }
            
        } finally {
            ctx.restore();
        }
    }

    // ADDED: Draw individual vertex
    drawVertex(ctx, point, index) {
        const isFirst = index === 0;
        const isLast = index === this.currentPath.length - 1;
        
        // Vertex circle
        ctx.fillStyle = isFirst ? '#e74c3c' : '#3498db'; // Red for p0, blue for others
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Vertex label
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.fillText(point.name || `p${index}`, point.x, point.y - 20);
    }

    // ADDED: Draw lines between path vertices
    drawPathLines(ctx) {
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(this.currentPath[0].x, this.currentPath[0].y);
        
        for (let i = 1; i < this.currentPath.length; i++) {
            ctx.lineTo(this.currentPath[i].x, this.currentPath[i].y);
        }
        
        ctx.stroke();
    }

    // Handle keypad click
    handleKeypadClick(e) {
        console.log('PathDrawingManager: Keypad clicked');
        // Implementation for keypad functionality
    }

    // Handle direction button click
    handleDirectionClick(e) {
        console.log('PathDrawingManager: Direction button clicked');
        // Implementation for direction buttons
    }

    // Handle arrow key
    handleArrowKey(e) {
        if (!this.isActive) return;
        console.log('PathDrawingManager: Arrow key pressed', e.key);
        // Implementation for arrow key navigation
    }

    // Handle decimal input for distance/angle
    handleDecimalInput(e, inputType) {
        console.log('PathDrawingManager: Decimal input for', inputType);
        // Implementation for decimal input handling
    }

    // Find clicked vertex
    findClickedVertex(x, y) {
        if (!this.currentPath) return -1;
        
        const clickRadius = this.isMobile ? 50 : 25;
        
        for (let i = 0; i < this.currentPath.length; i++) {
            const point = this.currentPath[i];
            const dx = x - point.x;
            const dy = y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= clickRadius) {
                console.log('PathDrawingManager: Found clicked vertex', point.name);
                return i;
            }
        }
        
        return -1;
    }

    // Find clicked helper point
    findClickedHelperPoint(x, y) {
        const clickRadius = this.isMobile ? 30 : 20;
        return this.helperSystem?.findNearestHelper?.(x, y, clickRadius) || null;
    }

    // Complete cycle
    completeCycle() {
        console.log('PathDrawingManager: Completing cycle');
        // Implementation for cycle completion
    }

    // Continue from vertex
    continueFromVertex(index) {
        console.log('PathDrawingManager: Continuing from vertex', index);
        // Implementation for continuing from vertex
    }

    // Add helper as vertex
    addHelperAsVertex(helperPoint) {
        console.log('PathDrawingManager: Adding helper as vertex');
        // Implementation for adding helper as vertex
    }

    // Place next vertex
    placeNextVertex(distance, angle) {
        if (isNaN(distance) || distance <= 0) return;
        if (isNaN(angle)) return;
        
        console.log('PathDrawingManager: Placing next vertex at distance', distance, 'angle', angle);
        // Implementation for placing next vertex
    }

    // Utility methods
    detectMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0);
    }

    clearInputs() {
        this.distanceInputSequence.length = 0;
        this.angleInputSequence.length = 0;
        
        const distanceInput = document.getElementById('distanceDisplay');
        const angleInput = document.getElementById('angleDisplay');
        
        if (distanceInput) distanceInput.value = '0';
        if (angleInput) angleInput.value = '0';
    }

    focusDistanceInput() {
        const distanceInput = document.getElementById('distanceDisplay');
        if (distanceInput) {
            this.activeInput = 'distance';
            setTimeout(() => {
                distanceInput.focus();
                distanceInput.select();
            }, 50);
        }
    }

    showDrawingUI() {
        console.log('PathDrawingManager: Showing drawing UI');
        // Show any drawing-specific UI elements
        const drawingUI = document.getElementById('drawingUI');
        if (drawingUI) {
            drawingUI.classList.remove('hidden');
        }
    }

    hideDrawingUI() {
        console.log('PathDrawingManager: Hiding drawing UI');
        // Hide drawing-specific UI elements
        const drawingUI = document.getElementById('drawingUI');
        if (drawingUI) {
            drawingUI.classList.add('hidden');
        }
    }

    // Public API
    getCurrentPath() {
        return [...this.currentPath];
    }

    isDrawing() {
        return this.isActive && !this.waitingForFirstVertex;
    }

    getState() {
        return {
            isActive: this.isActive,
            waitingForFirstVertex: this.waitingForFirstVertex,
            currentPath: [...this.currentPath],
            currentVertexCounter: this.currentVertexCounter,
            activeInput: this.activeInput
        };
    }
}