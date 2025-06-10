// src/main.js - CORRECTED AND COMPLETE

import './style.css';

// Import the modular system
import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { DrawingManager } from './drawing.js';
import { HelperPointManager } from './helpers.js';
import { AreaManager } from './areaManager.js';
import { PreviewManager } from './previewManager.js'; // <-- Added import

// Import existing sketch.js functions
import { 
  showpallets, 
  initSketchModule,
  toggleLegend, 
  toggleEditMode,
  activateSketchListeners,
  deactivateSketchListeners
} from './sketch.js';

// Global functions for HTML onclick handlers
window.showpallets = showpallets;
window.toggleLegend = toggleLegend;
window.toggleEditMode = toggleEditMode;

// Mode switching functions
window.switchToPlacementMode = switchToPlacementMode;
window.switchToDrawingMode = switchToDrawingMode;

// --- Main Application Setup ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("App loaded - initializing modular architecture");

    const canvas = document.getElementById('drawingCanvas');
    CanvasManager.init(canvas);

    // Initialize all the managers
    new DrawingManager();
    const areaManager = new AreaManager();
    areaManager.init();
    
    // NEW: Initialize the Preview Manager
    const previewManager = new PreviewManager();
    
    // Initialize the older sketch/icon system
    initSketchModule();

    // Setup all other UI event handlers and pass the manager
    setupUIHandlers(previewManager); // <-- Pass the new manager
    setupKeyboardShortcuts();

    // Initial render and save
    CanvasManager.redraw();
    CanvasManager.saveAction();

    console.log("App initialization complete");
});

/**
 * Sets up all the primary UI event listeners for the application buttons.
 * @param {PreviewManager} previewManager - The instance of the preview manager.
 */
function setupUIHandlers(previewManager) {
    // Palette button handlers
    const paletteButtons = document.querySelectorAll('[data-palette]');
    paletteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const paletteId = e.target.getAttribute('data-palette');
            if ((paletteId === 'roomsPalette' || paletteId === 'iconsPalette') && AppState.currentMode === 'drawing') {
                switchToPlacementMode();
            }
            showpallets(paletteId);
            paletteButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Listen for the custom event to exit drawing mode automatically
    AppState.on('app:exitDrawingMode', switchToPlacementMode);

    // Control handlers
    document.getElementById('editBtn').addEventListener('click', toggleEditMode);
    document.getElementById('legendToggleBtn').addEventListener('click', toggleLegend);
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');
    if (undoBtn) undoBtn.addEventListener('click', (e) => { e.preventDefault(); CanvasManager.undo(); });
    if (redoBtn) redoBtn.addEventListener('click', (e) => { e.preventDefault(); CanvasManager.redo(); });

    // Drawing mode button handler
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (AppState.currentMode === 'drawing') switchToPlacementMode();
            else switchToDrawingMode();
        });
    }

    // --- Export and Import Handlers ---
    const exportBtn = document.querySelector('.export-dropdown > button');
    const exportMenu = document.getElementById('exportMenu');
    const fileInput = document.getElementById('importFile');
    const allFinishButtons = Array.from(document.querySelectorAll('.control-btn.finish-btn'));
    const importBtn = allFinishButtons.find(btn => btn.textContent.trim() === 'Import');

    if (exportBtn && exportMenu) {
        exportBtn.addEventListener('click', () => exportMenu.classList.toggle('hidden'));
        exportMenu.addEventListener('click', (e) => {
            if (e.target.textContent === 'JSON Data') exportSketchToJSON();
            exportMenu.classList.add('hidden');
        });
    }
    if (importBtn) {
        importBtn.addEventListener('click', () => fileInput && fileInput.click());
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) importSketchFromJSON(file);
            e.target.value = null;
        });
    }

    // --- Preview Button Handler ---
    const previewBtn = allFinishButtons.find(btn => btn.textContent.trim() === 'Preview');
    if (previewBtn && previewManager) {
        previewBtn.addEventListener('click', () => {
            previewManager.showPreview();
        });
    }
}

// --- Mode Switching Logic ---
function switchToPlacementMode() {
    console.log('Switching to placement mode');
    activateSketchListeners();
    AppState.currentMode = 'placement';
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
    AppState.emit('mode:changed', { mode: 'placement' });
}

function switchToDrawingMode() {
    console.log('Switching to drawing mode');
    deactivateSketchListeners();
    AppState.currentMode = 'drawing';
    const startBtn = document.getElementById('startBtn');
    const modeIndicator = document.getElementById('modeIndicator');
    if (startBtn) {
        startBtn.textContent = 'Stop';
        startBtn.classList.add('active');
    }
    if (modeIndicator) {
        modeIndicator.textContent = 'DRAWING';
        modeIndicator.classList.add('drawing-mode');
    }
    document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('[data-palette]').forEach(btn => btn.classList.remove('active'));
    AppState.emit('mode:changed', { mode: 'drawing' });
}

// --- Utility Functions ---
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        const isCtrlOrCmd = event.ctrlKey || event.metaKey;
        const targetTagName = event.target.tagName.toLowerCase();
        if (targetTagName === 'input' || targetTagName === 'textarea') return;
        if (isCtrlOrCmd && event.key.toLowerCase() === 'z' && !event.shiftKey) {
            event.preventDefault();
            CanvasManager.undo();
        }
        if (isCtrlOrCmd && ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y')) {
            event.preventDefault();
            CanvasManager.redo();
        }
    });
}

function exportSketchToJSON() {
    console.log('Exporting sketch to JSON...');
    const sketchData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        data: AppState.getStateSnapshot()
    };
    const jsonString = JSON.stringify(sketchData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sketch-data-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    console.log('Sketch exported successfully.');
}

function importSketchFromJSON(file) {
    console.log('Starting import from JSON file:', file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedData = JSON.parse(event.target.result);
            if (!importedData.data || !importedData.data.drawnPolygons) {
                throw new Error('Invalid or corrupted sketch file.');
            }
            console.log('Successfully parsed sketch file. Loading data...');
            AppState.restoreStateSnapshot(importedData.data);
            HelperPointManager.updateHelperPoints();
            CanvasManager.updateViewportTransform();
            CanvasManager.redraw();
            CanvasManager.saveAction();
            alert('Sketch imported successfully!');
        } catch (error) {
            console.error('Error during import:', error);
            alert('Failed to import sketch. The file may be invalid or corrupted.');
        }
    };
    reader.onerror = () => alert('An error occurred while trying to read the file.');
    reader.readAsText(file);
}