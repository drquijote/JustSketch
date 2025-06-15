// src/core/AppState.js - REFACTORED for modular architecture

/**
 * Centralized Application State Management
 * 
 * This is the single source of truth for the entire application.
 * All modules interact with state through this interface.
 */
export class AppState {
    constructor() {
        // Prevent direct instantiation - this is a singleton
        if (AppState.instance) {
            return AppState.instance;
        }
        
        this.initializeState();
        AppState.instance = this;
    }

    /**
     * Initialize the default application state
     */
    initializeState() {
        // === CORE REFERENCES ===
        this.canvas = null;
        this.ctx = null;
        this.eventBus = null;
        this.deviceDetection = null;
        this.geometryUtils = null;
        
        // === VIEWPORT & TRANSFORM ===
        this.viewportTransform = {
            x: 0,
            y: 0,
            scale: 1
        };
        
        // === CURRENT MODE & STATE ===
        this.currentMode = 'placement'; // 'placement', 'drawing', 'edit', 'photos'
        this.editSubMode = null; // null, 'labels', 'areas' (when in edit mode)
        
        // === INTERACTION STATE ===
        this.selectedElement = null;
        this.activePhotoElement = null;
        this.isDragging = false;
        this.isPanning = false;
        this.clickHasBeenProcessed = false;
        
        // === DATA COLLECTIONS ===
        this.placedElements = [];      // Room labels, icons, photos
        this.drawnPolygons = [];       // Completed floor plan areas
        this.drawnLines = [];          // Individual lines (if needed)
        
        // === CURRENT DRAWING STATE ===
        this.currentPolygonPoints = [];
        this.currentPolygonCounter = 0;
        
        // === HELPER POINTS ===
        this.helperPoints = [];          // Temporary helper points (purple)
        this.permanentHelperPoints = []; // Permanent helper points (blue)
        
        // === HISTORY SYSTEM ===
        this.actionHistory = [];
        this.historyIndex = -1;
        
        // === SKETCH MANAGEMENT ===
        this.currentSketchId = null;
        this.currentSketchName = null;
        
        // === EVENT SYSTEM ===
        this.events = new EventTarget();
        
        console.log('📊 AppState: Initialized with default state');
    }

    /**
     * Initialize AppState with dependency injection
     * Called by main.js during app initialization
     */
    static init(dependencies = {}) {
        const instance = new AppState();
        
        // Inject dependencies
        if (dependencies.eventBus) {
            instance.eventBus = dependencies.eventBus;
        }
        if (dependencies.deviceDetection) {
            instance.deviceDetection = dependencies.deviceDetection;
        }
        if (dependencies.geometryUtils) {
            instance.geometryUtils = dependencies.geometryUtils;
        }
        
        // Setup the static interface
        AppState.setupStaticInterface(instance);
        
        console.log('🔧 AppState: Initialized with dependencies');
        return instance;
    }

    /**
     * Setup static interface for backwards compatibility
     * This allows modules to use AppState.property instead of AppState.instance.property
     */
    static setupStaticInterface(instance) {
        // Create property descriptors for all state properties
        const stateProperties = [
            'canvas', 'ctx', 'viewportTransform', 'currentMode', 'editSubMode',
            'selectedElement', 'activePhotoElement', 'isDragging', 'isPanning',
            'clickHasBeenProcessed', 'placedElements', 'drawnPolygons', 'drawnLines',
            'currentPolygonPoints', 'currentPolygonCounter', 'helperPoints',
            'permanentHelperPoints', 'actionHistory', 'historyIndex',
            'currentSketchId', 'currentSketchName', 'events'
        ];
        
        stateProperties.forEach(prop => {
            Object.defineProperty(AppState, prop, {
                get() { return instance[prop]; },
                set(value) { instance[prop] = value; },
                enumerable: true,
                configurable: true
            });
        });
        
        // Setup static methods
        AppState.emit = instance.emit.bind(instance);
        AppState.on = instance.on.bind(instance);
        AppState.off = instance.off.bind(instance);
        AppState.getStateSnapshot = instance.getStateSnapshot.bind(instance);
        AppState.restoreStateSnapshot = instance.restoreStateSnapshot.bind(instance);
        AppState.getInitialState = instance.getInitialState.bind(instance);
        AppState.reset = instance.reset.bind(instance);
        
        console.log('🔗 AppState: Static interface configured');
    }

    // === EVENT SYSTEM ===

    /**
     * Emit an event to all listeners
     */
    emit(eventType, data = null) {
        try {
            const event = new CustomEvent(eventType, { 
                detail: data,
                bubbles: false,
                cancelable: true
            });
            
            this.events.dispatchEvent(event);
            
            // Only log non-render events to avoid spam
            if (!eventType.includes('redraw') && !eventType.includes('render')) {
                console.log(`📡 AppState emitted: ${eventType}`, data);
            }
            
            return event;
        } catch (error) {
            console.error(`❌ AppState: Error emitting event ${eventType}:`, error);
        }
    }

    /**
     * Listen for events
     */
    on(eventType, callback, options = {}) {
        try {
            this.events.addEventListener(eventType, callback, options);
            
            if (!eventType.includes('redraw') && !eventType.includes('render')) {
                console.log(`👂 AppState: Listener added for ${eventType}`);
            }
        } catch (error) {
            console.error(`❌ AppState: Error adding listener for ${eventType}:`, error);
        }
    }

    /**
     * Remove event listener
     */
    off(eventType, callback, options = {}) {
        try {
            this.events.removeEventListener(eventType, callback, options);
            console.log(`🔇 AppState: Listener removed for ${eventType}`);
        } catch (error) {
            console.error(`❌ AppState: Error removing listener for ${eventType}:`, error);
        }
    }

    // === STATE MANAGEMENT ===

    /**
     * Get complete state snapshot for saving/undo
     */
    getStateSnapshot() {
        return {
            // Data collections
            placedElements: JSON.parse(JSON.stringify(this.placedElements)),
            drawnPolygons: JSON.parse(JSON.stringify(this.drawnPolygons)),
            drawnLines: JSON.parse(JSON.stringify(this.drawnLines)),
            
            // Current drawing state
            currentPolygonPoints: JSON.parse(JSON.stringify(this.currentPolygonPoints)),
            currentPolygonCounter: this.currentPolygonCounter,
            
            // Helper points
            helperPoints: JSON.parse(JSON.stringify(this.helperPoints)),
            permanentHelperPoints: JSON.parse(JSON.stringify(this.permanentHelperPoints)),
            
            // Viewport
            viewportTransform: JSON.parse(JSON.stringify(this.viewportTransform)),
            
            // Mode state
            currentMode: this.currentMode,
            editSubMode: this.editSubMode,
            
            // Sketch info
            currentSketchId: this.currentSketchId,
            currentSketchName: this.currentSketchName,
            
            // Metadata
            timestamp: Date.now(),
            version: '2.0.0'
        };
    }

    /**
     * Restore state from snapshot
     */
    restoreStateSnapshot(snapshot) {
        try {
            // Validate snapshot
            if (!snapshot || typeof snapshot !== 'object') {
                throw new Error('Invalid snapshot provided');
            }
            
            // Restore data collections
            this.placedElements = JSON.parse(JSON.stringify(snapshot.placedElements || []));
            this.drawnPolygons = JSON.parse(JSON.stringify(snapshot.drawnPolygons || []));
            this.drawnLines = JSON.parse(JSON.stringify(snapshot.drawnLines || []));
            
            // Restore current drawing state
            this.currentPolygonPoints = JSON.parse(JSON.stringify(snapshot.currentPolygonPoints || []));
            this.currentPolygonCounter = snapshot.currentPolygonCounter || 0;
            
            // Restore helper points
            this.helperPoints = JSON.parse(JSON.stringify(snapshot.helperPoints || []));
            this.permanentHelperPoints = JSON.parse(JSON.stringify(snapshot.permanentHelperPoints || []));
            
            // Restore viewport
            if (snapshot.viewportTransform) {
                this.viewportTransform = JSON.parse(JSON.stringify(snapshot.viewportTransform));
            }
            
            // Restore mode state
            this.currentMode = snapshot.currentMode || 'placement';
            this.editSubMode = snapshot.editSubMode || null;
            
            // Restore sketch info
            this.currentSketchId = snapshot.currentSketchId || null;
            this.currentSketchName = snapshot.currentSketchName || null;
            
            // Emit restoration event
            this.emit('state:restored', { snapshot });
            
            console.log('🔄 AppState: State restored from snapshot');
            
        } catch (error) {
            console.error('❌ AppState: Error restoring state:', error);
            throw error;
        }
    }

    /**
     * Get initial/clean state
     */
    getInitialState() {
        return {
            placedElements: [],
            drawnPolygons: [],
            drawnLines: [],
            currentPolygonPoints: [],
            currentPolygonCounter: 0,
            helperPoints: [],
            permanentHelperPoints: [],
            viewportTransform: { x: 0, y: 0, scale: 1 },
            currentMode: 'placement',
            editSubMode: null,
            currentSketchId: null,
            currentSketchName: null,
            timestamp: Date.now(),
            version: '2.0.0'
        };
    }

    /**
     * Reset to initial state
     */
    reset() {
        console.log('🔄 AppState: Resetting to initial state');
        const initialState = this.getInitialState();
        this.restoreStateSnapshot(initialState);
        this.emit('state:reset');
    }

    // === MODE MANAGEMENT ===

    /**
     * Set current mode with validation
     */
    setMode(mode, subMode = null) {
        const validModes = ['placement', 'drawing', 'edit', 'photos'];
        const validEditSubModes = ['labels', 'areas'];
        
        if (!validModes.includes(mode)) {
            console.warn(`⚠️ AppState: Invalid mode "${mode}". Valid modes:`, validModes);
            return false;
        }
        
        if (mode === 'edit' && subMode && !validEditSubModes.includes(subMode)) {
            console.warn(`⚠️ AppState: Invalid edit sub-mode "${subMode}". Valid sub-modes:`, validEditSubModes);
            return false;
        }
        
        const oldMode = this.currentMode;
        const oldSubMode = this.editSubMode;
        
        this.currentMode = mode;
        this.editSubMode = (mode === 'edit') ? subMode : null;
        
        // Emit mode change event
        this.emit('mode:changed', {
            oldMode,
            oldSubMode,
            mode,
            subMode: this.editSubMode
        });
        
        console.log(`🔄 AppState: Mode changed from ${oldMode}${oldSubMode ? `/${oldSubMode}` : ''} to ${mode}${this.editSubMode ? `/${this.editSubMode}` : ''}`);
        
        return true;
    }

    /**
     * Get current mode info
     */
    getModeInfo() {
        return {
            mode: this.currentMode,
            subMode: this.editSubMode,
            isDrawing: this.currentMode === 'drawing',
            isEditingAreas: this.currentMode === 'edit' && this.editSubMode === 'areas',
            isEditingLabels: this.currentMode === 'edit' && this.editSubMode === 'labels',
            isPhotos: this.currentMode === 'photos',
            isPlacement: this.currentMode === 'placement'
        };
    }

    // === CANVAS MANAGEMENT ===

    /**
     * Set canvas reference (called by CanvasManager)
     */
    setCanvas(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        console.log('🎨 AppState: Canvas references set');
    }

    /**
     * Update viewport transform
     */
    updateViewportTransform(transform) {
        if (transform) {
            this.viewportTransform = { ...this.viewportTransform, ...transform };
        }
        this.emit('viewport:changed', this.viewportTransform);
    }

    // === ELEMENT MANAGEMENT ===

    /**
     * Add element to placed elements
     */
    addElement(element) {
        if (!element || typeof element !== 'object') {
            console.warn('⚠️ AppState: Invalid element provided to addElement');
            return false;
        }
        
        // Generate ID if not provided
        if (!element.id) {
            element.id = `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        this.placedElements.push(element);
        this.emit('element:added', element);
        
        console.log(`➕ AppState: Element added (${element.type}):`, element.id);
        return true;
    }

    /**
     * Remove element from placed elements
     */
    removeElement(elementOrId) {
        const id = typeof elementOrId === 'string' ? elementOrId : elementOrId.id;
        const index = this.placedElements.findIndex(el => el.id === id);
        
        if (index === -1) {
            console.warn(`⚠️ AppState: Element not found for removal: ${id}`);
            return false;
        }
        
        const removedElement = this.placedElements.splice(index, 1)[0];
        this.emit('element:removed', removedElement);
        
        console.log(`➖ AppState: Element removed (${removedElement.type}):`, id);
        return true;
    }

    /**
     * Add polygon to drawn polygons
     */
    addPolygon(polygon) {
        if (!polygon || typeof polygon !== 'object') {
            console.warn('⚠️ AppState: Invalid polygon provided to addPolygon');
            return false;
        }
        
        // Generate ID if not provided
        if (!polygon.id) {
            polygon.id = `polygon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        this.drawnPolygons.push(polygon);
        this.emit('polygon:added', polygon);
        
        console.log(`➕ AppState: Polygon added:`, polygon.label || polygon.id);
        return true;
    }

    /**
     * Remove polygon from drawn polygons
     */
    removePolygon(polygonOrId) {
        const id = typeof polygonOrId === 'string' ? polygonOrId : polygonOrId.id;
        const index = this.drawnPolygons.findIndex(poly => poly.id === id);
        
        if (index === -1) {
            console.warn(`⚠️ AppState: Polygon not found for removal: ${id}`);
            return false;
        }
        
        const removedPolygon = this.drawnPolygons.splice(index, 1)[0];
        this.emit('polygon:removed', removedPolygon);
        
        console.log(`➖ AppState: Polygon removed:`, removedPolygon.label || id);
        return true;
    }

    // === HELPER POINT MANAGEMENT ===

    /**
     * Update helper points
     */
    updateHelperPoints(points) {
        this.helperPoints = points || [];
        this.emit('helperPoints:updated', this.helperPoints);
    }

    /**
     * Add permanent helper point
     */
    addPermanentHelperPoint(point) {
        if (!point || typeof point !== 'object') {
            console.warn('⚠️ AppState: Invalid point provided to addPermanentHelperPoint');
            return false;
        }
        
        this.permanentHelperPoints.push(point);
        this.emit('permanentHelperPoints:updated', this.permanentHelperPoints);
        return true;
    }

    /**
     * Clear all helper points
     */
    clearHelperPoints() {
        this.helperPoints = [];
        this.emit('helperPoints:updated', this.helperPoints);
    }

    /**
     * Clear permanent helper points
     */
    clearPermanentHelperPoints() {
        this.permanentHelperPoints = [];
        this.emit('permanentHelperPoints:updated', this.permanentHelperPoints);
    }

    // === DRAWING STATE MANAGEMENT ===

    /**
     * Add point to current polygon
     */
    addPolygonPoint(point) {
        if (!point || typeof point !== 'object') {
            console.warn('⚠️ AppState: Invalid point provided to addPolygonPoint');
            return false;
        }
        
        this.currentPolygonPoints.push(point);
        this.currentPolygonCounter++;
        this.emit('polygonPoint:added', point);
        
        return true;
    }

    /**
     * Clear current polygon points
     */
    clearCurrentPolygon() {
        this.currentPolygonPoints = [];
        this.currentPolygonCounter = 0;
        this.emit('currentPolygon:cleared');
    }

    // === UTILITY METHODS ===

    /**
     * Get statistics about current state
     */
    getStatistics() {
        return {
            elements: this.placedElements.length,
            polygons: this.drawnPolygons.length,
            lines: this.drawnLines.length,
            currentPolygonPoints: this.currentPolygonPoints.length,
            helperPoints: this.helperPoints.length,
            permanentHelperPoints: this.permanentHelperPoints.length,
            historySize: this.actionHistory.length,
            mode: this.currentMode,
            subMode: this.editSubMode
        };
    }

    /**
     * Validate current state
     */
    validateState() {
        const issues = [];
        
        // Check for required properties
        if (!this.canvas) issues.push('Canvas reference missing');
        if (!this.ctx) issues.push('Canvas context missing');
        
        // Check arrays
        if (!Array.isArray(this.placedElements)) issues.push('placedElements is not an array');
        if (!Array.isArray(this.drawnPolygons)) issues.push('drawnPolygons is not an array');
        if (!Array.isArray(this.currentPolygonPoints)) issues.push('currentPolygonPoints is not an array');
        
        // Check viewport transform
        if (!this.viewportTransform || typeof this.viewportTransform !== 'object') {
            issues.push('viewportTransform is invalid');
        }
        
        return {
            isValid: issues.length === 0,
            issues
        };
    }
}

// Singleton instance
AppState.instance = null;

// Export singleton
export default AppState;