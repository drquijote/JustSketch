// src/main.js - Updated for modular architecture with shorter button text
import './style.css';

// Import the new modular system
import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { DrawingManager } from './drawing.js';
import { HelperPointManager } from './helpers.js';

// Import existing sketch.js functions
import { 
  showpallets, 
  showangleinput, 
  initSketchModule,  // We'll create this wrapper
  toggleLegend, 
  toggleEditMode 
} from './sketch.js';

// Initialize drawing manager
let drawingManager = null;

// Global functions for HTML onclick handlers
window.showpallets = showpallets;
window.showangleinput = showangleinput;
window.undo = () => {
  console.log('*** UNDO BUTTON CLICKED - window.undo() called ***');
  CanvasManager.undo();
};
window.redo = () => {
  console.log('*** REDO BUTTON CLICKED - window.redo() called ***');
  CanvasManager.redo();
};
window.toggleLegend = toggleLegend;
window.toggleEditMode = toggleEditMode;

// NEW: Mode switching functions
window.switchToPlacementMode = switchToPlacementMode;
window.switchToDrawingMode = switchToDrawingMode;

// In src/main.js, update your DOMContentLoaded listener like this:
document.addEventListener('DOMContentLoaded', () => {
  console.log("App loaded - initializing modular architecture");
  
  // Initialize the canvas system
  const canvas = document.getElementById('drawingCanvas');
  CanvasManager.init(canvas);
  
  // Initialize drawing manager
  drawingManager = new DrawingManager();
  
  // Initialize the sketch module (existing room/icon functionality)
  initSketchModule();
  
  // Setup UI event handlers
  setupUIHandlers();
  
  // Add this line to activate the new keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Initial render and save
  CanvasManager.redraw();
  CanvasManager.saveAction();
  
  console.log("App initialization complete");
});

function setupUIHandlers() {
  // UPDATED: Palette button handlers that exit drawing mode
  const paletteButtons = document.querySelectorAll('[data-palette]');
  paletteButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const paletteId = e.target.getAttribute('data-palette');
      
      // NEW: Exit drawing mode when switching to room or icon palettes
      if ((paletteId === 'roomsPalette' || paletteId === 'iconsPalette') && AppState.currentMode === 'drawing') {
        console.log('Switching to placement mode due to palette selection:', paletteId);
        switchToPlacementMode();
      }
      
      showpallets(paletteId);
      paletteButtons.forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
    });
  });
  
  // Existing control handlers
  document.getElementById('editBtn').addEventListener('click', toggleEditMode);
  document.getElementById('legendToggleBtn').addEventListener('click', toggleLegend);
  
  // NEW: Explicit undo/redo button handlers (in addition to window functions)
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  
  if (undoBtn) {
    console.log('Setting up undo button listener');
    undoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('*** UNDO BUTTON CLICKED via addEventListener ***');
      CanvasManager.undo();
    });
  } else {
    console.warn('Undo button not found!');
  }
  
  if (redoBtn) {
    console.log('Setting up redo button listener');
    redoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('*** REDO BUTTON CLICKED via addEventListener ***');
      CanvasManager.redo();
    });
  } else {
    console.warn('Redo button not found!');
  }
  
  // NEW: Drawing mode button handler
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (AppState.currentMode === 'drawing') {
        switchToPlacementMode();
      } else {
        switchToDrawingMode();
      }
    });
  }
}

// NEW: Mode switching functions
function switchToPlacementMode() {
  console.log('Switching to placement mode');
  AppState.currentMode = 'placement';
  
  // Update UI
  const startBtn = document.getElementById('startBtn');
  const modeIndicator = document.getElementById('modeIndicator');
  
  if (startBtn) {
    startBtn.textContent = 'Start';
    startBtn.classList.remove('active');
  }
  
  if (modeIndicator) {
    modeIndicator.textContent = 'READY';
    modeIndicator.classList.remove('drawing-mode');
  }
  
  // Emit mode change event
  AppState.emit('mode:changed', { mode: 'placement' });
}

// Add this new function to src/main.js
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    // Use `ctrlKey` for Windows/Linux and `metaKey` for macOS
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    // Do nothing if the user is typing in an input field
    const targetTagName = event.target.tagName.toLowerCase();
    if (targetTagName === 'input' || targetTagName === 'textarea') {
      return;
    }

    // Check for Undo: Ctrl+Z (but not Ctrl+Shift+Z)
    if (isCtrlOrCmd && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault(); // Prevent browser's default undo action
      console.log('Shortcut: Undo triggered');
      CanvasManager.undo();
    }

    // Check for Redo: Ctrl+Shift+Z (or Ctrl+Y)
    if (isCtrlOrCmd && ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y')) {
      event.preventDefault(); // Prevent browser's default redo action
      console.log('Shortcut: Redo triggered');
      CanvasManager.redo();
    }
  });
  console.log("Keyboard shortcuts for Undo/Redo have been set up.");
}

function switchToDrawingMode() {
  console.log('Switching to drawing mode');
  AppState.currentMode = 'drawing';
  
  // Update UI
  const startBtn = document.getElementById('startBtn');
  const modeIndicator = document.getElementById('modeIndicator');
  
  if (startBtn) {
    // CHANGED: Shorter text for mobile compatibility
    startBtn.textContent = 'Stop';
    startBtn.classList.add('active');
  }
  
  if (modeIndicator) {
    modeIndicator.textContent = 'DRAWING';
    modeIndicator.classList.add('drawing-mode');
  }
  
  // NEW: Hide all palettes when entering drawing mode for cleaner interface
  document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
  
  // Reset palette button states
  const paletteButtons = document.querySelectorAll('[data-palette]');
  paletteButtons.forEach(btn => btn.classList.remove('active'));
  
  // Emit mode change event
  AppState.emit('mode:changed', { mode: 'drawing' });
}