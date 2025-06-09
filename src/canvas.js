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
    
    // REMOVED: Excessive logging that was causing console spam during blinking
    // Only log redraw start/complete during debugging, not every single redraw
    
    // 1. Background elements (grid, etc.)
    AppState.emit('canvas:redraw:background');
    
    // 2. Drawn polygons (floor plan areas)
    AppState.emit('canvas:redraw:polygons');
    
    // 3. Drawn lines (individual lines)
    AppState.emit('canvas:redraw:lines');
    
    // 4. Placed elements (room labels & icons)
    AppState.emit('canvas:redraw:elements');
    
    // 5. UI overlays (edit handles, etc.)
    AppState.emit('canvas:redraw:ui');
    
    // Restore context state
    ctx.restore();
    
    // REMOVED: Completion logging that was spamming console
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
static undo() {
  console.log('CanvasManager: Undo button pressed');
  console.log('Current history index:', AppState.historyIndex);
  console.log('History length:', AppState.actionHistory.length);

  if (AppState.historyIndex > 0) {
    AppState.historyIndex--;
    const snapshot = AppState.actionHistory[AppState.historyIndex];

    console.log('CanvasManager: Restoring snapshot:', snapshot);
    console.log('Snapshot current polygon points:', snapshot.currentPolygonPoints?.length || 0);

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

    console.log('CanvasManager: After restore - current polygon points:', AppState.currentPolygonPoints.length);
    console.log('CanvasManager: Undo performed');
    AppState.emit('history:undo');
    CanvasManager.redraw();
  } else {
    console.log('CanvasManager: No more actions to undo');
  }
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