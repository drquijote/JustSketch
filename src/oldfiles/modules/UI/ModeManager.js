// src/modules/UI/ModeManager.js - Fixed initialization timing

import { AppState } from '../../core/AppState.js';
import { eventBus } from '../../core/EventBus.js';

export class ModeManager {
    constructor() {
        this.currentMode = 'placement';
        this.currentEditSubMode = null;
        this.modeIndicator = null;
        this.editBtn = null;
        this.startBtn = null;
        this.pathDrawingManager = null;
        this.isInitialized = false; // ADDED: Track initialization state
        
        console.log('ModeManager: Initialized');
    }

    init() {
        this.modeIndicator = document.getElementById('modeIndicator');
        this.editBtn = document.getElementById('editBtn');
        this.startBtn = document.getElementById('startBtn');
        
        this.setupEventListeners();
        
        // CHANGED: Don't set initial mode yet - wait for PathDrawingManager
        this.updateModeIndicator();
        this.updateModeButtons();
        
        this.isInitialized = true;
        console.log('ModeManager: Setup complete (waiting for PathDrawingManager)');
    }

    // Set the PathDrawingManager reference and finalize initialization
    setPathDrawingManager(pathDrawingManager) {
        this.pathDrawingManager = pathDrawingManager;
        console.log('ModeManager: PathDrawingManager reference set');
        
        // NOW we can safely set the initial mode
        this.setMode('placement');
        console.log('ModeManager: Initial mode set after PathDrawingManager connection');
    }

    setupEventListeners() {
        // Listen for mode change requests
        eventBus.on('mode:request', (e) => {
            const { mode, subMode } = e.detail;
            this.setMode(mode, subMode);
        });

        // Listen for UI button clicks
        if (this.editBtn) {
            this.editBtn.addEventListener('click', () => this.cycleEditMode());
        }

        if (this.startBtn) {
            this.startBtn.addEventListener('click', () => {
                // DEBUG: Log when the start button is clicked
                console.log('[DEBUG] Start/Stop button clicked.');
                this.toggleDrawingMode();
            });
        }

        // Listen for external mode change events
        eventBus.on('app:exitDrawingMode', () => {
            this.setMode('placement');
        });

        eventBus.on('app:switchToDrawingMode', () => {
            this.setMode('drawing');
        });
    }

    setMode(mode, subMode = null) {
        // DEBUG: Log when a mode change is attempted
        console.log(`[DEBUG] setMode called with mode: ${mode}, subMode: ${subMode}`);
        
        const previousMode = this.currentMode;
        const previousSubMode = this.currentEditSubMode;
        
        this.currentMode = mode;
        this.currentEditSubMode = subMode;
        
        // Update AppState
        AppState.currentMode = mode;
        AppState.editSubMode = subMode;
        
        // FIXED: Only try to activate/deactivate PathDrawingManager if we have it
        if (this.pathDrawingManager) {
            if (mode === 'drawing') {
                console.log('ModeManager: Activating PathDrawingManager for drawing mode');
                this.pathDrawingManager.activate();
            } else if (previousMode === 'drawing') {
                console.log('ModeManager: Deactivating PathDrawingManager');
                this.pathDrawingManager.deactivate();
            }
        } else if (mode === 'drawing' || previousMode === 'drawing') {
            // Only warn if we're actually trying to use drawing mode
            console.warn('ModeManager: PathDrawingManager not available, skipping activation/deactivation');
        }
        
        // Update UI elements
        this.updateModeIndicator();
        this.updateModeButtons();
        
        // Emit mode change events
        eventBus.emit('mode:changed', { 
            mode, 
            subMode, 
            previousMode, 
            previousSubMode 
        });
        
        if (mode === 'edit') {
            eventBus.emit('mode:editToggled', { isEditMode: true, subMode });
        } else {
            eventBus.emit('mode:editToggled', { isEditMode: false });
        }
        
        console.log(`ModeManager: Mode changed to ${mode}${subMode ? ` (${subMode})` : ''}`);
    }

    updateModeIndicator() {
        if (!this.modeIndicator) return;

        const mode = this.currentMode;
        const subMode = this.currentEditSubMode;

        // Reset classes
        this.modeIndicator.className = 'mode-indicator';

        switch (mode) {
            case 'placement':
                this.modeIndicator.textContent = 'READY';
                break;
            case 'drawing':
                this.modeIndicator.textContent = 'DRAWING';
                this.modeIndicator.classList.add('drawing-mode');
                break;
            case 'edit':
                if (subMode === 'labels') {
                    this.modeIndicator.textContent = 'EDIT LABELS';
                    this.modeIndicator.classList.add('edit-mode');
                } else if (subMode === 'areas') {
                    this.modeIndicator.textContent = 'EDIT AREAS';
                    this.modeIndicator.classList.add('edit-mode');
                } else {
                    this.modeIndicator.textContent = 'EDITING';
                    this.modeIndicator.classList.add('edit-mode');
                }
                break;
            case 'photos':
                this.modeIndicator.textContent = 'PHOTOS';
                this.modeIndicator.classList.add('photos-mode');
                break;
            default:
                this.modeIndicator.textContent = 'READY';
        }
    }

    updateModeButtons() {
        this.resetAllModeButtons();

        const mode = this.currentMode;
        const subMode = this.currentEditSubMode;

        // Update edit button based on current state
        if (this.editBtn) {
            if (mode === 'edit') {
                this.editBtn.classList.add('active');
                if (subMode === 'labels') {
                    this.editBtn.textContent = 'Edit Areas';
                } else if (subMode === 'areas') {
                    this.editBtn.textContent = 'Done';
                } else {
                    this.editBtn.textContent = 'Done';
                }
            } else {
                this.editBtn.textContent = 'Edit';
            }
        }

        // Update start button
        if (this.startBtn) {
            if (mode === 'drawing') {
                this.startBtn.classList.add('active');
                this.startBtn.textContent = 'Stop';
            } else {
                this.startBtn.textContent = 'Start';
            }
        }
    }

    resetAllModeButtons() {
        if (this.editBtn) {
            this.editBtn.classList.remove('active');
        }
        if (this.startBtn) {
            this.startBtn.classList.remove('active');
        }
    }

    cycleEditMode() {
        const mode = this.currentMode;
        const subMode = this.currentEditSubMode;

        if (mode !== 'edit') {
            // Enter edit labels mode
            this.setMode('edit', 'labels');
        } else if (subMode === 'labels') {
            // Switch to edit areas mode
            this.setMode('edit', 'areas');
        } else {
            // Exit edit mode back to placement
            this.setMode('placement');
        }
    }

    toggleDrawingMode() {
        // DEBUG: Log when we toggle the drawing mode
        console.log(`[DEBUG] Toggling drawing mode. Current mode is: ${this.currentMode}`);
        if (this.currentMode === 'drawing') {
            this.setMode('placement');
        } else {
            this.setMode('drawing');
        }
    }

    // Public API methods
    isInMode(mode, subMode = null) {
        if (subMode) {
            return this.currentMode === mode && this.currentEditSubMode === subMode;
        }
        return this.currentMode === mode;
    }

    getCurrentMode() {
        return {
            mode: this.currentMode,
            subMode: this.currentEditSubMode
        };
    }

    isEditMode() {
        return this.currentMode === 'edit';
    }

    isDrawingMode() {
        return this.currentMode === 'drawing';
    }

    isPlacementMode() {
        return this.currentMode === 'placement';
    }

    isPhotosMode() {
        return this.currentMode === 'photos';
    }
}