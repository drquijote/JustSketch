// src/canvas.js - FIXED VERSION with adaptive canvas sizing for iOS compatibility
import { AppState } from './state.js';
import { HelperPointManager } from './helpers.js';

export class CanvasManager {
  static init(canvasElement) {
    console.log('CanvasManager: Initializing canvas');
    AppState.canvas = canvasElement;
    AppState.ctx = canvasElement.getContext('2d');
    
    // Detect if we're on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Determine maximum safe canvas size based on device
    let maxCanvasSize;
    if (isIOS) {
      // iOS has strict limits - use 4096 as safe maximum
      maxCanvasSize = 4096;
      console.log('iOS detected - limiting canvas to', maxCanvasSize);
    } else if (isMobile) {
      // Other mobile devices - use 6000 as safe limit
      maxCanvasSize = 6000;
      console.log('Mobile device detected - limiting canvas to', maxCanvasSize);
    } else {
      // Desktop - can handle larger canvas
      maxCanvasSize = 10000;
      console.log('Desktop detected - using canvas size', maxCanvasSize);
    }
    
    // For extra safety on iOS, we can be even more conservative
    if (isIOS && window.devicePixelRatio > 2) {
      // Retina iOS devices need even smaller canvases
      maxCanvasSize = 3000;
      console.log('High-DPI iOS device - further limiting canvas to', maxCanvasSize);
    }
    
    // Set canvas dimensions
    AppState.canvas.width = maxCanvasSize;
    AppState.canvas.height = maxCanvasSize;
    
    // Store the canvas size for reference
    AppState.canvasSize = maxCanvasSize;
    
    console.log('CanvasManager: Canvas initialized with size:', AppState.canvas.width, 'x', AppState.canvas.height);

    // Center the viewport
    const viewport = document.getElementById('canvasViewport');
    if (viewport) {
        const viewportWidth = viewport.clientWidth;
        const viewportHeight = viewport.clientHeight;

        AppState.viewportTransform.x = -(AppState.canvas.width / 2) + (viewportWidth / 2);
        AppState.viewportTransform.y = -(AppState.canvas.height / 2) + (viewportHeight / 2);
        
        this.updateViewportTransform();
        console.log('CanvasManager: Initial viewport centered on canvas at:', AppState.viewportTransform);
    }
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
    if (AppState.currentMode === 'drawing') {
        AppState.emit('canvas:redraw:drawing-overlay');
    }
    
    // Restore context state
    ctx.restore();
  }
  
  static saveAction() {
    AppState.historyIndex++;
    AppState.actionHistory = AppState.actionHistory.slice(0, AppState.historyIndex);
    
    const snapshot = AppState.getStateSnapshot();
    
    if (!snapshot.viewportTransform) {
      snapshot.viewportTransform = {
        x: AppState.viewportTransform.x,
        y: AppState.viewportTransform.y,
        scale: AppState.viewportTransform.scale
      };
    }
    
    AppState.actionHistory.push(snapshot);
    
    console.log('CanvasManager: Action saved, history length:', AppState.actionHistory.length);
    AppState.emit('history:saved');
  }
  
  static undo() {
    console.log('--- UNDO: Button Pressed ---');
    if (AppState.historyIndex <= 0) {
        console.log('Undo: No more actions to undo.');
        AppState.restoreStateSnapshot(AppState.actionHistory[0] || AppState.getInitialState());
        AppState.historyIndex = 0;
    } else {
        AppState.historyIndex--;
        const stateToRestore = AppState.actionHistory[AppState.historyIndex];
        if (stateToRestore) {
            AppState.restoreStateSnapshot(stateToRestore);
            console.log('Restored state to index:', AppState.historyIndex);
        } else {
            console.error("Could not find a state to restore.");
        }
    }
    
    CanvasManager.updateViewportTransform();
    HelperPointManager.updateHelperPoints();
    CanvasManager.redraw();
    
    console.log('--- UNDO: Complete ---');
  }
  
  static redo() {
    if (AppState.historyIndex < AppState.actionHistory.length - 1) {
      AppState.historyIndex++;
      const snapshot = AppState.actionHistory[AppState.historyIndex];
      AppState.restoreStateSnapshot(snapshot);

      HelperPointManager.updateHelperPoints();

      if (snapshot.viewportTransform) {
        AppState.viewportTransform.x = snapshot.viewportTransform.x;
        AppState.viewportTransform.y = snapshot.viewportTransform.y;
        AppState.viewportTransform.scale = snapshot.viewportTransform.scale;

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