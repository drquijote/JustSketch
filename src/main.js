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

/**
 * Draws a grid pattern across the entire canvas.
 * This ensures the visual background matches the canvas's full dimensions.
 */
function drawGrid() {
    const { ctx, canvas } = AppState;
    if (!ctx || !canvas) return;

    const gridSize = 40; // The spacing of the grid lines in pixels

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#dcdcdc'; // A light gray for the grid lines
    ctx.lineWidth = 1;

    // Draw vertical lines across the entire canvas width
    for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }

    // Draw horizontal lines across the entire canvas height
    for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }

    ctx.stroke();
    ctx.restore();
}

// Global functions for HTML onclick handlers
window.showpallets = showpallets;
window.toggleLegend = toggleLegend;

// Mode switching functions
window.switchToPlacementMode = switchToPlacementMode;
window.switchToDrawingMode = switchToDrawingMode;

// Create global saveManager instance for import/export
let globalSaveManager;

// --- Main Application Setup ---
document.addEventListener('DOMContentLoaded', () => {
    const splitterManager = new SplitterManager();
    splitterManager.init();

    globalSaveManager = new SaveManager();
    globalSaveManager.init();
    const photoManager = new PhotoManager();
    photoManager.init();  
    window.photoManager = photoManager; // ADD THIS LINE
    
    console.log("App loaded - initializing modular architecture");

    const canvas = document.getElementById('drawingCanvas');
    CanvasManager.init(canvas);
    
    // Connects the new grid function to the drawing process.
    AppState.on('canvas:redraw:background', drawGrid);

    // Initialize all the managers
    const drawingManager = new DrawingManager();
    window.drawingManager = drawingManager; // Make it globally accessible if needed

    const areaManager = new AreaManager();
    areaManager.init();
    
    const previewManager = new PreviewManager();
    
    initSketchModule();

    // Setup all UI event handlers
    initializeAppControls(previewManager, globalSaveManager);
    setupKeyboardShortcuts();

    // Initial render and save
    CanvasManager.redraw();
    CanvasManager.saveAction();

    // Check if the URL is requesting a specific sketch to be loaded
    globalSaveManager.loadSketchFromURL();


    checkAndPromptNewSketch();
    console.log("App initialization complete");
});


function checkAndPromptNewSketch() {
    // Check if we're loading without a sketch ID (new sketch)
    const urlParams = new URLSearchParams(window.location.search);
    const isLoadingSketch = urlParams.has('loadSketch');
    
    // If no sketch is being loaded and no current sketch exists, it's a new sketch
    if (!isLoadingSketch && !AppState.currentSketchId) {
        // Give a small delay to ensure everything is initialized
        setTimeout(() => {
            console.log('New sketch detected - showing save modal');
            
            // Clear the input field for a fresh start
            const nameInput = document.getElementById('sketchNameInput');
            if (nameInput) {
                nameInput.value = '';
                nameInput.placeholder = 'e.g., 123 Main Street';
            }
            
            // Clear any previous checkbox selections
            const exteriorCheckbox = document.getElementById('exteriorOnlyCheckbox');
            const fullInspectionCheckbox = document.getElementById('fullInspectionCheckbox');
            const fhaCheckbox = document.getElementById('fhaCheckbox');
            
            if (exteriorCheckbox) exteriorCheckbox.checked = false;
            if (fullInspectionCheckbox) fullInspectionCheckbox.checked = false;
            if (fhaCheckbox) fhaCheckbox.checked = false;
            
            // Show the save modal
            const saveModal = document.getElementById('saveModal');
            if (saveModal) {
                saveModal.classList.remove('hidden');
                
                // Focus on the name input
                setTimeout(() => {
                    if (nameInput) {
                        nameInput.focus();
                    }
                }, 100);
            }
        }, 500); // Half second delay to ensure smooth loading
    }
}
function initializeAppControls(previewManager, saveManager) {
    // Palette button handlers
    const paletteButtons = document.querySelectorAll('[data-palette]');
    paletteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const paletteId = e.target.getAttribute('data-palette');
            
            if (paletteId === 'photosPalette') {
                // Toggle photo mode
                if (AppState.currentMode === 'photos') {
                    switchToPlacementMode();
                } else {
                    switchToPhotosMode();
                }
            } else {
                // Any other palette button exits photo mode and goes to placement mode
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

    // Edit button now cycles through three states and exits photo mode
    document.getElementById('editBtn').addEventListener('click', () => {
        // Exit photo mode first if we're in it
        if (AppState.currentMode === 'photos') {
            switchToPlacementMode();
        }
        cycleEditMode();
    });
    
    document.getElementById('legendToggleBtn').addEventListener('click', toggleLegend);
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');
    if (undoBtn) undoBtn.addEventListener('click', (e) => { e.preventDefault(); CanvasManager.undo(); });
    if (redoBtn) redoBtn.addEventListener('click', (e) => { e.preventDefault(); CanvasManager.redo(); });

    // Drawing mode button handler - exits photo mode
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (AppState.currentMode === 'drawing') {
                switchToPlacementMode();
            } else {
                // Exit photo mode first if we're in it
                if (AppState.currentMode === 'photos') {
                    switchToPlacementMode();
                }
                switchToDrawingMode();
            }
        });
    }


function exportSketchToJSON() {
    // Use the global SaveManager instance
    globalSaveManager.exportSketchToJSON();
}

function importSketchFromJSON(file) {
    // FIXED: Use the global SaveManager instance that handles photos
    globalSaveManager.importSketchFromJSON(file);
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
    // Sequence: READY -> EDIT LABELS -> EDIT LINES -> EDIT AREAS -> READY
    if (AppState.currentMode !== 'edit') {
        switchToEditLabelsMode();
    } else {
        if (AppState.editSubMode === 'labels') {
            switchToEditLinesMode();  // NEW: Go to lines mode
        } else if (AppState.editSubMode === 'lines') {  // NEW: From lines go to areas
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
    editBtn.textContent = 'Edit Lines';  // UPDATED: Next mode is lines

    const modeIndicator = document.getElementById('modeIndicator');
    modeIndicator.textContent = 'EDIT LABELS';
    modeIndicator.className = 'mode-indicator edit-mode';

    AppState.emit('mode:changed', { mode: 'edit', subMode: 'labels' });
    AppState.emit('mode:editToggled', { isEditMode: true, subMode: 'labels' });
    CanvasManager.redraw();
}

// NEW FUNCTION: Add this between switchToEditLabelsMode and switchToEditAreasMode
function switchToEditLinesMode() {
    console.log('Switching to Edit Lines mode');
    activateSketchListeners();
    AppState.currentMode = 'edit';
    AppState.editSubMode = 'lines';

    resetAllModeButtons();
    const editBtn = document.getElementById('editBtn');
    editBtn.classList.add('active');
    editBtn.textContent = 'Edit Areas';  // Next mode is areas

    const modeIndicator = document.getElementById('modeIndicator');
    modeIndicator.textContent = 'EDIT LINES';
    modeIndicator.className = 'mode-indicator edit-mode';

    AppState.emit('mode:changed', { mode: 'edit', subMode: 'lines' });
    AppState.emit('mode:editToggled', { isEditMode: true, subMode: 'lines' });
    setTimeout(() => console.log('💡 EDIT LINES: Click on line icons to edit/delete edges. Use directional pad to move selected lines!'), 100);
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
    AppState.emit('mode:editToggled', { isEditMode: true, subMode: 'areas' });  // UPDATED: Include subMode
    setTimeout(() => console.log('💡 EDIT AREAS: Click and drag areas to move them, or click the pencil icon to edit properties!'), 100);
    CanvasManager.redraw();
}

 

 

// --- Standard Mode Switching Functions (Modified) ---
 function switchToPhotosMode() {
    // DEBUG: Log the start of the mode switch
    console.log('DEBUG: Attempting to switch to Photos Mode. Current mode is:', AppState.currentMode);

    // DEACTIVATING LISTENERS IS DISABLED TO ALLOW PANNING IN PHOTO MODE.
    // deactivateSketchListeners(); // This line is commented out to allow panning.

    AppState.currentMode = 'photos';
    AppState.editSubMode = null;
    resetAllModeButtons();

    const photosBtn = document.getElementById('photosBtn');
    if (photosBtn) {
        photosBtn.classList.add('active');
    }

    const modeIndicator = document.getElementById('modeIndicator');
    modeIndicator.textContent = 'PHOTOS';
    modeIndicator.className = 'mode-indicator photos-mode';

    AppState.emit('mode:changed', { mode: 'photos' });
    AppState.emit('mode:editToggled', { isEditMode: false });
    CanvasManager.redraw();

    // DEBUG: Confirm the mode switch is complete
    console.log('DEBUG: Mode switched. AppState.currentMode is now:', AppState.currentMode);
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
    AppState.emit('mode:editToggled', { isEditMode: false, subMode: null });  // UPDATED: Include subMode
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
    
    // Reset all palette buttons to inactive
    const paletteButtons = document.querySelectorAll('[data-palette]');
    paletteButtons.forEach(btn => btn.classList.remove('active'));
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

 
 
// REMOVED: Old duplicate import function that didn't handle photos