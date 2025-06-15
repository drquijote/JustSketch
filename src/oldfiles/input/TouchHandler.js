// src/input/TouchHandler.js - Specialized touch gesture handling
// This file is completely independent and does not depend on any existing files

/**
 * TouchHandler manages advanced touch gestures and mobile-specific interactions
 * Provides gesture recognition for pinch, pan, rotate, and tap variations
 */
export class TouchHandler {
    constructor() {
        this.isInitialized = false;
        this.eventTarget = new EventTarget();
        this.targetElement = null;
        
        // Touch tracking
        this.activeTouches = new Map();
        this.touchHistory = new Map(); // For velocity calculations
        
        // Gesture state
        this.gestureState = {
            isActive: false,
            type: null, // 'pan', 'pinch', 'rotate', 'tap'
            startTime: 0,
            initialTouches: [],
            
            // Pinch/zoom specific
            initialDistance: 0,
            currentDistance: 0,
            initialCenter: { x: 0, y: 0 },
            currentCenter: { x: 0, y: 0 },
            
            // Rotation specific
            initialAngle: 0,
            currentAngle: 0,
            
            // Pan specific
            totalDeltaX: 0,
            totalDeltaY: 0,
            
            // Tap specific
            tapCount: 0,
            lastTapTime: 0,
            tapTimeout: null
        };
        
        // Configuration
        this.config = {
            tapTimeout: 300, // ms for double tap detection
            tapRadius: 20, // pixels - max movement for tap
            panThreshold: 10, // pixels - min movement for pan
            pinchThreshold: 20, // pixels - min distance change for pinch
            rotationThreshold: 15, // degrees - min rotation for rotate gesture
            longPressTimeout: 500, // ms for long press
            velocitySamples: 5 // number of samples for velocity calculation
        };
        
        // Long press timer
        this.longPressTimer = null;
        
        console.log('TouchHandler: Created');
    }

    /**
     * Initialize touch handler with target element
     * @param {HTMLElement} targetElement - Element to attach touch listeners to
     */
    init(targetElement) {
        if (this.isInitialized) {
            console.warn('TouchHandler: Already initialized');
            return;
        }

        if (!targetElement) {
            throw new Error('TouchHandler: Target element is required');
        }

        this.targetElement = targetElement;
        this.setupTouchListeners();
        this.isInitialized = true;
        
        console.log('TouchHandler: Initialized');
    }

    /**
     * Clean up touch handler
     */
    destroy() {
        if (!this.isInitialized) return;

        this.removeTouchListeners();
        this.clearAllTimers();
        this.activeTouches.clear();
        this.touchHistory.clear();
        this.resetGestureState();
        this.isInitialized = false;
        
        console.log('TouchHandler: Destroyed');
    }

    /**
     * Setup touch event listeners
     */
    setupTouchListeners() {
        this.targetElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.targetElement.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.targetElement.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        this.targetElement.addEventListener('touchcancel', this.handleTouchCancel.bind(this), { passive: false });
    }

    /**
     * Remove touch event listeners
     */
    removeTouchListeners() {
        if (!this.targetElement) return;

        this.targetElement.removeEventListener('touchstart', this.handleTouchStart);
        this.targetElement.removeEventListener('touchmove', this.handleTouchMove);
        this.targetElement.removeEventListener('touchend', this.handleTouchEnd);
        this.targetElement.removeEventListener('touchcancel', this.handleTouchCancel);
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
        e.preventDefault();
        
        const timestamp = Date.now();
        
        // Process each new touch
        Array.from(e.changedTouches).forEach(touch => {
            const touchData = this.createTouchData(touch, timestamp);
            this.activeTouches.set(touch.identifier, touchData);
            this.addToHistory(touch.identifier, touchData);
        });

        const touchCount = this.activeTouches.size;
        console.log(`TouchHandler: Touch start, active touches: ${touchCount}`);

        // Determine gesture type based on touch count
        if (touchCount === 1) {
            this.handleSingleTouchStart(timestamp);
        } else if (touchCount === 2) {
            this.handleTwoTouchStart(timestamp);
        } else {
            this.cancelCurrentGesture();
        }

        this.emit('touchStart', {
            touchCount: touchCount,
            touches: Array.from(this.activeTouches.values()),
            originalEvent: e
        });
    }

    /**
     * Handle touch move
     */
    handleTouchMove(e) {
        e.preventDefault();
        
        const timestamp = Date.now();
        
        // Update touch positions
        Array.from(e.changedTouches).forEach(touch => {
            if (this.activeTouches.has(touch.identifier)) {
                const touchData = this.createTouchData(touch, timestamp);
                this.activeTouches.set(touch.identifier, touchData);
                this.addToHistory(touch.identifier, touchData);
            }
        });

        const touchCount = this.activeTouches.size;

        if (touchCount === 1) {
            this.handleSingleTouchMove(timestamp);
        } else if (touchCount === 2) {
            this.handleTwoTouchMove(timestamp);
        }

        this.emit('touchMove', {
            touchCount: touchCount,
            touches: Array.from(this.activeTouches.values()),
            gestureType: this.gestureState.type,
            originalEvent: e
        });
    }

    /**
     * Handle touch end
     */
    handleTouchEnd(e) {
        e.preventDefault();
        
        const timestamp = Date.now();

        // Remove ended touches
        Array.from(e.changedTouches).forEach(touch => {
            this.activeTouches.delete(touch.identifier);
        });

        const touchCount = this.activeTouches.size;

        if (touchCount === 0) {
            this.handleAllTouchesEnd(timestamp);
        } else if (touchCount === 1 && this.gestureState.type === 'pinch') {
            // Transition from pinch to pan
            this.endCurrentGesture();
            this.handleSingleTouchStart(timestamp);
        }

        this.emit('touchEnd', {
            touchCount: touchCount,
            touches: Array.from(this.activeTouches.values()),
            gestureType: this.gestureState.type,
            originalEvent: e
        });
    }

    /**
     * Handle touch cancel
     */
    handleTouchCancel(e) {
        console.log('TouchHandler: Touch cancelled');
        
        Array.from(e.changedTouches).forEach(touch => {
            this.activeTouches.delete(touch.identifier);
        });

        this.cancelCurrentGesture();
        
        this.emit('touchCancel', {
            originalEvent: e
        });
    }

    // ============ SINGLE TOUCH HANDLING ============

    handleSingleTouchStart(timestamp) {
        this.clearLongPressTimer();
        
        const touch = Array.from(this.activeTouches.values())[0];
        
        // Check for tap gesture (including multi-tap)
        if (this.isNearLastTap(touch) && (timestamp - this.gestureState.lastTapTime) < this.config.tapTimeout) {
            this.gestureState.tapCount++;
        } else {
            this.gestureState.tapCount = 1;
        }

        this.gestureState.type = 'tap';
        this.gestureState.startTime = timestamp;
        this.gestureState.initialTouches = [{ ...touch }];

        // Start long press timer
        this.longPressTimer = setTimeout(() => {
            if (this.gestureState.type === 'tap' && this.activeTouches.size === 1) {
                this.emitLongPress(touch);
            }
        }, this.config.longPressTimeout);
    }

    handleSingleTouchMove(timestamp) {
        const touch = Array.from(this.activeTouches.values())[0];
        const initialTouch = this.gestureState.initialTouches[0];
        
        if (!initialTouch) return;

        const deltaX = touch.x - initialTouch.x;
        const deltaY = touch.y - initialTouch.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Check if movement exceeds tap threshold
        if (distance > this.config.tapRadius) {
            this.clearLongPressTimer();

            if (this.gestureState.type === 'tap') {
                // Transition to pan
                this.gestureState.type = 'pan';
                this.gestureState.totalDeltaX = deltaX;
                this.gestureState.totalDeltaY = deltaY;

                this.emit('panStart', {
                    startX: initialTouch.x,
                    startY: initialTouch.y,
                    currentX: touch.x,
                    currentY: touch.y,
                    deltaX: deltaX,
                    deltaY: deltaY
                });
            } else if (this.gestureState.type === 'pan') {
                // Continue pan
                const frameDeltaX = deltaX - this.gestureState.totalDeltaX;
                const frameDeltaY = deltaY - this.gestureState.totalDeltaY;
                
                this.gestureState.totalDeltaX = deltaX;
                this.gestureState.totalDeltaY = deltaY;

                this.emit('panUpdate', {
                    startX: initialTouch.x,
                    startY: initialTouch.y,
                    currentX: touch.x,
                    currentY: touch.y,
                    deltaX: deltaX,
                    deltaY: deltaY,
                    frameDeltaX: frameDeltaX,
                    frameDeltaY: frameDeltaY,
                    velocity: this.calculateVelocity(touch.identifier)
                });
            }
        }
    }

    // ============ TWO TOUCH HANDLING ============

    handleTwoTouchStart(timestamp) {
        this.clearLongPressTimer();
        
        const touches = Array.from(this.activeTouches.values());
        const [touch1, touch2] = touches;

        this.gestureState.type = 'pinch';
        this.gestureState.startTime = timestamp;
        this.gestureState.initialTouches = touches.map(t => ({ ...t }));
        
        // Calculate initial values
        this.gestureState.initialDistance = this.getDistance(touch1, touch2);
        this.gestureState.currentDistance = this.gestureState.initialDistance;
        this.gestureState.initialCenter = this.getCenter(touch1, touch2);
        this.gestureState.currentCenter = { ...this.gestureState.initialCenter };
        this.gestureState.initialAngle = this.getAngle(touch1, touch2);
        this.gestureState.currentAngle = this.gestureState.initialAngle;

        this.emit('pinchStart', {
            center: this.gestureState.initialCenter,
            distance: this.gestureState.initialDistance,
            scale: 1,
            rotation: 0
        });
    }

    handleTwoTouchMove(timestamp) {
        const touches = Array.from(this.activeTouches.values());
        if (touches.length !== 2) return;

        const [touch1, touch2] = touches;

        // Calculate current values
        const currentDistance = this.getDistance(touch1, touch2);
        const currentCenter = this.getCenter(touch1, touch2);
        const currentAngle = this.getAngle(touch1, touch2);

        // Calculate deltas
        const scale = currentDistance / this.gestureState.initialDistance;
        const rotation = this.normalizeAngle(currentAngle - this.gestureState.initialAngle);
        
        const centerDeltaX = currentCenter.x - this.gestureState.currentCenter.x;
        const centerDeltaY = currentCenter.y - this.gestureState.currentCenter.y;

        // Update state
        this.gestureState.currentDistance = currentDistance;
        this.gestureState.currentCenter = currentCenter;
        this.gestureState.currentAngle = currentAngle;

        this.emit('pinchUpdate', {
            center: currentCenter,
            distance: currentDistance,
            scale: scale,
            rotation: rotation,
            centerDeltaX: centerDeltaX,
            centerDeltaY: centerDeltaY
        });
    }

    // ============ GESTURE COMPLETION ============

    handleAllTouchesEnd(timestamp) {
        const duration = timestamp - this.gestureState.startTime;

        if (this.gestureState.type === 'tap') {
            this.handleTapEnd(duration);
        } else if (this.gestureState.type === 'pan') {
            this.handlePanEnd();
        } else if (this.gestureState.type === 'pinch') {
            this.handlePinchEnd();
        }

        this.endCurrentGesture();
    }

    handleTapEnd(duration) {
        const touch = this.gestureState.initialTouches[0];
        
        if (duration < this.config.tapTimeout) {
            this.gestureState.lastTapTime = Date.now();

            // Clear any existing tap timeout
            if (this.gestureState.tapTimeout) {
                clearTimeout(this.gestureState.tapTimeout);
            }

            // Set timeout for multi-tap detection
            this.gestureState.tapTimeout = setTimeout(() => {
                this.emitTap(touch, this.gestureState.tapCount);
                this.gestureState.tapCount = 0;
            }, this.config.tapTimeout);
        }
    }

    handlePanEnd() {
        const touch = Array.from(this.activeTouches.values())[0] || this.gestureState.initialTouches[0];
        const velocity = this.calculateVelocity(touch?.identifier);

        this.emit('panEnd', {
            endX: touch?.x || 0,
            endY: touch?.y || 0,
            totalDeltaX: this.gestureState.totalDeltaX,
            totalDeltaY: this.gestureState.totalDeltaY,
            velocity: velocity
        });
    }

    handlePinchEnd() {
        const scale = this.gestureState.currentDistance / this.gestureState.initialDistance;
        const rotation = this.normalizeAngle(this.gestureState.currentAngle - this.gestureState.initialAngle);

        this.emit('pinchEnd', {
            finalScale: scale,
            finalRotation: rotation,
            center: this.gestureState.currentCenter
        });
    }

    // ============ UTILITY METHODS ============

    createTouchData(touch, timestamp) {
        const rect = this.targetElement.getBoundingClientRect();
        return {
            identifier: touch.identifier,
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top,
            screenX: touch.clientX,
            screenY: touch.clientY,
            timestamp: timestamp
        };
    }

    addToHistory(identifier, touchData) {
        if (!this.touchHistory.has(identifier)) {
            this.touchHistory.set(identifier, []);
        }

        const history = this.touchHistory.get(identifier);
        history.push(touchData);

        // Keep only recent samples for velocity calculation
        if (history.length > this.config.velocitySamples) {
            history.shift();
        }
    }

    calculateVelocity(identifier) {
        const history = this.touchHistory.get(identifier);
        if (!history || history.length < 2) {
            return { x: 0, y: 0, magnitude: 0 };
        }

        const recent = history[history.length - 1];
        const previous = history[history.length - 2];
        
        const deltaX = recent.x - previous.x;
        const deltaY = recent.y - previous.y;
        const deltaTime = recent.timestamp - previous.timestamp;

        if (deltaTime === 0) {
            return { x: 0, y: 0, magnitude: 0 };
        }

        const velocityX = deltaX / deltaTime;
        const velocityY = deltaY / deltaTime;
        const magnitude = Math.sqrt(velocityX * velocityX + velocityY * velocityY);

        return {
            x: velocityX,
            y: velocityY,
            magnitude: magnitude
        };
    }

    getDistance(touch1, touch2) {
        const dx = touch2.x - touch1.x;
        const dy = touch2.y - touch1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getCenter(touch1, touch2) {
        return {
            x: (touch1.x + touch2.x) / 2,
            y: (touch1.y + touch2.y) / 2
        };
    }

    getAngle(touch1, touch2) {
        return Math.atan2(touch2.y - touch1.y, touch2.x - touch1.x);
    }

    normalizeAngle(angle) {
        // Normalize angle to -π to π range
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }

    isNearLastTap(touch) {
        if (this.gestureState.tapCount === 0) return false;
        
        const lastTouch = this.gestureState.initialTouches[0];
        if (!lastTouch) return false;

        const distance = Math.sqrt(
            Math.pow(touch.x - lastTouch.x, 2) + 
            Math.pow(touch.y - lastTouch.y, 2)
        );

        return distance <= this.config.tapRadius;
    }

    clearLongPressTimer() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    clearAllTimers() {
        this.clearLongPressTimer();
        
        if (this.gestureState.tapTimeout) {
            clearTimeout(this.gestureState.tapTimeout);
            this.gestureState.tapTimeout = null;
        }
    }

    resetGestureState() {
        this.clearAllTimers();
        
        this.gestureState = {
            isActive: false,
            type: null,
            startTime: 0,
            initialTouches: [],
            initialDistance: 0,
            currentDistance: 0,
            initialCenter: { x: 0, y: 0 },
            currentCenter: { x: 0, y: 0 },
            initialAngle: 0,
            currentAngle: 0,
            totalDeltaX: 0,
            totalDeltaY: 0,
            tapCount: 0,
            lastTapTime: 0,
            tapTimeout: null
        };
    }

    endCurrentGesture() {
        this.gestureState.isActive = false;
        this.gestureState.type = null;
        this.clearAllTimers();
    }

    cancelCurrentGesture() {
        this.emit('gestureCancel', {
            type: this.gestureState.type
        });
        
        this.resetGestureState();
        this.activeTouches.clear();
        this.touchHistory.clear();
    }

    // ============ EVENT EMISSION ============

    emitTap(touch, tapCount) {
        const eventType = tapCount === 1 ? 'tap' : tapCount === 2 ? 'doubleTap' : 'multiTap';
        
        this.emit(eventType, {
            x: touch.x,
            y: touch.y,
            tapCount: tapCount
        });

        // Also emit generic tap event
        this.emit('tapGesture', {
            x: touch.x,
            y: touch.y,
            tapCount: tapCount,
            type: eventType
        });
    }

    emitLongPress(touch) {
        this.emit('longPress', {
            x: touch.x,
            y: touch.y,
            duration: Date.now() - this.gestureState.startTime
        });
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

    getCurrentGesture() {
        return {
            type: this.gestureState.type,
            isActive: this.gestureState.isActive,
            duration: this.gestureState.startTime ? Date.now() - this.gestureState.startTime : 0
        };
    }

    getActiveTouchCount() {
        return this.activeTouches.size;
    }

    isGestureActive() {
        return this.gestureState.isActive;
    }
}