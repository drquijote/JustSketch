// src/canvas.js - FIXED VERSION - Reduced excessive logging during redraws
import { AppState } from './state.js';
import { HelperPointManager } from './helpers.js';

export class CanvasManager {
  static init(canvasElement) {
    console.log('CanvasManager: Initializing canvas');
    AppState.canvas = canvasElement;
    AppState.ctx = canvasElement.getContext('2d');
    
    // Set canvas size
    AppState.canvas.width = window.innerWidth * 2;
    AppState.canvas.height = window.innerHeight * 2;
    
    console.log('CanvasManager: Canvas initialized with size:', AppState.canvas.width, 'x', AppState.canvas.height);
  }
  
  // In canvas.js, replace the redraw function with this version that ensures proper layer order

static redraw() {
    const { ctx, canvas } = AppState;
    if (!ctx || !canvas) {
      console.warn('CanvasManager: Canvas not initialized, skipping redraw');
      return;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save context state
    ctx.save();
    
    // *** LAYER 1: Background elements (grid, etc.) ***
    AppState.emit('canvas:redraw:background');
    
    // *** LAYER 2: Drawn polygons (floor plan areas) ***
    AppState.emit('canvas:redraw:polygons');
    
    // *** LAYER 3: Drawn lines (individual lines) ***
    AppState.emit('canvas:redraw:lines');
    
    // *** LAYER 4: Placed elements (room labels & icons) ***
    AppState.emit('canvas:redraw:elements');
    
    // *** LAYER 5: UI overlays (edit handles, etc.) ***
    AppState.emit('canvas:redraw:ui');
    
    // *** LAYER 6 (TOP): Current drawing elements - ALWAYS ON TOP ***
    // This ensures purple drawing points (pX) are always visible above everything else
    if (AppState.currentMode === 'drawing') {
        // Force the drawing manager to redraw its elements on the top layer
        AppState.emit('canvas:redraw:drawing-overlay');
    }
    
    // Restore context state
    ctx.restore();
}
  
  static saveAction() {
    AppState.historyIndex++;
    AppState.actionHistory = AppState.actionHistory.slice(0, AppState.historyIndex);
    
    // Get the current state snapshot (which should include viewport transform)
    const snapshot = AppState.getStateSnapshot();
    
    // Ensure viewport transform is saved - add it if getStateSnapshot doesn't include it
    if (!snapshot.viewportTransform) {
      snapshot.viewportTransform = {
        x: AppState.viewportTransform.x,
        y: AppState.viewportTransform.y,
        scale: AppState.viewportTransform.scale
      };
    }
    
    AppState.actionHistory.push(snapshot);
    
    // Only log when actions are actually saved, not during every redraw
    console.log('CanvasManager: Action saved, history length:', AppState.actionHistory.length);
    AppState.emit('history:saved');
  }
  
 // Replace your existing undo() function with this one
// Replace the entire undo() function in src/canvas.js with this one:

// Replace the entire undo() function in src/canvas.js with this one.
static undo() {
    console.log('--- UNDO: Button Pressed ---');
    if (AppState.historyIndex <= 0) {
        console.log('Undo: No more actions to undo.');
        // If we are at the beginning, restore the very first state (or a clean state)
        AppState.restoreStateSnapshot(AppState.actionHistory[0] || AppState.getInitialState());
        AppState.historyIndex = 0;
    } else {
        // Otherwise, move to the previous state in the history
        AppState.historyIndex--;
        const stateToRestore = AppState.actionHistory[AppState.historyIndex];
        if (stateToRestore) {
            AppState.restoreStateSnapshot(stateToRestore);
            console.log('Restored state to index:', AppState.historyIndex);
        } else {
            console.error("Could not find a state to restore.");
        }
    }
    
    // --- NEW LOGIC ---
    // After restoring the state, visually update the viewport's position and redraw.
    CanvasManager.updateViewportTransform();
    HelperPointManager.updateHelperPoints();
    CanvasManager.redraw();
    
    console.log('--- UNDO: Complete ---');
}
  
// Replace your existing redo() function with this one
static redo() {
  if (AppState.historyIndex < AppState.actionHistory.length - 1) {
    AppState.historyIndex++;
    const snapshot = AppState.actionHistory[AppState.historyIndex];
    AppState.restoreStateSnapshot(snapshot);

    // After restoring the path, update the helper points
    HelperPointManager.updateHelperPoints();

    // Restore viewport transform if it exists in the snapshot
    if (snapshot.viewportTransform) {
      AppState.viewportTransform.x = snapshot.viewportTransform.x;
      AppState.viewportTransform.y = snapshot.viewportTransform.y;
      AppState.viewportTransform.scale = snapshot.viewportTransform.scale;

      // Update the visual transform
      CanvasManager.updateViewportTransform();

      console.log('CanvasManager: Restored viewport transform:', snapshot.viewportTransform);
    }

    console.log('CanvasManager: Redo performed');
    AppState.emit('history:redo');
    CanvasManager.redraw();
  } else {
    console.log('CanvasManager: No more actions to redo');
  }
}
  
  // Helper method to convert screen coordinates to canvas coordinates
  static screenToCanvas(screenX, screenY) {
    const viewport = document.getElementById('canvasViewport');
    const rect = viewport.getBoundingClientRect();
    
    return {
      x: (screenX - rect.left) - AppState.viewportTransform.x,
      y: (screenY - rect.top) - AppState.viewportTransform.y
    };
  }
  
  // Helper method to update viewport transform
  static updateViewportTransform() {
    const container = document.getElementById('canvasContainer');
    if (container) {
      container.style.transform = `translate(${AppState.viewportTransform.x}px, ${AppState.viewportTransform.y}px)`;
    }
  }
}