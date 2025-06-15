// src/input/MouseHandler.js - Specialized mouse event handling
// This file is completely independent and does not depend on any existing files

/**
 * MouseHandler manages mouse-specific interactions and desktop-optimized gestures
 * Provides precise mouse tracking, wheel events, and mouse button combinations
 */
export class MouseHandler {
    constructor() {
        this.isInitialized = false;
        this.eventTarget = new EventTarget();
        this.targetElement = null;
        
        // Mouse state tracking
        this.mouseState = {
            isDown: false,
            button: -1, // 0=left, 1=middle, 2=right
            x: 0,
            y: 0,
            startX: 0,
            startY: 0,
            deltaX: 0,
            deltaY: 0,
            isDragging: false,
            dragStarted: false
        };
        
        // Click detection
        this.clickState = {
            lastClickTime: 0,
            lastClickX: 0,
            lastClickY: 0,
            clickCount: 0,
            clickTimeout: null
        };
        
        // Hover tracking
        this.hoverState = {
            isHovering: false,
            hoverStartTime: 0,
            lastHoverX: 0,
            lastHoverY: 0,
            hoverMoveDistance: 0
        };
        
        // Wheel/scroll tracking
        this.wheelState = {
            isScrolling: false,
            scrollTimeout: null,
            accumulatedDeltaX: 0,
            accumulatedDeltaY: 0,
            lastWheelTime: 0
        };
        
        // Configuration
        this.config = {
            clickTimeout: 300, // ms for double click detection
            clickRadius: 5, // pixels - max movement for click
            dragThreshold: 5, // pixels - min movement to start drag
            hoverDelay: 100, // ms before hover events start
            wheelScrollTimeout: 150, // ms after wheel stops
            wheelSmoothingFactor: 0.1 // For wheel event smoothing
        };
        
        console.log('MouseHandler: Created');
    }

    /**
     * Initialize mouse handler with target element
     * @param {HTMLElement} targetElement - Element to attach mouse listeners to
     */
    init(targetElement) {
        if (this.isInitialized) {
            console.warn('MouseHandler: Already initialized');
            return;
        }

        if (!targetElement) {
            throw new Error('MouseHandler: Target element is required');
        }

        this.targetElement = targetElement;
        this.setupMouseListeners();
        this.isInitialized = true;
        
        console.log('MouseHandler: Initialized');
    }

    /**
     * Clean up mouse handler
     */
    destroy() {
        if (!this.isInitialized) return;

        this.removeMouseListeners();
        this.clearAllTimers();
        this.resetAllStates();
        this.isInitialized = false;
        
        console.log('MouseHandler: Destroyed');
    }

    /**
     * Setup mouse event listeners
     */
    setupMouseListeners() {
        // Basic mouse events
        this.targetElement.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.targetElement.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.targetElement.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.targetElement.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
        this.targetElement.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
        
        // Click events (for precise click handling)
        this.targetElement.addEventListener('click', this.handleClick.bind(this));
        this.targetElement.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        
        // Context menu
        this.targetElement.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        
        // Wheel events
        this.targetElement.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        
        // Disable text selection during mouse operations
        this.targetElement.addEventListener('selectstart', (e) => e.preventDefault());
    }

    /**
     * Remove mouse event listeners
     */
    removeMouseListeners() {
        if (!this.targetElement) return;

        this.targetElement.removeEventListener('mousedown', this.handleMouseDown);
        this.targetElement.removeEventListener('mousemove', this.handleMouseMove);
        this.targetElement.removeEventListener('mouseup', this.handleMouseUp);
        this.targetElement.removeEventListener('mouseleave', this.handleMouseLeave);
        this.targetElement.removeEventListener('mouseenter', this.handleMouseEnter);
        this.targetElement.removeEventListener('click', this.handleClick);
        this.targetElement.removeEventListener('dblclick', this.handleDoubleClick);
        this.targetElement.removeEventListener('contextmenu', this.handleContextMenu);
        this.targetElement.removeEventListener('wheel', this.handleWheel);
    }

    /**
     * Handle mouse down event
     */
    handleMouseDown(e) {
        e.preventDefault();
        
        const coords = this.getMouseCoordinates(e);
        
        this.mouseState = {
            isDown: true,
            button: e.button,
            x: coords.x,
            y: coords.y,
            startX: coords.x,
            startY: coords.y,
            deltaX: 0,
            deltaY: 0,
            isDragging: false,
            dragStarted: false
        };

        // Clear any pending click timeout
        this.clearClickTimeout();

        this.emit('mouseDown', {
            button: e.button,
            x: coords.x,
            y: coords.y,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            originalEvent: e
        });

        // Set cursor for potential drag
        this.targetElement.style.cursor = 'grabbing';
    }

    /**
     * Handle mouse move event
     */
    handleMouseMove(e) {
        const coords = this.getMouseCoordinates(e);
        
        // Update mouse position
        const prevX = this.mouseState.x;
        const prevY = this.mouseState.y;
        
        this.mouseState.x = coords.x;
        this.mouseState.y = coords.y;
        
        if (this.mouseState.isDown) {
            // Calculate deltas from start position
            this.mouseState.deltaX = coords.x - this.mouseState.startX;
            this.mouseState.deltaY = coords.y - this.mouseState.startY;
            
            const dragDistance = Math.sqrt(
                this.mouseState.deltaX * this.mouseState.deltaX + 
                this.mouseState.deltaY * this.mouseState.deltaY
            );

            // Check if drag should start
            if (!this.mouseState.isDragging && dragDistance > this.config.dragThreshold) {
                this.mouseState.isDragging = true;
                this.mouseState.dragStarted = true;

                this.emit('dragStart', {
                    button: this.mouseState.button,
                    startX: this.mouseState.startX,
                    startY: this.mouseState.startY,
                    currentX: coords.x,
                    currentY: coords.y,
                    deltaX: this.mouseState.deltaX,
                    deltaY: this.mouseState.deltaY,
                    ctrlKey: e.ctrlKey,
                    shiftKey: e.shiftKey,
                    altKey: e.altKey,
                    metaKey: e.metaKey,
                    originalEvent: e
                });
            }

            // Emit drag events if dragging
            if (this.mouseState.isDragging) {
                const frameDeltaX = coords.x - prevX;
                const frameDeltaY = coords.y - prevY;

                this.emit('dragMove', {
                    button: this.mouseState.button,
                    startX: this.mouseState.startX,
                    startY: this.mouseState.startY,
                    currentX: coords.x,
                    currentY: coords.y,
                    deltaX: this.mouseState.deltaX,
                    deltaY: this.mouseState.deltaY,
                    frameDeltaX: frameDeltaX,
                    frameDeltaY: frameDeltaY,
                    ctrlKey: e.ctrlKey,
                    shiftKey: e.shiftKey,
                    altKey: e.altKey,
                    metaKey: e.metaKey,
                    originalEvent: e
                });
            }
        } else {
            // Handle hover state
            this.handleHoverMove(coords, e);
        }

        // Always emit mouse move
        this.emit('mouseMove', {
            x: coords.x,
            y: coords.y,
            deltaX: coords.x - prevX,
            deltaY: coords.y - prevY,
            isDragging: this.mouseState.isDragging,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            originalEvent: e
        });
    }

    /**
     * Handle mouse up event
     */
    handleMouseUp(e) {
        const coords = this.getMouseCoordinates(e);
        const wasDragging = this.mouseState.isDragging;
        
        if (wasDragging) {
            this.emit('dragEnd', {
                button: this.mouseState.button,
                startX: this.mouseState.startX,
                startY: this.mouseState.startY,
                endX: coords.x,
                endY: coords.y,
                totalDeltaX: this.mouseState.deltaX,
                totalDeltaY: this.mouseState.deltaY,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey,
                originalEvent: e
            });
        }

        this.emit('mouseUp', {
            button: e.button,
            x: coords.x,
            y: coords.y,
            wasDragging: wasDragging,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            originalEvent: e
        });

        // Reset mouse state
        this.mouseState.isDown = false;
        this.mouseState.isDragging = false;
        this.mouseState.dragStarted = false;
        
        // Reset cursor
        this.targetElement.style.cursor = 'default';
    }

    /**
     * Handle mouse leave event
     */
    handleMouseLeave(e) {
        if (this.mouseState.isDragging) {
            this.emit('dragCancel', {
                button: this.mouseState.button,
                originalEvent: e
            });
        }

        this.emit('mouseLeave', {
            originalEvent: e
        });

        this.resetMouseState();
        this.resetHoverState();
        this.targetElement.style.cursor = 'default';
    }

    /**
     * Handle mouse enter event
     */
    handleMouseEnter(e) {
        const coords = this.getMouseCoordinates(e);
        
        this.emit('mouseEnter', {
            x: coords.x,
            y: coords.y,
            originalEvent: e
        });

        this.hoverState.isHovering = true;
        this.hoverState.hoverStartTime = Date.now();
    }

    /**
     * Handle click event
     */
    handleClick(e) {
        // Only process if it wasn't a drag
        if (this.mouseState.dragStarted) {
            this.mouseState.dragStarted = false;
            return;
        }

        const coords = this.getMouseCoordinates(e);
        const now = Date.now();
        
        // Check for multi-click
        const timeSinceLastClick = now - this.clickState.lastClickTime;
        const distanceFromLastClick = Math.sqrt(
            Math.pow(coords.x - this.clickState.lastClickX, 2) + 
            Math.pow(coords.y - this.clickState.lastClickY, 2)
        );

        if (timeSinceLastClick < this.config.clickTimeout && 
            distanceFromLastClick < this.config.clickRadius) {
            this.clickState.clickCount++;
        } else {
            this.clickState.clickCount = 1;
        }

        this.clickState.lastClickTime = now;
        this.clickState.lastClickX = coords.x;
        this.clickState.lastClickY = coords.y;

        // Clear existing timeout
        this.clearClickTimeout();

        // Set timeout to emit click event
        this.clickState.clickTimeout = setTimeout(() => {
            this.emitClickEvent(coords, e, this.clickState.clickCount);
            this.clickState.clickCount = 0;
        }, this.config.clickTimeout);
    }

    /**
     * Handle double click event
     */
    handleDoubleClick(e) {
        // Browser already detected double click, cancel our timeout
        this.clearClickTimeout();
        
        const coords = this.getMouseCoordinates(e);
        this.emitClickEvent(coords, e, 2);
        this.clickState.clickCount = 0;
    }

    /**
     * Handle context menu (right click)
     */
    handleContextMenu(e) {
        const coords = this.getMouseCoordinates(e);
        
        this.emit('contextMenu', {
            x: coords.x,
            y: coords.y,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            originalEvent: e
        });

        // Prevent default context menu unless specifically wanted
        e.preventDefault();
    }

    /**
     * Handle wheel/scroll event
     */
    handleWheel(e) {
        e.preventDefault();
        
        const coords = this.getMouseCoordinates(e);
        
        // Normalize wheel delta across browsers
        let deltaX = e.deltaX;
        let deltaY = e.deltaY;
        
        // Handle different wheel modes
        if (e.deltaMode === 1) { // Line mode
            deltaX *= 16;
            deltaY *= 16;
        } else if (e.deltaMode === 2) { // Page mode
            deltaX *= 16 * 24;
            deltaY *= 16 * 24;
        }

        // Apply smoothing for better UX
        this.wheelState.accumulatedDeltaX += deltaX * this.config.wheelSmoothingFactor;
        this.wheelState.accumulatedDeltaY += deltaY * this.config.wheelSmoothingFactor;

        // Start scrolling if not already
        if (!this.wheelState.isScrolling) {
            this.wheelState.isScrolling = true;
            this.emit('wheelStart', {
                x: coords.x,
                y: coords.y,
                originalEvent: e
            });
        }

        this.emit('wheel', {
            x: coords.x,
            y: coords.y,
            deltaX: deltaX,
            deltaY: deltaY,
            accumulatedDeltaX: this.wheelState.accumulatedDeltaX,
            accumulatedDeltaY: this.wheelState.accumulatedDeltaY,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            originalEvent: e
        });

        // Clear existing scroll timeout
        if (this.wheelState.scrollTimeout) {
            clearTimeout(this.wheelState.scrollTimeout);
        }

        // Set timeout to end scrolling
        this.wheelState.scrollTimeout = setTimeout(() => {
            this.wheelState.isScrolling = false;
            this.emit('wheelEnd', {
                x: coords.x,
                y: coords.y,
                totalDeltaX: this.wheelState.accumulatedDeltaX,
                totalDeltaY: this.wheelState.accumulatedDeltaY
            });
            
            // Reset accumulated deltas
            this.wheelState.accumulatedDeltaX = 0;
            this.wheelState.accumulatedDeltaY = 0;
        }, this.config.wheelScrollTimeout);

        this.wheelState.lastWheelTime = Date.now();
    }

    // ============ HOVER HANDLING ============

    handleHoverMove(coords, e) {
        const now = Date.now();
        
        if (!this.hoverState.isHovering) return;

        // Calculate hover movement distance
        const deltaX = coords.x - this.hoverState.lastHoverX;
        const deltaY = coords.y - this.hoverState.lastHoverY;
        const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        this.hoverState.hoverMoveDistance += moveDistance;
        this.hoverState.lastHoverX = coords.x;
        this.hoverState.lastHoverY = coords.y;

        // Emit hover events after delay
        if (now - this.hoverState.hoverStartTime > this.config.hoverDelay) {
            this.emit('hover', {
                x: coords.x,
                y: coords.y,
                hoverDuration: now - this.hoverState.hoverStartTime,
                moveDistance: this.hoverState.hoverMoveDistance,
                originalEvent: e
            });
        }
    }

    // ============ UTILITY METHODS ============

    getMouseCoordinates(e) {
        const rect = this.targetElement.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            screenX: e.clientX,
            screenY: e.clientY
        };
    }

    emitClickEvent(coords, originalEvent, clickCount) {
        const eventType = clickCount === 1 ? 'click' : 
                         clickCount === 2 ? 'doubleClick' : 'multiClick';

        this.emit(eventType, {
            x: coords.x,
            y: coords.y,
            clickCount: clickCount,
            button: originalEvent.button,
            ctrlKey: originalEvent.ctrlKey,
            shiftKey: originalEvent.shiftKey,
            altKey: originalEvent.altKey,
            metaKey: originalEvent.metaKey,
            originalEvent: originalEvent
        });

        // Also emit generic click event
        this.emit('clickGesture', {
            x: coords.x,
            y: coords.y,
            clickCount: clickCount,
            type: eventType,
            button: originalEvent.button,
            originalEvent: originalEvent
        });
    }

    clearClickTimeout() {
        if (this.clickState.clickTimeout) {
            clearTimeout(this.clickState.clickTimeout);
            this.clickState.clickTimeout = null;
        }
    }

    clearAllTimers() {
        this.clearClickTimeout();
        
        if (this.wheelState.scrollTimeout) {
            clearTimeout(this.wheelState.scrollTimeout);
            this.wheelState.scrollTimeout = null;
        }
    }

    resetMouseState() {
        this.mouseState = {
            isDown: false,
            button: -1,
            x: 0,
            y: 0,
            startX: 0,
            startY: 0,
            deltaX: 0,
            deltaY: 0,
            isDragging: false,
            dragStarted: false
        };
    }

    resetHoverState() {
        this.hoverState = {
            isHovering: false,
            hoverStartTime: 0,
            lastHoverX: 0,
            lastHoverY: 0,
            hoverMoveDistance: 0
        };
    }

    resetWheelState() {
        this.wheelState = {
            isScrolling: false,
            scrollTimeout: null,
            accumulatedDeltaX: 0,
            accumulatedDeltaY: 0,
            lastWheelTime: 0
        };
    }

    resetAllStates() {
        this.resetMouseState();
        this.resetHoverState();
        this.resetWheelState();
        
        this.clickState = {
            lastClickTime: 0,
            lastClickX: 0,
            lastClickY: 0,
            clickCount: 0,
            clickTimeout: null
        };
    }

    // ============ EVENT SYSTEM ============

    on(eventType, callback) {
        this.eventTarget.addEventListener(eventType, callback);
    }

    off(eventType, callback) {
        this.eventTarget.removeEventListener(eventType, callback);
    }

    emit(eventType, data) {
        this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail: data }));
    }

    // ============ PUBLIC API ============

    /**
     * Get current mouse state
     * @returns {Object} Current mouse state
     */
    getMouseState() {
        return { ...this.mouseState };
    }

    /**
     * Check if mouse is currently down
     * @returns {boolean} True if mouse is down
     */
    isMouseDown() {
        return this.mouseState.isDown;
    }

    /**
     * Check if currently dragging
     * @returns {boolean} True if dragging
     */
    isDragging() {
        return this.mouseState.isDragging;
    }

    /**
     * Check if currently hovering
     * @returns {boolean} True if hovering
     */
    isHovering() {
        return this.hoverState.isHovering;
    }

    /**
     * Check if currently scrolling
     * @returns {boolean} True if scrolling
     */
    isScrolling() {
        return this.wheelState.isScrolling;
    }

    /**
     * Get current mouse position
     * @returns {Object} Current position {x, y}
     */
    getMousePosition() {
        return {
            x: this.mouseState.x,
            y: this.mouseState.y
        };
    }

    /**
     * Set custom cursor
     * @param {string} cursor - CSS cursor value
     */
    setCursor(cursor) {
        if (this.targetElement) {
            this.targetElement.style.cursor = cursor;
        }
    }

    /**
     * Reset cursor to default
     */
    resetCursor() {
        if (this.targetElement) {
            this.targetElement.style.cursor = 'default';
        }
    }
}