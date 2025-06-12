// src/main.js - Complete and Corrected

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { DrawingManager } from './drawing.js';
import { AreaManager } from './areaManager.js';
import { SaveManager } from './saveManager.js'; 
import { PhotoManager } from './photo.js';
import { PreviewManager } from './previewManager.js';
import { SplitterManager } from './splitter.js';
import { HelperPointManager } from './helpers.js';

// Import functions from sketch.js
import { 
  showpallets, 
  initSketchModule,
  toggleLegend, 
  toggleEditMode,
  handleCanvasClick as sketchHandleCanvasClick
} from './sketch.js';

// --- Globals for HTML onclicks ---
window.toggleLegend = toggleLegend;

// --- Managers ---
let photoManager;
let drawingManager;
let saveManager;
let previewManager;

// --- Main Application Setup ---
document.addEventListener('DOMContentLoaded', () => {
    
    console.log("App loaded - initializing modular architecture");

    const canvas = document.getElementById('drawingCanvas');
    CanvasManager.init(canvas);

    // --- Initialize Managers ---
    saveManager = new SaveManager();
    saveManager.init();
    
    drawingManager = new DrawingManager();
    new AreaManager().init();
    
    photoManager = new PhotoManager();
    photoManager.init();

    previewManager = new PreviewManager();
    new SplitterManager().init();
    
    initSketchModule(); 

    // --- Initialize UI Controls and Event Routing ---
    initializeAppControls();
    setupPrimaryCanvasListener();
    setupKeyboardShortcuts();

    // --- Initial State ---
    CanvasManager.redraw();
    CanvasManager.saveAction();
    saveManager.loadSketchFromURL();

    console.log("App initialization complete");
});

/**
 * Central event router for all canvas clicks.
 */
function setupPrimaryCanvasListener() {
    const viewport = document.getElementById('canvasViewport');
    if (viewport) {
        viewport.addEventListener('click', (e) => {
            console.log(`--- Canvas Click Routed | Mode: ${AppState.currentMode} ---`);
            
            switch (AppState.currentMode) {
                case 'photo':
                    photoManager.handleCanvasClick(e);
                    break;
                case 'drawing':
                    break; // Drawing manager handles its own events
                case 'edit':
                case 'placement':
                    sketchHandleCanvasClick(e);
                    break;
            }
        });
    }
}

/**
 * Sets up all the primary UI event listeners for the application buttons.
 */
function initializeAppControls() {
    // Palette button handlers
    const paletteButtons = document.querySelectorAll('[data-palette]');
    paletteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const paletteId = e.target.getAttribute('data-palette');
            
            if (paletteId === 'photoPalette') {
                switchToPhotoMode();
            } else if (paletteId === 'drawPalette') {
                switchToDrawingMode();
            } else { // roomsPalette, iconsPalette
                switchToPlacementMode();
            }

            showpallets(paletteId);
            paletteButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Main action button handlers
    document.getElementById('editBtn').addEventListener('click', switchToEditMode);
    document.getElementById('startBtn').addEventListener('click', () => {
        if (AppState.currentMode === 'drawing') {
            const roomsBtn = document.getElementById('roomsBtn');
            if(roomsBtn) roomsBtn.click();
        } else {
            const numbersBtn = document.getElementById('numbersBtn');
            if(numbersBtn) numbersBtn.click();
        }
    });

    // Undo/Redo handlers
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');
    if (undoBtn) undoBtn.addEventListener('click', (e) => { e.preventDefault(); CanvasManager.undo(); });
    if (redoBtn) redoBtn.addEventListener('click', (e) => { e.preventDefault(); CanvasManager.redo(); });

    // Save/Export/Import handlers
    const exportBtn = document.querySelector('.export-dropdown > button');
    const exportMenu = document.getElementById('exportMenu');
    const fileInput = document.getElementById('importFile');
    const allFinishButtons = Array.from(document.querySelectorAll('.control-btn.finish-btn'));
    const importBtn = allFinishButtons.find(btn => btn.textContent.trim() === 'Import');

    if (exportBtn && exportMenu) {
        exportBtn.addEventListener('click', () => exportMenu.classList.toggle('hidden'));
        document.addEventListener('click', (e) => {
            if (!exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
                exportMenu.classList.add('hidden');
            }
        });

        exportMenu.addEventListener('click', (e) => {
            if (e.target.id === 'saveAsBtn') {
                saveManager.promptForNewName();
            } else if (e.target.textContent === 'JSON Data') {
                exportSketchToJSON();
            }
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

    const previewBtn = allFinishButtons.find(btn => btn.textContent.trim() === 'Preview');
    if (previewBtn && previewManager) {
        previewBtn.addEventListener('click', () => {
            previewManager.showPreview();
        });
    }
    
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn && saveManager) {
        saveBtn.addEventListener('click', () => {
            saveManager.promptOrSave();
        });
    }
}

// --- Mode Switching Logic ---

function switchToPlacementMode() {
    if (AppState.currentMode === 'placement') return;
    AppState.currentMode = 'placement';
    document.getElementById('modeIndicator').textContent = 'READY';
    document.getElementById('modeIndicator').className = 'mode-indicator';
    document.getElementById('editBtn').classList.remove('active');
    document.getElementById('startBtn').classList.remove('active');
    document.getElementById('startBtn').textContent = 'Start';
    CanvasManager.redraw();
}

function switchToDrawingMode() {
    if (AppState.currentMode === 'drawing') return;
    AppState.currentMode = 'drawing';
    document.getElementById('modeIndicator').textContent = 'DRAWING';
    document.getElementById('modeIndicator').className = 'mode-indicator drawing-mode';
    document.getElementById('editBtn').classList.remove('active');
    document.getElementById('startBtn').classList.add('active');
    document.getElementById('startBtn').textContent = 'Stop';
    CanvasManager.redraw();
}

function switchToEditMode() {
    AppState.currentMode = 'edit';
    toggleEditMode();
    document.getElementById('modeIndicator').textContent = 'EDITING';
    document.getElementById('modeIndicator').className = 'mode-indicator edit-mode';
    document.getElementById('editBtn').classList.add('active');
    document.getElementById('startBtn').classList.remove('active');
    CanvasManager.redraw();
}

function switchToPhotoMode() {
    if (AppState.currentMode === 'photo') return;
    AppState.currentMode = 'photo';
    document.getElementById('modeIndicator').textContent = 'PHOTO';
    document.getElementById('modeIndicator').className = 'mode-indicator photo-mode';
    document.getElementById('editBtn').classList.remove('active');
    document.getElementById('startBtn').classList.remove('active');
    CanvasManager.redraw();
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
    const sketchData = {
        version: '1.1',
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
}

function importSketchFromJSON(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedData = JSON.parse(event.target.result);
            if (!importedData.data || !importedData.data.drawnPolygons) {
                throw new Error('Invalid or corrupted sketch file.');
            }
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
