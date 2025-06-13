// src/saveManager.js

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { db } from './db.js'; // NEW: Import the Dexie database instance.

export class SaveManager {
    constructor() {
        this.saveModal = document.getElementById('saveModal');
        this.sketchNameInput = document.getElementById('sketchNameInput');
        this.confirmSaveBtn = document.getElementById('confirmSaveBtn');
        this.cancelSaveBtn = document.getElementById('cancelSaveBtn');
        // NOTE: this.STORAGE_KEY is no longer used but is kept to avoid breaking anything that might reference it.
        this.STORAGE_KEY = 'savedSketches'; 
    }

    init() {
        console.log('SaveManager initialized for IndexedDB.');
        if (this.cancelSaveBtn) {
            this.cancelSaveBtn.addEventListener('click', () => this.hideSaveModal());
        }
        if (this.confirmSaveBtn) {
            // The handler now needs to be async, so we wrap it.
            this.confirmSaveBtn.addEventListener('click', () => this.handleConfirmSave());
        }
    }

    /**
     * This is the main function called by the UI's "Save" button. 
     * It decides whether to save instantly or ask for a name.
     * CHANGED: This function is now async.
     */
    async promptOrSave() {
        if (AppState.currentSketchId) {
            // If a sketch is already loaded, save directly (overwrite)
            await this._performOverwrite();
        } else {
            // If it's a new sketch, prompt for a name. This is the "Save As" flow.
            this.promptForNewName();
        }
    }

    /**
     * This is the main function for the "Save As..." button. It always prompts for a name.
     * NOTE: This function did not need changes as it only deals with UI.
     */
    promptForNewName() {
        console.log('Prompting for a new sketch name (Save As)...');
        // Pre-fill with current name + " copy" if a sketch is loaded, otherwise suggest a default.
        this.sketchNameInput.value = AppState.currentSketchName ? `${AppState.currentSketchName} copy` : 'New Sketch';
        this.saveModal.classList.remove('hidden');
        this.sketchNameInput.focus();
        this.sketchNameInput.select();
    }

    /**
     * Handles the click on the modal's "Save" button.
     * CHANGED: This function is now async to await the save operation.
     */
    async handleConfirmSave() {
        const sketchName = this.sketchNameInput.value.trim();
        if (!sketchName) {
            alert('Please enter a name for the sketch.');
            return;
        }
        await this._performSaveAs(sketchName);
    }

    hideSaveModal() {
        this.saveModal.classList.add('hidden');
    }

    /**
     * REFACTORED: Saves a sketch under a specific name to IndexedDB.
     */
    async _performSaveAs(sketchName) {
        console.log(`Saving sketch as "${sketchName}" to IndexedDB`);
        try {
            const snapshot = AppState.getStateSnapshot();
            
            const newSketchEntry = {
                // The 'id' property is now omitted; IndexedDB will auto-generate it.
                name: sketchName,
                savedAt: new Date().toISOString(),
                data: snapshot
            };

            // Use Dexie's put() method to add the new sketch.
            // It returns the ID of the newly created record.
            const id = await db.sketches.put(newSketchEntry);
            
            // Update the app's state to reflect the newly saved sketch.
            AppState.currentSketchId = id;
            AppState.currentSketchName = newSketchEntry.name;

            this.hideSaveModal();
            alert(`Sketch "${sketchName}" saved successfully!`);

        } catch (error) {
            console.error('Failed to save sketch to IndexedDB:', error);
            // Provide a more helpful error if the name is a duplicate
            if (error.name === 'ConstraintError') {
                alert('A sketch with this name already exists. Please choose a different name.');
            } else {
                alert('An error occurred while saving.');
            }
        }
    }
    
    /**
     * REFACTORED: Instantly overwrites the currently loaded sketch in IndexedDB.
     */
    async _performOverwrite() {
        const sketchId = AppState.currentSketchId;
        if (!sketchId) {
            console.error('Cannot overwrite: No sketch is currently loaded.');
            this.promptForNewName();
            return;
        }

        console.log(`Overwriting sketch ID: "${sketchId}"`);
        try {
            const snapshot = AppState.getStateSnapshot();

            // Use Dexie's update() method to modify the record by its primary key.
            await db.sketches.update(sketchId, {
                data: snapshot,
                savedAt: new Date().toISOString()
            });

            alert(`Sketch "${AppState.currentSketchName}" updated successfully!`);
        } catch (error) {
            console.error('Failed to overwrite sketch:', error);
            alert('An error occurred while saving.');
        }
    }
    
    /**
     * REFACTORED: Loads a sketch from IndexedDB based on a URL parameter.
     */
    async loadSketchFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        // The ID from the URL will be a string, so we need to convert it to a number.
        const sketchIdToLoad = parseInt(urlParams.get('loadSketch'), 10);

        if (!sketchIdToLoad) return;

        try {
            // Use Dexie's get() method for a direct and efficient lookup by primary key.
            const sketchToLoad = await db.sketches.get(sketchIdToLoad);

            if (sketchToLoad) {
                console.log(`Loading sketch: "${sketchToLoad.name}"`);
                AppState.restoreStateSnapshot(sketchToLoad.data);
                
                // Update app state to know which sketch is loaded
                AppState.currentSketchId = sketchToLoad.id;
                AppState.currentSketchName = sketchToLoad.name;

                CanvasManager.redraw();
                AppState.emit('app:sketchLoaded');
            } else {
                alert(`Error: Could not find sketch with ID: ${sketchIdToLoad}`);
            }
        } catch (error) {
            console.error('Failed to load sketch from DB:', error);
            alert('An error occurred while loading the sketch.');
        }
    }
}