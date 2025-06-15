// src/modules/AreaManagement/AreaDragger.js
// Area dragging system - completely independent module

import { AppState } from '../../core/AppState.js';
import { eventBus } from '../../core/EventBus.js';
import { GeometryUtils } from '../../core/GeometryUtils.js';
import { DeviceDetection } from '../../core/DeviceDetection.js';

export class AreaDragger {
    constructor() {
        this.isDragging = false;
        this.draggedArea = null;
        this.draggedElements = [];
        this.dragStartPoint = { x: 0, y: 0 };
        this.isActive = false;
        this.lastTouchTime = 0;
        this.touchThreshold = 300; // ms for tap vs drag
        
        console.log('AreaDragger: Initialized with modular architecture');
    }

    init() {
        // Listen for mode changes
        eventBus.on('mode:changed', (data) => this.handleModeChange(data));
        
        // Listen for edit mode toggles
        eventBus.on('edit:modeToggled', (data) => this.handleEditModeToggle(data));
        
        console.log('AreaDragger: Event listeners initialized');
    }

    /**
     * Handle mode changes
     */
    handleModeChange(data) {
        const { mode, subMode } = data;
        
        if (mode === 'edit' && subMode === 'areas') {
            this.activate();
        } else {
            this.deactivate();
        }
    }

    /**
     * Handle edit mode toggle
     */
    handleEditModeToggle(data) {
        const { isEditMode, subMode } = data;
        
        if (isEditMode && subMode === 'areas') {
            this.activate();
        } else {
            this.deactivate();
        }
    }

    /**
     * Activate area dragging
     */
    activate() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.setupEventListeners();
        
        console.log('AreaDragger: Activated - areas can now be dragged');
        eventBus.emit('ui:showMessage', { message: 'Click and drag areas to move them' });
    }

    /**
     * Deactivate area dragging
     */
    deactivate() {
        if (!this.isActive) return;
        
        this.isActive = false;
        this.endDrag();
        this.removeEventListeners();
        
        console.log('AreaDragger: Deactivated');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const viewport = document.getElementById('canvasViewport');
        if (!viewport) return;

        // Unified event handlers for mouse and touch
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);

        // Mouse events
        viewport.addEventListener('mousedown', this.boundPointerDown);
        viewport.addEventListener('mousemove', this.boundPointerMove);
        viewport.addEventListener('mouseup', this.boundPointerUp);

        // Touch events
        viewport.addEventListener('touchstart', this.boundPointerDown, { passive: false });
        viewport.addEventListener('touchmove', this.boundPointerMove, { passive: false });
        viewport.addEventListener('touchend', this.boundPointerUp, { passive: false });
    }

    /**
     * Remove event listeners
     */
    removeEventListeners() {
        const viewport = document.getElementById('canvasViewport');
        if (!viewport || !this.boundPointerDown) return;

        viewport.removeEventListener('mousedown', this.boundPointerDown);
        viewport.removeEventListener('mousemove', this.boundPointerMove);
        viewport.removeEventListener('mouseup', this.boundPointerUp);
        viewport.removeEventListener('touchstart', this.boundPointerDown);
        viewport.removeEventListener('touchmove', this.boundPointerMove);
        viewport.removeEventListener('touchend', this.boundPointerUp);
    }

    /**
     * Handle pointer down (mouse/touch start)
     */
    handlePointerDown(e) {
        if (!this.isActive) return;

        // Prevent multiple touches
        if (e.touches && e.touches.length > 1) return;

        const pos = this.getEventPosition(e);
        const clickedArea = this.findAreaAtPosition(pos.x, pos.y);

        if (clickedArea) {
            this.startDrag(clickedArea, pos);
            
            // Prevent default to avoid text selection, scrolling, etc.
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /**
     * Handle pointer move (mouse/touch move)
     */
    handlePointerMove(e) {
        if (!this.isActive || !this.isDragging) return;

        const pos = this.getEventPosition(e);
        this.updateDrag(pos);

        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * Handle pointer up (mouse/touch end)
     */
    handlePointerUp(e) {
        if (!this.isActive) return;

        if (this.isDragging) {
            this.endDrag();
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /**
     * Get position from mouse or touch event
     */
    getEventPosition(e) {
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        let clientX, clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) - AppState.viewportTransform.x,
            y: (clientY - rect.top) - AppState.viewportTransform.y
        };
    }

    /**
     * Find area at position
     */
    findAreaAtPosition(x, y) {
        // Check areas from top to bottom (last drawn first)
        for (let i = AppState.drawnPolygons.length - 1; i >= 0; i--) {
            const area = AppState.drawnPolygons[i];
            
            if (GeometryUtils.isPointInPolygon({ x, y }, area.path)) {
                return area;
            }
        }
        
        return null;
    }

    /**
     * Start dragging an area
     */
    startDrag(area, startPos) {
        this.isDragging = true;
        this.draggedArea = area;
        this.dragStartPoint = { x: startPos.x, y: startPos.y };
        
        // Find all elements contained within this area
        this.draggedElements = this.findElementsInArea(area);
        
        console.log(`AreaDragger: Started dragging area "${area.label}" with ${this.draggedElements.length} contained elements`);
        
        // Visual feedback
        this.updateModeIndicator('MOVING AREA');
        eventBus.emit('cursor:set', { cursor: 'grabbing' });
        
        // Notify other systems
        eventBus.emit('area:dragStarted', { 
            area: this.draggedArea, 
            elements: this.draggedElements 
        });
    }

    /**
     * Update drag position
     */
    updateDrag(currentPos) {
        if (!this.isDragging || !this.draggedArea) return;

        const deltaX = currentPos.x - this.dragStartPoint.x;
        const deltaY = currentPos.y - this.dragStartPoint.y;

        // Move area vertices
        this.draggedArea.path.forEach(vertex => {
            vertex.x += deltaX;
            vertex.y += deltaY;
        });

        // Move area centroid
        if (this.draggedArea.centroid) {
            this.draggedArea.centroid.x += deltaX;
            this.draggedArea.centroid.y += deltaY;
        }

        // Move contained elements
        this.draggedElements.forEach(element => {
            element.x += deltaX;
            element.y += deltaY;
        });

        // Update drag start point for next move
        this.dragStartPoint = { x: currentPos.x, y: currentPos.y };

        // Request redraw
        eventBus.emit('render:requestRedraw');
    }

    /**
     * End dragging
     */
    endDrag() {
        if (!this.isDragging) return;

        console.log(`AreaDragger: Finished dragging area "${this.draggedArea.label}"`);

        // Notify other systems
        eventBus.emit('area:dragEnded', { 
            area: this.draggedArea, 
            elements: this.draggedElements 
        });

        // Save action for undo
        eventBus.emit('history:saveAction');

        // Reset state
        this.isDragging = false;
        this.draggedArea = null;
        this.draggedElements = [];

        // Reset UI
        this.updateModeIndicator('EDIT AREAS');
        eventBus.emit('cursor:set', { cursor: 'default' });
    }

    /**
     * Find all elements contained within an area
     */
    findElementsInArea(area) {
        const containedElements = [];

        AppState.placedElements.forEach(element => {
            // Calculate element center point
            const elementCenter = {
                x: element.x + (element.width / 2),
                y: element.y + (element.height / 2)
            };

            // Check if center is inside the area
            if (GeometryUtils.isPointInPolygon(elementCenter, area.path)) {
                containedElements.push(element);
            }
        });

        return containedElements;
    }

    /**
     * Update mode indicator
     */
    updateModeIndicator(text) {
        const modeIndicator = document.getElementById('modeIndicator');
        if (modeIndicator) {
            modeIndicator.textContent = text;
            modeIndicator.style.background = this.isDragging ? '#f39c12' : '#8E44AD';
        }
    }

    /**
     * Check if currently dragging
     */
    isDraggingArea() {
        return this.isDragging;
    }

    /**
     * Get currently dragged area
     */
    getCurrentlyDraggedArea() {
        return this.draggedArea;
    }

    /**
     * Get currently dragged elements
     */
    getCurrentlyDraggedElements() {
        return this.draggedElements;
    }

    /**
     * Force end any current drag operation
     */
    forceEndDrag() {
        if (this.isDragging) {
            this.endDrag();
        }
    }

    /**
     * Check if area can be dragged
     */
    canDragArea(area) {
        if (!area || !this.isActive) return false;
        
        // Areas can be dragged if they have at least 3 vertices
        return area.path && area.path.length >= 3;
    }

    /**
     * Get drag sensitivity based on device
     */
    getDragSensitivity() {
        return DeviceDetection.isMobile() ? 1.2 : 1.0;
    }

    /**
     * Validate area position after drag
     */
    validateAreaPosition(area) {
        // Check if area is still within reasonable bounds
        const bounds = this.getAreaBounds(area);
        const maxCanvasSize = 10000; // Match your canvas size
        
        return bounds.minX >= -maxCanvasSize && 
               bounds.maxX <= maxCanvasSize && 
               bounds.minY >= -maxCanvasSize && 
               bounds.maxY <= maxCanvasSize;
    }

    /**
     * Get area bounds
     */
    getAreaBounds(area) {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        area.path.forEach(vertex => {
            minX = Math.min(minX, vertex.x);
            maxX = Math.max(maxX, vertex.x);
            minY = Math.min(minY, vertex.y);
            maxY = Math.max(maxY, vertex.y);
        });

        return { minX, maxX, minY, maxY };
    }

    /**
     * Snap area to grid if enabled
     */
    snapToGrid(area, gridSize = 40) {
        if (!AppState.snapToGrid) return;

        area.path.forEach(vertex => {
            vertex.x = Math.round(vertex.x / gridSize) * gridSize;
            vertex.y = Math.round(vertex.y / gridSize) * gridSize;
        });

        // Recalculate centroid after snapping
        area.centroid = GeometryUtils.calculateCentroid(area.path);
    }
}
