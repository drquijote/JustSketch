// src/state.js - ENHANCED to include permanent helper points in state management

export const AppState = {
  // Canvas & Viewport (will be populated by canvas.js)
  canvas: null,
  ctx: null,
  viewportTransform: { x: 0, y: 0, scale: 1 },
  
  // Current interaction mode
  currentMode: 'placement', // 'placement', 'drawing', 'edit'
  
  // Selection and interaction state
  selectedElement: null,
  isDragging: false,
  isPanning: false,
  
  // Data Collections
  placedElements: [],    // Room labels & icons (from sketch.js)
  drawnPolygons: [],     // Polygons/areas (for drawing.js)
  drawnLines: [],        // Individual lines (for drawing.js)
  
  // Current drawing state (for undo support)
  currentPolygonPoints: [], // Points being drawn right now
  currentPolygonCounter: 0, // Point counter for current polygon
  
  // *** NEW: Helper point collections ***
  helperPoints: [],          // Temporary helper points (from current drawing)
  permanentHelperPoints: [], // Permanent helper points (from completed paths)
  
  // History system
  actionHistory: [],
  historyIndex: -1,
  
  // Event system for module communication
  events: new EventTarget(),
  
  // Helper methods for event communication
  emit(eventType, data) {
    this.events.dispatchEvent(new CustomEvent(eventType, { detail: data }));
    // Only log important events, not every single redraw event
    if (!eventType.includes('redraw')) {
      console.log(`AppState emitted: ${eventType}`, data);
    }
  },
  
  on(eventType, callback) {
    this.events.addEventListener(eventType, callback);
    // Only log when setting up major event listeners
    if (!eventType.includes('redraw')) {
      console.log(`AppState listener added for: ${eventType}`);
    }
  },
  
  // *** ENHANCED: Helper to get current state snapshot including permanent helpers ***
getStateSnapshot() {
    return {
        placedElements: JSON.parse(JSON.stringify(this.placedElements)),
        drawnPolygons: JSON.parse(JSON.stringify(this.drawnPolygons)),
        drawnLines: JSON.parse(JSON.stringify(this.drawnLines)),
        currentPolygonPoints: JSON.parse(JSON.stringify(this.currentPolygonPoints)),
        currentPolygonCounter: this.currentPolygonCounter,
        permanentHelperPoints: JSON.parse(JSON.stringify(this.permanentHelperPoints || [])),
        // NEW: Include viewport transform in the snapshot
        viewportTransform: JSON.parse(JSON.stringify(this.viewportTransform))
    };
},
  
  // Helper to get initial state
  getInitialState() {
    return {
      placedElements: [],
      drawnPolygons: [],
      drawnLines: [],
      currentPolygonPoints: [],
      currentPolygonCounter: 0,
      // *** NEW: Include permanent helper points in initial state ***
      permanentHelperPoints: []
    };
  },
  
  // *** ENHANCED: Helper to restore state from snapshot including permanent helpers ***
   restoreStateSnapshot(snapshot) {
    this.placedElements = JSON.parse(JSON.stringify(snapshot.placedElements || []));
    this.drawnPolygons = JSON.parse(JSON.stringify(snapshot.drawnPolygons || []));
    this.drawnLines = JSON.parse(JSON.stringify(snapshot.drawnLines || []));
    this.currentPolygonPoints = JSON.parse(JSON.stringify(snapshot.currentPolygonPoints || []));
    this.currentPolygonCounter = snapshot.currentPolygonCounter || 0;
    this.permanentHelperPoints = JSON.parse(JSON.stringify(snapshot.permanentHelperPoints || []));
    
    // NEW: Restore the viewport transform if it exists in the snapshot
    if (snapshot.viewportTransform) {
        this.viewportTransform = JSON.parse(JSON.stringify(snapshot.viewportTransform));
    }

    console.log('🔄 STATE DEBUG: Restored state snapshot.');
}
};