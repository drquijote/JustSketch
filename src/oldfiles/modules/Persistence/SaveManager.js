// src/modules/Persistence/SaveManager.js - NEW MODULAR VERSION

import { db } from '../../db.js';

/**
 * Handles all save/load operations for sketches
 * Works with IndexedDB for persistent storage
 */
export class SaveManager {
    constructor() {
        this.appState = null;
        this.eventBus = null;
        this.exportManager = null;
        this.saveModal = null;
        this.sketchNameInput = null;
        this.confirmSaveBtn = null;
        this.cancelSaveBtn = null;
        
        console.log('SaveManager: Initialized');
    }

    /**
     * Initialize the SaveManager with dependencies
     */
    init(dependencies = {}) {
        this.appState = dependencies.appState || window.AppState;
        this.eventBus = dependencies.eventBus;
        this.exportManager = dependencies.exportManager;
        
        // Get DOM elements
        this.saveModal = document.getElementById('saveModal');
        this.sketchNameInput = document.getElementById('sketchNameInput');
        this.confirmSaveBtn = document.getElementById('confirmSaveBtn');
        this.cancelSaveBtn = document.getElementById('cancelSaveBtn');
        
        this.setupEventListeners();
        
        console.log('SaveManager: Initialization complete');
    }

    /**
     * Setup event listeners for save modal
     */
    setupEventListeners() {
        if (this.cancelSaveBtn) {
            this.cancelSaveBtn.addEventListener('click', () => this.hideSaveModal());
        }
        
        if (this.confirmSaveBtn) {
            this.confirmSaveBtn.addEventListener('click', () => this.handleConfirmSave());
        }

        // Listen for save requests via event bus
        if (this.eventBus) {
            this.eventBus.on('save:request', () => this.promptOrSave());
            this.eventBus.on('saveAs:request', () => this.promptForNewName());
        }
    }

    /**
     * Main save function - saves current sketch or prompts for name
     */
    async promptOrSave() {
        if (this.appState.currentSketchId) {
            // If a sketch is already loaded, save directly (overwrite)
            await this.performOverwrite();
        } else {
            // If it's a new sketch, prompt for a name
            this.promptForNewName();
        }
    }

    /**
     * Always prompt for a new name (Save As functionality)
     */
    promptForNewName() {
        console.log('SaveManager: Prompting for new sketch name...');
        
        // Pre-fill with current name + " copy" if a sketch is loaded
        const baseName = this.appState.currentSketchName || 'New Sketch';
        this.sketchNameInput.value = this.appState.currentSketchName ? `${baseName} copy` : baseName;
        
        this.showSaveModal();
    }

    /**
     * Show the save modal
     */
    showSaveModal() {
        if (this.saveModal) {
            this.saveModal.classList.remove('hidden');
            if (this.sketchNameInput) {
                this.sketchNameInput.focus();
                setTimeout(() => this.sketchNameInput.select(), 100);
            }
        }
    }

    /**
     * Hide the save modal
     */
    hideSaveModal() {
        if (this.saveModal) {
            this.saveModal.classList.add('hidden');
        }
    }

    /**
     * Handle confirm save button click
     */
    async handleConfirmSave() {
        const sketchName = this.sketchNameInput?.value?.trim();
        if (!sketchName) {
            alert('Please enter a name for the sketch.');
            return;
        }
        
        await this.performSaveAs(sketchName);
    }

    /**
     * Save sketch with a specific name to IndexedDB
     */
    async performSaveAs(sketchName) {
        console.log(`SaveManager: Saving sketch as "${sketchName}"`);
        
        try {
            const snapshot = this.appState.getStateSnapshot();
            
            const newSketchEntry = {
                name: sketchName,
                savedAt: new Date().toISOString(),
                data: snapshot
            };

            // Save to IndexedDB
            const id = await db.sketches.put(newSketchEntry);
            
            // Update app state
            this.appState.currentSketchId = id;
            this.appState.currentSketchName = sketchName;

            this.hideSaveModal();
            
            // Emit success event
            if (this.eventBus) {
                this.eventBus.emit('save:success', { id, name: sketchName });
            }
            
            // Show success message
            this.showSuccessMessage(`Sketch "${sketchName}" saved successfully!`);
            
            console.log(`SaveManager: Sketch saved with ID ${id}`);

        } catch (error) {
            console.error('SaveManager: Error saving sketch:', error);
            
            // Emit error event
            if (this.eventBus) {
                this.eventBus.emit('save:error', { error });
            }
            
            // Show error message
            if (error.name === 'ConstraintError') {
                alert('A sketch with this name already exists. Please choose a different name.');
            } else {
                alert('An error occurred while saving the sketch.');
            }
        }
    }

    /**
     * Overwrite the currently loaded sketch
     */
    async performOverwrite() {
        const sketchId = this.appState.currentSketchId;
        if (!sketchId) {
            console.error('SaveManager: Cannot overwrite - no sketch loaded');
            this.promptForNewName();
            return;
        }

        console.log(`SaveManager: Overwriting sketch ID ${sketchId}`);
        
        try {
            const snapshot = this.appState.getStateSnapshot();

            // Update existing record
            await db.sketches.update(sketchId, {
                data: snapshot,
                savedAt: new Date().toISOString()
            });

            // Emit success event
            if (this.eventBus) {
                this.eventBus.emit('save:success', { 
                    id: sketchId, 
                    name: this.appState.currentSketchName,
                    overwrite: true 
                });
            }

            this.showSuccessMessage(`Sketch "${this.appState.currentSketchName}" updated successfully!`);
            
            console.log(`SaveManager: Sketch ${sketchId} overwritten successfully`);

        } catch (error) {
            console.error('SaveManager: Error overwriting sketch:', error);
            
            if (this.eventBus) {
                this.eventBus.emit('save:error', { error });
            }
            
            alert('An error occurred while saving the sketch.');
        }
    }

    /**
     * Load a sketch from URL parameter
     */
    async loadSketchFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const sketchIdToLoad = parseInt(urlParams.get('loadSketch'), 10);

        if (!sketchIdToLoad) return;

        try {
            console.log(`SaveManager: Loading sketch ID ${sketchIdToLoad} from URL`);
            
            const sketchToLoad = await db.sketches.get(sketchIdToLoad);

            if (sketchToLoad) {
                console.log(`SaveManager: Loading sketch "${sketchToLoad.name}"`);
                
                // Restore state
                this.appState.restoreStateSnapshot(sketchToLoad.data);
                
                // Update current sketch info
                this.appState.currentSketchId = sketchToLoad.id;
                this.appState.currentSketchName = sketchToLoad.name;

                // Emit load success event
                if (this.eventBus) {
                    this.eventBus.emit('sketch:loaded', { 
                        id: sketchToLoad.id, 
                        name: sketchToLoad.name 
                    });
                }

                console.log(`SaveManager: Sketch "${sketchToLoad.name}" loaded successfully`);

            } else {
                console.error(`SaveManager: Sketch with ID ${sketchIdToLoad} not found`);
                alert(`Error: Could not find sketch with ID: ${sketchIdToLoad}`);
            }

        } catch (error) {
            console.error('SaveManager: Error loading sketch from URL:', error);
            alert('An error occurred while loading the sketch.');
        }
    }

    /**
     * Load a specific sketch by ID
     */
    async loadSketch(sketchId) {
        try {
            console.log(`SaveManager: Loading sketch ID ${sketchId}`);
            
            const sketch = await db.sketches.get(sketchId);
            
            if (sketch) {
                this.appState.restoreStateSnapshot(sketch.data);
                this.appState.currentSketchId = sketch.id;
                this.appState.currentSketchName = sketch.name;
                
                if (this.eventBus) {
                    this.eventBus.emit('sketch:loaded', { 
                        id: sketch.id, 
                        name: sketch.name 
                    });
                }
                
                return true;
            } else {
                throw new Error(`Sketch with ID ${sketchId} not found`);
            }

        } catch (error) {
            console.error('SaveManager: Error loading sketch:', error);
            
            if (this.eventBus) {
                this.eventBus.emit('sketch:loadError', { error, sketchId });
            }
            
            throw error;
        }
    }

    /**
     * Delete a sketch by ID
     */
    async deleteSketch(sketchId) {
        try {
            console.log(`SaveManager: Deleting sketch ID ${sketchId}`);
            
            const sketch = await db.sketches.get(sketchId);
            if (!sketch) {
                throw new Error(`Sketch with ID ${sketchId} not found`);
            }

            await db.sketches.delete(sketchId);
            
            // If we just deleted the currently loaded sketch, clear the current state
            if (this.appState.currentSketchId === sketchId) {
                this.appState.currentSketchId = null;
                this.appState.currentSketchName = null;
            }

            if (this.eventBus) {
                this.eventBus.emit('sketch:deleted', { 
                    id: sketchId, 
                    name: sketch.name 
                });
            }

            console.log(`SaveManager: Sketch "${sketch.name}" deleted successfully`);
            return true;

        } catch (error) {
            console.error('SaveManager: Error deleting sketch:', error);
            
            if (this.eventBus) {
                this.eventBus.emit('sketch:deleteError', { error, sketchId });
            }
            
            throw error;
        }
    }

    /**
     * Get all saved sketches
     */
    async getAllSketches() {
        try {
            const sketches = await db.sketches.orderBy('savedAt').reverse().toArray();
            return sketches;
        } catch (error) {
            console.error('SaveManager: Error getting all sketches:', error);
            throw error;
        }
    }

    /**
     * Export sketch to JSON file
     */
    exportToJSON(sketchName = null) {
        const name = sketchName || this.appState.currentSketchName || 'sketch';
        const sketchData = {
            version: '2.0.0',
            createdAt: new Date().toISOString(),
            data: this.appState.getStateSnapshot()
        };
        
        const jsonString = JSON.stringify(sketchData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        
        console.log(`SaveManager: Exported "${name}" to JSON`);
    }

    /**
     * Import sketch from JSON file
     */
    async importFromJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    
                    if (!importedData.data || !importedData.data.drawnPolygons) {
                        throw new Error('Invalid or corrupted sketch file.');
                    }
                    
                    // Restore the imported data
                    this.appState.restoreStateSnapshot(importedData.data);
                    
                    // Clear current sketch ID since this is imported data
                    this.appState.currentSketchId = null;
                    this.appState.currentSketchName = null;
                    
                    if (this.eventBus) {
                        this.eventBus.emit('sketch:imported', { data: importedData });
                    }
                    
                    console.log('SaveManager: Sketch imported successfully');
                    resolve(importedData);
                    
                } catch (error) {
                    console.error('SaveManager: Error importing sketch:', error);
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                const error = new Error('Error reading file');
                console.error('SaveManager:', error);
                reject(error);
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Create a new sketch (reset to blank state)
     */
    createNew() {
        console.log('SaveManager: Creating new sketch');
        
        // Reset to initial state
        this.appState.reset();
        
        if (this.eventBus) {
            this.eventBus.emit('sketch:new');
        }
    }

    /**
     * Show success message to user
     */
    showSuccessMessage(message) {
        // For now, use alert - in the future this could be a toast notification
        alert(message);
    }

    /**
     * Get current sketch info
     */
    getCurrentSketchInfo() {
        return {
            id: this.appState.currentSketchId,
            name: this.appState.currentSketchName,
            hasUnsavedChanges: this.hasUnsavedChanges(),
            lastSaved: this.getLastSavedTime()
        };
    }

    /**
     * Check if there are unsaved changes
     */
    hasUnsavedChanges() {
        // This is a simplified check - in a real implementation you might compare
        // current state with last saved state
        return this.appState.currentSketchId === null && 
               (this.appState.drawnPolygons.length > 0 || this.appState.placedElements.length > 0);
    }

    /**
     * Get last saved time
     */
    getLastSavedTime() {
        // This would need to be tracked in the state
        // For now, return null
        return null;
    }

    /**
     * Cleanup and destroy
     */
    destroy() {
        if (this.eventBus) {
            this.eventBus.off('save:request');
            this.eventBus.off('saveAs:request');
        }
        
        this.appState = null;
        this.eventBus = null;
        this.exportManager = null;
        
        console.log('SaveManager: Destroyed');
    }
}