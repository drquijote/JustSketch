// src/main.js - FINAL CORRECTED VERSION

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { DrawingManager } from './drawing.js';
import { HelperPointManager } from './helpers.js';
import { AreaManager } from './areaManager.js';
import { SplitterManager } from './splitter.js';
import { PreviewManager } from './previewManager.js';
import { SaveManager } from './saveManager.js'; 

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

    const splitterManager = new SplitterManager();
    splitterManager.init();

    const saveManager = new SaveManager();
    saveManager.init();
    
    console.log("App loaded - initializing modular architecture");

    const canvas = document.getElementById('drawingCanvas');
    CanvasManager.init(canvas);

    // Initialize all the managers
    new DrawingManager();
    const areaManager = new AreaManager();
    areaManager.init();
    
    const previewManager = new PreviewManager();
    
    initSketchModule();

    // Setup all UI event handlers
    initializeAppControls(previewManager, saveManager);
    setupKeyboardShortcuts();

    // Initial render and save
    CanvasManager.redraw();
    CanvasManager.saveAction();

    // Check if the URL is requesting a specific sketch to be loaded
    saveManager.loadSketchFromURL();

    console.log("App initialization complete");
});


/**
 * Sets up all the primary UI event listeners for the application buttons.
 * This should be the ONLY version of this function in the file.
 * @param {PreviewManager} previewManager - The instance of the preview manager.
 * @param {SaveManager} saveManager - The instance of the save manager.
 */
function initializeAppControls(previewManager, saveManager) {
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

    // Listen for custom app events
    AppState.on('app:exitDrawingMode', switchToPlacementMode);
    AppState.on('app:switchToDrawingMode', switchToDrawingMode);

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
    const saveAsBtn = document.getElementById('saveAsBtn');

    if (exportBtn && exportMenu) {
        exportBtn.addEventListener('click', () => exportMenu.classList.toggle('hidden'));
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

    // --- Preview Button Handler ---
    const previewBtn = allFinishButtons.find(btn => btn.textContent.trim() === 'Preview');
    if (previewBtn && previewManager) {
        previewBtn.addEventListener('click', () => {
            previewManager.showPreview();
        });
    }
    
    // --- Save Button Handler ---
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn && saveManager) {
        saveBtn.addEventListener('click', () => {
            saveManager.promptOrSave();
        });
    }
}

// --- Mode Switching Logic ---
function switchToPlacementMode() {
    console.log('Switching to placement mode from:', AppState.currentMode);
    activateSketchListeners();
    AppState.currentMode = 'placement';
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.textContent = 'Start';
        startBtn.classList.remove('active');
    }
    document.getElementById('editBtn').classList.remove('active');
    document.getElementById('modeIndicator').textContent = 'READY';
    document.getElementById('modeIndicator').classList.remove('drawing-mode', 'edit-mode');
    AppState.emit('mode:changed', { mode: 'placement' });
    AppState.emit('mode:editToggled', { isEditMode: false });
    CanvasManager.redraw();
}

function switchToDrawingMode() {
    console.log('Switching to drawing mode from:', AppState.currentMode);
    AppState.currentMode = 'drawing';
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.textContent = 'Stop';
        startBtn.classList.add('active');
    }
    document.getElementById('editBtn').classList.remove('active');
    document.getElementById('modeIndicator').textContent = 'DRAWING';
    document.getElementById('modeIndicator').classList.remove('edit-mode');
    document.getElementById('modeIndicator').classList.add('drawing-mode');
    document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('[data-palette]').forEach(btn => btn.classList.remove('active'));
    const numbersBtn = document.getElementById('numbersBtn');
    const drawPalette = document.getElementById('drawPalette');
    if (numbersBtn && drawPalette) {
        numbersBtn.classList.add('active');
        drawPalette.classList.remove('hidden');
    }
    AppState.emit('mode:changed', { mode: 'drawing' });
    AppState.emit('mode:editToggled', { isEditMode: false });
    CanvasManager.redraw();
}

function switchToEditMode() {
    console.log('Switching to edit mode from:', AppState.currentMode);
    activateSketchListeners();
    AppState.currentMode = 'edit';
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.textContent = 'Start';
        startBtn.classList.remove('active');
    }
    document.getElementById('editBtn').classList.add('active');
    document.getElementById('modeIndicator').textContent = 'EDITING';
    document.getElementById('modeIndicator').classList.remove('drawing-mode');
    document.getElementById('modeIndicator').classList.add('edit-mode');
    const drawPalette = document.getElementById('drawPalette');
    if (drawPalette && !drawPalette.classList.contains('hidden')) {
        drawPalette.classList.add('hidden');
        document.getElementById('numbersBtn')?.classList.remove('active');
    }
    AppState.emit('mode:changed', { mode: 'edit' });
    AppState.emit('mode:editToggled', { isEditMode: true });
    setTimeout(() => console.log('💡 EDIT MODE: Click on areas to drag them, or click on edges to delete them!'), 100);
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

window.switchToEditMode = switchToEditMode;