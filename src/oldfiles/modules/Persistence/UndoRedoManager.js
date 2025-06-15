// src/modules/Persistence/UndoRedoManager.js - NEW MODULAR VERSION

import { AppState } from '../../core/AppState.js';
import { eventBus } from '../../core/EventBus.js';

/**
 * Handles undo/redo functionality for the application
 * This is a complete rewrite that doesn't depend on old files
 */
export class UndoRedoManager {
    constructor(eventBusInstance) {
        this.eventBus = eventBusInstance;
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        this.isPerformingUndoRedo = false;
        
        console.log('UndoRedoManager: Initialized (modular version)');
    }

    /**
     * Initialize the UndoRedoManager
     */
    init() {
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        
        // Initial state is now saved from main.js after all modules are loaded
        
        console.log('UndoRedoManager: Initialized');
    }

    /**
     * Set up event listeners for undo/redo UI elements
     */
    setupEventListeners() {
        // Undo button
        const undoBtn = document.getElementById('undo');
        if (undoBtn) {
            undoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.undo();
            });
        }

        // Redo button
        const redoBtn = document.getElementById('redo');
        if (redoBtn) {
            redoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.redo();
            });
        }

        // Listen for state change events from other modules
        this.eventBus.on('history:saveAction', (e) => {
            if (!this.isPerformingUndoRedo) {
                this.saveState(e.detail?.description || 'Action completed');
            }
        });

        console.log('UndoRedoManager: Event listeners set up');
    }

    /**
     * Set up keyboard shortcuts for undo/redo
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            const isCtrlOrCmd = event.ctrlKey || event.metaKey;
            const targetTagName = event.target.tagName.toLowerCase();
            
            // Don't intercept if typing in input fields
            if (targetTagName === 'input' || targetTagName === 'textarea') {
                return;
            }

            // Undo: Ctrl+Z or Cmd+Z
            if (isCtrlOrCmd && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                event.preventDefault();
                this.undo();
            }

            // Redo: Ctrl+Shift+Z, Cmd+Shift+Z, or Ctrl+Y, Cmd+Y
            if (isCtrlOrCmd && ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y')) {
                event.preventDefault();
                this.redo();
            }
        });

        console.log('UndoRedoManager: Keyboard shortcuts set up');
    }

    /**
     * Save the current state to history
     */
    saveState(description = 'State change') {
        if (this.isPerformingUndoRedo) {
            return; // Don't save state during undo/redo operations
        }

        // CORRECTED: Call the correct method on AppState
        const snapshot = AppState.getStateSnapshot();
        snapshot.description = description;

        // If we're not at the end of history, truncate it
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // Add new state to history
        this.history.push(snapshot);
        this.historyIndex = this.history.length - 1;

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.historyIndex = this.history.length - 1;
        }

        this.updateButtonStates();

        console.log(`UndoRedoManager: Saved state - ${description} (index: ${this.historyIndex}, total: ${this.history.length})`);

        this.eventBus.emit('history:updated', {
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
        });
    }

    /**
     * Perform undo operation
     */
    undo() {
        if (!this.canUndo()) {
            console.log('UndoRedoManager: Cannot undo - at beginning of history');
            return false;
        }

        console.log(`UndoRedoManager: Performing undo (from index ${this.historyIndex} to ${this.historyIndex - 1})`);

        this.isPerformingUndoRedo = true;

        try {
            this.historyIndex--;
            const stateToRestore = this.history[this.historyIndex];
            
            if (stateToRestore) {
                this.restoreState(stateToRestore);
                console.log(`UndoRedoManager: Restored to state: ${stateToRestore.description}`);
                
                this.eventBus.emit('history:undone', {
                    description: stateToRestore.description,
                    index: this.historyIndex
                });
            }

            this.updateButtonStates();
            return true;

        } finally {
            this.isPerformingUndoRedo = false;
        }
    }

    /**
     * Perform redo operation
     */
    redo() {
        if (!this.canRedo()) {
            console.log('UndoRedoManager: Cannot redo - at end of history');
            return false;
        }

        console.log(`UndoRedoManager: Performing redo (from index ${this.historyIndex} to ${this.historyIndex + 1})`);

        this.isPerformingUndoRedo = true;

        try {
            this.historyIndex++;
            const stateToRestore = this.history[this.historyIndex];
            
            if (stateToRestore) {
                this.restoreState(stateToRestore);
                console.log(`UndoRedoManager: Restored to state: ${stateToRestore.description}`);
                
                this.eventBus.emit('history:redone', {
                    description: stateToRestore.description,
                    index: this.historyIndex
                });
            }

            this.updateButtonStates();
            return true;

        } finally {
            this.isPerformingUndoRedo = false;
        }
    }

    /**
     * Restore a state snapshot
     */
    restoreState(stateData) {
        // CORRECTED: Call the correct method on AppState
        AppState.restoreStateSnapshot(stateData);

        // Emit state restored event for other modules to react
        this.eventBus.emit('state:restored', stateData);
    }

    /**
     * Check if undo is possible
     */
    canUndo() {
        return this.historyIndex > 0;
    }

    /**
     * Check if redo is possible
     */
    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    /**
     * Update the visual state of undo/redo buttons
     */
    updateButtonStates() {
        const undoBtn = document.getElementById('undo');
        const redoBtn = document.getElementById('redo');

        if (undoBtn) {
            undoBtn.disabled = !this.canUndo();
            undoBtn.style.opacity = this.canUndo() ? '1' : '0.5';
        }

        if (redoBtn) {
            redoBtn.disabled = !this.canRedo();
            redoBtn.style.opacity = this.canRedo() ? '1' : '0.5';
        }
    }

    /**
     * Clear the entire history
     */
    clearHistory() {
        console.log('UndoRedoManager: Clearing history');
        
        this.history = [];
        this.historyIndex = -1;
        
        this.saveState('History cleared');
        
        this.updateButtonStates();
        
        this.eventBus.emit('history:cleared');
    }
}
