// src/state.js - Centralized Application State
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
  
  // History system
  actionHistory: [],
  historyIndex: -1,
  
  // Event system for module communication
  events: new EventTarget(),
  
  // Helper methods for event communication
  emit(eventType, data) {
    this.events.dispatchEvent(new CustomEvent(eventType, { detail: data }));
    console.log(`AppState emitted: ${eventType}`, data);
  },
  
  on(eventType, callback) {
    this.events.addEventListener(eventType, callback);
    console.log(`AppState listener added for: ${eventType}`);
  },
  
  // Helper to get current state snapshot
  getStateSnapshot() {
    return {
      placedElements: JSON.parse(JSON.stringify(this.placedElements)),
      drawnPolygons: JSON.parse(JSON.stringify(this.drawnPolygons)),
      drawnLines: JSON.parse(JSON.stringify(this.drawnLines))
    };
  },
  
  // Helper to restore state from snapshot
  restoreStateSnapshot(snapshot) {
    this.placedElements = JSON.parse(JSON.stringify(snapshot.placedElements || []));
    this.drawnPolygons = JSON.parse(JSON.stringify(snapshot.drawnPolygons || []));
    this.drawnLines = JSON.parse(JSON.stringify(snapshot.drawnLines || []));
  }
};