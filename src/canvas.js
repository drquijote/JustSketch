// src/canvas.js - Shared Canvas Operations
import { AppState } from './state.js';

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
    
    // Emit redraw events in proper order (background to foreground)
    console.log('CanvasManager: Starting redraw sequence');
    
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
    
    console.log('CanvasManager: Redraw sequence completed');
  }
  
  static saveAction() {
    AppState.historyIndex++;
    AppState.actionHistory = AppState.actionHistory.slice(0, AppState.historyIndex);
    AppState.actionHistory.push(AppState.getStateSnapshot());
    
    console.log('CanvasManager: Action saved, history length:', AppState.actionHistory.length);
    AppState.emit('history:saved');
  }
  
  static undo() {
    if (AppState.historyIndex > 0) {
      AppState.historyIndex--;
      const snapshot = AppState.actionHistory[AppState.historyIndex];
      AppState.restoreStateSnapshot(snapshot);
      
      console.log('CanvasManager: Undo performed');
      AppState.emit('history:undo');
      CanvasManager.redraw();
    } else {
      console.log('CanvasManager: No more actions to undo');
    }
  }
  
  static redo() {
    if (AppState.historyIndex < AppState.actionHistory.length - 1) {
      AppState.historyIndex++;
      const snapshot = AppState.actionHistory[AppState.historyIndex];
      AppState.restoreStateSnapshot(snapshot);
      
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