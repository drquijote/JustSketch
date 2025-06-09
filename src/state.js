// src/state.js - FIXED VERSION - Reduced excessive event logging
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
  drawnPolygons: [],     // NEW - Polygons/areas (for drawing.js)
  drawnLines: [],        // NEW - Individual lines (for drawing.js)
  
  // NEW: Current drawing state (for undo support)
  currentPolygonPoints: [], // Points being drawn right now
  currentPolygonCounter: 0, // Point counter for current polygon
  
  // History system
  actionHistory: [],
  historyIndex: -1,
  
  // Event system for module communication
  events: new EventTarget(),
  
  // Helper methods for event communication
  emit(eventType, data) {
    this.events.dispatchEvent(new CustomEvent(eventType, { detail: data }));
    // REMOVED: Excessive logging that was spamming console during blinking animations
    // Only log important events, not every single redraw event
    if (!eventType.includes('redraw')) {
      console.log(`AppState emitted: ${eventType}`, data);
    }
  },
  
  on(eventType, callback) {
    this.events.addEventListener(eventType, callback);
    // REMOVED: Logging for every event listener - was causing spam
    // Only log when setting up major event listeners
    if (!eventType.includes('redraw')) {
      console.log(`AppState listener added for: ${eventType}`);
    }
  },
  
  // Helper to get current state snapshot
  getStateSnapshot() {
    return {
      placedElements: JSON.parse(JSON.stringify(this.placedElements)),
      drawnPolygons: JSON.parse(JSON.stringify(this.drawnPolygons)),
      drawnLines: JSON.parse(JSON.stringify(this.drawnLines)),
      currentPolygonPoints: JSON.parse(JSON.stringify(this.currentPolygonPoints)),
      currentPolygonCounter: this.currentPolygonCounter
    };
  },
  
  // Helper to restore state from snapshot
  restoreStateSnapshot(snapshot) {
    this.placedElements = JSON.parse(JSON.stringify(snapshot.placedElements || []));
    this.drawnPolygons = JSON.parse(JSON.stringify(snapshot.drawnPolygons || []));
    this.drawnLines = JSON.parse(JSON.stringify(snapshot.drawnLines || []));
    this.currentPolygonPoints = JSON.parse(JSON.stringify(snapshot.currentPolygonPoints || []));
    this.currentPolygonCounter = snapshot.currentPolygonCounter || 0;
  }
};