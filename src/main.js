
import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { DrawingManager } from './drawing.js';
import { HelperPointManager } from './helpers.js';
import { AreaManager } from './areaManager.js';
import { SplitterManager } from './splitter.js';
import { PreviewManager } from './previewManager.js';
import { SaveManager } from './saveManager.js';
import { PhotoManager } from './photos.js'; 

// Import existing sketch.js functions
import { 
  showpallets, 
  initSketchModule,
  toggleLegend, 
  activateSketchListeners,
  deactivateSketchListeners
} from './sketch.js';

// Global functions for HTML onclick handlers
window.showpallets = showpallets;
window.toggleLegend = toggleLegend;

// Mode switching functions
window.switchToPlacementMode = switchToPlacementMode;
window.switchToDrawingMode = switchToDrawingMode;

// --- Main Application Setup ---
document.addEventListener('DOMContentLoaded', () => {
    const splitterManager = new SplitterManager();
    splitterManager.init();

    const saveManager = new SaveManager();
    saveManager.init();
    const photoManager = new PhotoManager();
    photoManager.init();  
    
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

function initializeAppControls(previewManager, saveManager) {
    // Palette button handlers
    const paletteButtons = document.querySelectorAll('[data-palette]');
    paletteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const paletteId = e.target.getAttribute('data-palette');
            
            if (paletteId === 'photosPalette') {
                switchToPhotosMode();
            } else {
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

    // MODIFIED: Edit button now cycles through three states
    document.getElementById('editBtn').addEventListener('click', cycleEditMode);
    
    document.getElementById('legendToggleBtn').addEventListener('click', toggleLegend);
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');
    if (undoBtn) undoBtn.addEventListener('click', (e) => { e.preventDefault(); CanvasManager.undo(); });
    if (redoBtn) redoBtn.addEventListener('click', (e) => { e.preventDefault(); CanvasManager.redo(); });

    // Drawing mode button handler
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

    // --- Export and Import Handlers ---
    const exportBtn = document.querySelector('.export-dropdown > button');
    const exportMenu = document.getElementById('exportMenu');
    const fileInput = document.getElementById('importFile');
    const allFinishButtons = Array.from(document.querySelectorAll('.control-btn.finish-btn'));
    const importBtn = allFinishButtons.find(btn => btn.textContent.trim() === 'Import');

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

// --- NEW: Three-State Edit Mode Cycling Logic ---

function cycleEditMode() {
    // Sequence: READY -> EDIT LABELS -> EDIT AREAS -> READY
    if (AppState.currentMode !== 'edit') {
        switchToEditLabelsMode();
    } else {
        if (AppState.editSubMode === 'labels') {
            switchToEditAreasMode();
        } else { // From 'areas' or any other weird state, go back to ready.
            switchToPlacementMode();
        }
    }
}

function switchToEditLabelsMode() {
    console.log('Switching to Edit Labels mode');
    activateSketchListeners(); 
    AppState.currentMode = 'edit';
    AppState.editSubMode = 'labels'; 

    resetAllModeButtons();
    const editBtn = document.getElementById('editBtn');
    editBtn.classList.add('active');
    editBtn.textContent = 'Edit Areas';

    const modeIndicator = document.getElementById('modeIndicator');
    modeIndicator.textContent = 'EDIT LABELS';
    modeIndicator.className = 'mode-indicator edit-mode';

    AppState.emit('mode:changed', { mode: 'edit', subMode: 'labels' });
    AppState.emit('mode:editToggled', { isEditMode: true });
    CanvasManager.redraw();
}

function switchToEditAreasMode() {
    console.log('Switching to Edit Areas mode');
    activateSketchListeners();
    AppState.currentMode = 'edit';
    AppState.editSubMode = 'areas';

    resetAllModeButtons();
    const editBtn = document.getElementById('editBtn');
    editBtn.classList.add('active');
    editBtn.textContent = 'Done';

    const modeIndicator = document.getElementById('modeIndicator');
    modeIndicator.textContent = 'EDIT AREAS';
    modeIndicator.className = 'mode-indicator edit-mode';

    AppState.emit('mode:changed', { mode: 'edit', subMode: 'areas' });
    AppState.emit('mode:editToggled', { isEditMode: true });
    setTimeout(() => console.log('💡 EDIT AREAS: Click on areas to drag them, or click on edges to delete them!'), 100);
    CanvasManager.redraw();
}


// --- Standard Mode Switching Functions (Modified) ---

function switchToPhotosMode() {
    console.log('Switching to photos mode from:', AppState.currentMode);
    deactivateSketchListeners(); 
    AppState.currentMode = 'photos';
    AppState.editSubMode = null;
    resetAllModeButtons();
    
    const modeIndicator = document.getElementById('modeIndicator');
    modeIndicator.textContent = 'PHOTOS';
    modeIndicator.className = 'mode-indicator photos-mode'; 

    AppState.emit('mode:changed', { mode: 'photos' });
    AppState.emit('mode:editToggled', { isEditMode: false });
    CanvasManager.redraw();
}

function switchToPlacementMode() {
    console.log('Switching to placement mode (READY) from:', AppState.currentMode);
    activateSketchListeners();
    AppState.currentMode = 'placement';
    AppState.editSubMode = null; // Reset sub-mode
    resetAllModeButtons();
    
    const modeIndicator = document.getElementById('modeIndicator');
    modeIndicator.textContent = 'READY';
    modeIndicator.className = 'mode-indicator';
    
    AppState.emit('mode:changed', { mode: 'placement' });
    AppState.emit('mode:editToggled', { isEditMode: false });
    CanvasManager.redraw();
}

function switchToDrawingMode() {
    console.log('Switching to drawing mode from:', AppState.currentMode);
    AppState.currentMode = 'drawing';
    AppState.editSubMode = null;
    
    resetAllModeButtons();
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.textContent = 'Stop';
        startBtn.classList.add('active');
    }
    
    const modeIndicator = document.getElementById('modeIndicator');
    modeIndicator.textContent = 'DRAWING';
    modeIndicator.className = 'mode-indicator drawing-mode';
    
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

function resetAllModeButtons() {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.textContent = 'Start';
        startBtn.classList.remove('active');
    }
    
    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
        editBtn.textContent = 'Edit'; // Reset text
        editBtn.classList.remove('active');
    }
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
