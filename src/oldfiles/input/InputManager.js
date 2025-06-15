// src/input/InputManager.js - Unified input handling system
// This file is completely independent and does not depend on any existing files

/**
 * Unified Input Manager that coordinates mouse, touch, and keyboard events
 * Provides a consistent event interface regardless of input method
 */
export class InputManager {
    constructor() {
        this.isInitialized = false;
        this.eventTarget = new EventTarget();
        this.currentPointers = new Map(); // Track active pointers
        this.gestureState = {
            isGesturing: false,
            initialDistance: 0,
            initialCenter: { x: 0, y: 0 },
            lastCenter: { x: 0, y: 0 }
        };
        
        // Input state tracking
        this.inputState = {
            primaryPointer: null,
            isPointerDown: false,
            isDragging: false,
            dragStartPoint: null,
            dragThreshold: 5 // pixels
        };
        
        console.log('InputManager: Created');
    }

    /**
     * Initialize the input manager with a target element
     * @param {HTMLElement} targetElement - The element to attach listeners to
     */
    init(targetElement) {
        if (this.isInitialized) {
            console.warn('InputManager: Already initialized');
            return;
        }

        if (!targetElement) {
            throw new Error('InputManager: Target element is required');
        }

        this.targetElement = targetElement;
        this.setupEventListeners();
        this.isInitialized = true;
        
        console.log('InputManager: Initialized with target element');
    }

    /**
     * Clean up all event listeners
     */
    destroy() {
        if (!this.isInitialized) return;

        this.removeEventListeners();
        this.currentPointers.clear();
        this.resetGestureState();
        this.resetInputState();
        this.isInitialized = false;
        
        console.log('InputManager: Destroyed');
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Mouse events
        this.targetElement.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.targetElement.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.targetElement.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.targetElement.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

        // Touch events  
        this.targetElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.targetElement.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.targetElement.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        this.targetElement.addEventListener('touchcancel', this.handleTouchCancel.bind(this), { passive: false });

        // Keyboard events (on document for global capture)
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));

        // Prevent context menu on long press
        this.targetElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /**
     * Remove all event listeners
     */
    removeEventListeners() {
        if (!this.targetElement) return;

        this.targetElement.removeEventListener('mousedown', this.handleMouseDown);
        this.targetElement.removeEventListener('mousemove', this.handleMouseMove);
        this.targetElement.removeEventListener('mouseup', this.handleMouseUp);
        this.targetElement.removeEventListener('mouseleave', this.handleMouseLeave);
        this.targetElement.removeEventListener('touchstart', this.handleTouchStart);
        this.targetElement.removeEventListener('touchmove', this.handleTouchMove);
        this.targetElement.removeEventListener('touchend', this.handleTouchEnd);
        this.targetElement.removeEventListener('touchcancel', this.handleTouchCancel);

        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }

    /**
     * Convert screen coordinates to normalized coordinates
     * @param {number} screenX - Screen X coordinate
     * @param {number} screenY - Screen Y coordinate
     * @returns {Object} Normalized coordinates
     */
    screenToNormalized(screenX, screenY) {
        const rect = this.targetElement.getBoundingClientRect();
        return {
            x: screenX - rect.left,
            y: screenY - rect.top,
            screenX: screenX,
            screenY: screenY
        };
    }

    // ============ MOUSE EVENT HANDLERS ============

    handleMouseDown(e) {
        if (e.button !== 0) return; // Only handle left mouse button

        const coords = this.screenToNormalized(e.clientX, e.clientY);
        const pointerId = 'mouse';

        this.currentPointers.set(pointerId, {
            id: pointerId,
            x: coords.x,
            y: coords.y,
            startX: coords.x,
            startY: coords.y,
            type: 'mouse'
        });

        this.inputState.primaryPointer = pointerId;
        this.inputState.isPointerDown = true;
        this.inputState.dragStartPoint = { x: coords.x, y: coords.y };

        this.emit('pointerStart', {
            pointerId: pointerId,
            x: coords.x,
            y: coords.y,
            pointerType: 'mouse',
            originalEvent: e
        });

        e.preventDefault();
    }

    handleMouseMove(e) {
        const coords = this.screenToNormalized(e.clientX, e.clientY);
        const pointerId = 'mouse';

        if (this.currentPointers.has(pointerId)) {
            const pointer = this.currentPointers.get(pointerId);
            pointer.x = coords.x;
            pointer.y = coords.y;

            // Check for drag start
            if (this.inputState.isPointerDown && !this.inputState.isDragging) {
                const dragDistance = this.getDistance(
                    this.inputState.dragStartPoint,
                    { x: coords.x, y: coords.y }
                );

                if (dragDistance > this.inputState.dragThreshold) {
                    this.inputState.isDragging = true;
                    this.emit('dragStart', {
                        pointerId: pointerId,
                        x: coords.x,
                        y: coords.y,
                        startX: this.inputState.dragStartPoint.x,
                        startY: this.inputState.dragStartPoint.y,
                        originalEvent: e
                    });
                }
            }

            this.emit('pointerMove', {
                pointerId: pointerId,
                x: coords.x,
                y: coords.y,
                pointerType: 'mouse',
                isDragging: this.inputState.isDragging,
                originalEvent: e
            });
        }
    }

    handleMouseUp(e) {
        const coords = this.screenToNormalized(e.clientX, e.clientY);
        const pointerId = 'mouse';

        if (this.currentPointers.has(pointerId)) {
            const wasDragging = this.inputState.isDragging;

            if (wasDragging) {
                this.emit('dragEnd', {
                    pointerId: pointerId,
                    x: coords.x,
                    y: coords.y,
                    originalEvent: e
                });
            } else {
                this.emit('click', {
                    pointerId: pointerId,
                    x: coords.x,
                    y: coords.y,
                    pointerType: 'mouse',
                    originalEvent: e
                });
            }

            this.emit('pointerEnd', {
                pointerId: pointerId,
                x: coords.x,
                y: coords.y,
                pointerType: 'mouse',
                wasDragging: wasDragging,
                originalEvent: e
            });

            this.currentPointers.delete(pointerId);
            this.resetInputState();
        }
    }

    handleMouseLeave(e) {
        const pointerId = 'mouse';
        if (this.currentPointers.has(pointerId)) {
            this.emit('pointerCancel', {
                pointerId: pointerId,
                originalEvent: e
            });
            this.currentPointers.delete(pointerId);
            this.resetInputState();
        }
    }

    // ============ TOUCH EVENT HANDLERS ============

    handleTouchStart(e) {
        e.preventDefault(); // Prevent mouse events on mobile

        Array.from(e.changedTouches).forEach(touch => {
            const coords = this.screenToNormalized(touch.clientX, touch.clientY);
            const pointerId = `touch_${touch.identifier}`;

            this.currentPointers.set(pointerId, {
                id: pointerId,
                x: coords.x,
                y: coords.y,
                startX: coords.x,
                startY: coords.y,
                type: 'touch',
                identifier: touch.identifier
            });

            // Set primary pointer if none exists
            if (!this.inputState.primaryPointer) {
                this.inputState.primaryPointer = pointerId;
                this.inputState.isPointerDown = true;
                this.inputState.dragStartPoint = { x: coords.x, y: coords.y };
            }

            this.emit('pointerStart', {
                pointerId: pointerId,
                x: coords.x,
                y: coords.y,
                pointerType: 'touch',
                originalEvent: e
            });
        });

        // Handle multi-touch gestures
        if (this.currentPointers.size === 2) {
            this.startGesture();
        }
    }

    handleTouchMove(e) {
        e.preventDefault();

        Array.from(e.changedTouches).forEach(touch => {
            const coords = this.screenToNormalized(touch.clientX, touch.clientY);
            const pointerId = `touch_${touch.identifier}`;

            if (this.currentPointers.has(pointerId)) {
                const pointer = this.currentPointers.get(pointerId);
                pointer.x = coords.x;
                pointer.y = coords.y;

                // Check for drag start on primary pointer
                if (pointerId === this.inputState.primaryPointer && 
                    this.inputState.isPointerDown && 
                    !this.inputState.isDragging &&
                    !this.gestureState.isGesturing) {
                    
                    const dragDistance = this.getDistance(
                        this.inputState.dragStartPoint,
                        { x: coords.x, y: coords.y }
                    );

                    if (dragDistance > this.inputState.dragThreshold) {
                        this.inputState.isDragging = true;
                        this.emit('dragStart', {
                            pointerId: pointerId,
                            x: coords.x,
                            y: coords.y,
                            startX: this.inputState.dragStartPoint.x,
                            startY: this.inputState.dragStartPoint.y,
                            originalEvent: e
                        });
                    }
                }

                this.emit('pointerMove', {
                    pointerId: pointerId,
                    x: coords.x,
                    y: coords.y,
                    pointerType: 'touch',
                    isDragging: this.inputState.isDragging,
                    originalEvent: e
                });
            }
        });

        // Handle multi-touch gestures
        if (this.gestureState.isGesturing && this.currentPointers.size === 2) {
            this.updateGesture();
        }
    }

    handleTouchEnd(e) {
        e.preventDefault();

        Array.from(e.changedTouches).forEach(touch => {
            const coords = this.screenToNormalized(touch.clientX, touch.clientY);
            const pointerId = `touch_${touch.identifier}`;

            if (this.currentPointers.has(pointerId)) {
                const wasDragging = this.inputState.isDragging;
                const isPrimary = pointerId === this.inputState.primaryPointer;

                if (isPrimary && wasDragging) {
                    this.emit('dragEnd', {
                        pointerId: pointerId,
                        x: coords.x,
                        y: coords.y,
                        originalEvent: e
                    });
                } else if (isPrimary && !wasDragging && !this.gestureState.isGesturing) {
                    this.emit('click', {
                        pointerId: pointerId,
                        x: coords.x,
                        y: coords.y,
                        pointerType: 'touch',
                        originalEvent: e
                    });
                }

                this.emit('pointerEnd', {
                    pointerId: pointerId,
                    x: coords.x,
                    y: coords.y,
                    pointerType: 'touch',
                    wasDragging: wasDragging,
                    originalEvent: e
                });

                this.currentPointers.delete(pointerId);

                // Reset input state if primary pointer ended
                if (isPrimary) {
                    this.resetInputState();
                }
            }
        });

        // End gesture if less than 2 pointers
        if (this.currentPointers.size < 2 && this.gestureState.isGesturing) {
            this.endGesture();
        }
    }

    handleTouchCancel(e) {
        Array.from(e.changedTouches).forEach(touch => {
            const pointerId = `touch_${touch.identifier}`;
            if (this.currentPointers.has(pointerId)) {
                this.emit('pointerCancel', {
                    pointerId: pointerId,
                    originalEvent: e
                });
                this.currentPointers.delete(pointerId);
            }
        });

        this.resetInputState();
        this.resetGestureState();
    }

    // ============ KEYBOARD EVENT HANDLERS ============

    handleKeyDown(e) {
        this.emit('keyDown', {
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            originalEvent: e
        });
    }

    handleKeyUp(e) {
        this.emit('keyUp', {
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            originalEvent: e
        });
    }

    // ============ GESTURE HANDLING ============

    startGesture() {
        const pointers = Array.from(this.currentPointers.values());
        if (pointers.length !== 2) return;

        const [p1, p2] = pointers;
        const center = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };
        const distance = this.getDistance(p1, p2);

        this.gestureState = {
            isGesturing: true,
            initialDistance: distance,
            initialCenter: center,
            lastCenter: center
        };

        // Cancel any ongoing drag
        if (this.inputState.isDragging) {
            this.emit('dragCancel', {
                originalEvent: event
            });
        }

        this.resetInputState();

        this.emit('gestureStart', {
            center: center,
            distance: distance,
            scale: 1,
            pointers: pointers
        });
    }

    updateGesture() {
        if (!this.gestureState.isGesturing) return;

        const pointers = Array.from(this.currentPointers.values());
        if (pointers.length !== 2) return;

        const [p1, p2] = pointers;
        const center = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };
        const distance = this.getDistance(p1, p2);
        const scale = distance / this.gestureState.initialDistance;

        const pan = {
            deltaX: center.x - this.gestureState.lastCenter.x,
            deltaY: center.y - this.gestureState.lastCenter.y
        };

        this.gestureState.lastCenter = center;

        this.emit('gestureUpdate', {
            center: center,
            distance: distance,
            scale: scale,
            pan: pan,
            pointers: pointers
        });
    }

    endGesture() {
        if (!this.gestureState.isGesturing) return;

        this.emit('gestureEnd', {
            center: this.gestureState.lastCenter
        });

        this.resetGestureState();
    }

    // ============ UTILITY METHODS ============

    getDistance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    resetInputState() {
        this.inputState = {
            primaryPointer: null,
            isPointerDown: false,
            isDragging: false,
            dragStartPoint: null,
            dragThreshold: 5
        };
    }

    resetGestureState() {
        this.gestureState = {
            isGesturing: false,
            initialDistance: 0,
            initialCenter: { x: 0, y: 0 },
            lastCenter: { x: 0, y: 0 }
        };
    }

    // ============ EVENT SYSTEM ============

    /**
     * Add event listener
     * @param {string} eventType - Type of event to listen for
     * @param {Function} callback - Callback function
     */
    on(eventType, callback) {
        this.eventTarget.addEventListener(eventType, callback);
    }

    /**
     * Remove event listener
     * @param {string} eventType - Type of event
     * @param {Function} callback - Callback function
     */
    off(eventType, callback) {
        this.eventTarget.removeEventListener(eventType, callback);
    }

    /**
     * Emit event
     * @param {string} eventType - Type of event to emit
     * @param {Object} data - Event data
     */
    emit(eventType, data) {
        this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail: data }));
    }

    // ============ PUBLIC API ============

    /**
     * Get current pointer information
     * @returns {Array} Array of active pointers
     */
    getActivePointers() {
        return Array.from(this.currentPointers.values());
    }

    /**
     * Check if currently in a gesture
     * @returns {boolean} True if gesturing
     */
    isGesturing() {
        return this.gestureState.isGesturing;
    }

    /**
     * Check if currently dragging
     * @returns {boolean} True if dragging
     */
    isDragging() {
        return this.inputState.isDragging;
    }

    /**
     * Get the primary pointer (first touch or mouse)
     * @returns {Object|null} Primary pointer data or null
     */
    getPrimaryPointer() {
        if (this.inputState.primaryPointer) {
            return this.currentPointers.get(this.inputState.primaryPointer);
        }
        return null;
    }
}