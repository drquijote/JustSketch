// src/saveManager.js

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

export class SaveManager {
    constructor() {
        this.saveModal = document.getElementById('saveModal');
        this.sketchNameInput = document.getElementById('sketchNameInput');
        this.confirmSaveBtn = document.getElementById('confirmSaveBtn');
        this.cancelSaveBtn = document.getElementById('cancelSaveBtn');
        this.STORAGE_KEY = 'savedSketches';
    }

    init() {
        console.log('SaveManager initialized.');
        if (this.cancelSaveBtn) {
            this.cancelSaveBtn.addEventListener('click', () => this.hideSaveModal());
        }
        if (this.confirmSaveBtn) {
            this.confirmSaveBtn.addEventListener('click', () => this.handleConfirmSave());
        }
    }

    /**
     * This is the main function called by the UI's "Save" button. 
     * It decides whether to save instantly or ask for a name.
     */
    promptOrSave() {
        if (AppState.currentSketchId) {
            // If a sketch is already loaded, save directly (overwrite)
            this._performOverwrite();
        } else {
            // If it's a new sketch, prompt for a name. This is the "Save As" flow.
            this.promptForNewName();
        }
    }

    /**
     * This is the main function for the "Save As..." button. It always prompts for a name.
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
     */
    handleConfirmSave() {
        const sketchName = this.sketchNameInput.value.trim();
        if (!sketchName) {
            alert('Please enter a name for the sketch.');
            return;
        }
        // This function always creates a new entry, which is correct
        // for both an initial save and a "Save As" operation.
        this._performSaveAs(sketchName);
    }

    hideSaveModal() {
        this.saveModal.classList.add('hidden');
    }

    /**
     * Saves a sketch under a specific name. This creates a new entry in localStorage.
     */
    _performSaveAs(sketchName) {
        console.log(`Saving sketch as "${sketchName}"`);
        try {
            const snapshot = AppState.getStateSnapshot();
            const savedSketchesJSON = localStorage.getItem(this.STORAGE_KEY);
            const allSketches = savedSketchesJSON ? JSON.parse(savedSketchesJSON) : {};

            const newSketchEntry = {
                id: `sketch_${Date.now()}`,
                name: sketchName,
                savedAt: new Date().toISOString(),
                data: snapshot
            };

            // Use the sketch name as the key in the main sketches object.
            allSketches[sketchName] = newSketchEntry;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allSketches));
            
            // Update the app's state to reflect the newly saved sketch.
            AppState.currentSketchId = newSketchEntry.id;
            AppState.currentSketchName = newSketchEntry.name;

            this.hideSaveModal();
            alert(`Sketch "${sketchName}" saved successfully!`);

        } catch (error) {
            console.error('Failed to save sketch:', error);
            alert('An error occurred while saving.');
        }
    }
    
    /**
     * Instantly overwrites the currently loaded sketch without prompting.
     */
    _performOverwrite() {
        const sketchName = AppState.currentSketchName;
        if (!sketchName) {
            console.error('Cannot overwrite: No sketch is currently loaded.');
            // If something is wrong, fall back to the "Save As" dialog
            this.promptForNewName();
            return;
        }

        console.log(`Overwriting sketch: "${sketchName}"`);
        try {
            const snapshot = AppState.getStateSnapshot();
            const savedSketchesJSON = localStorage.getItem(this.STORAGE_KEY);
            const allSketches = JSON.parse(savedSketchesJSON || '{}');

            if (allSketches[sketchName]) {
                // Update the data for the existing entry
                allSketches[sketchName].data = snapshot;
                allSketches[sketchName].savedAt = new Date().toISOString();

                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allSketches));
                alert(`Sketch "${sketchName}" updated successfully!`);
            } else {
                console.error(`Could not find sketch named "${sketchName}" to overwrite. Forcing "Save As"...`);
                this.promptForNewName();
            }
        } catch (error) {
            console.error('Failed to overwrite sketch:', error);
            alert('An error occurred while saving.');
        }
    }
    
    /**
     * Loads a sketch from localStorage based on a URL parameter.
     */
    loadSketchFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const sketchIdToLoad = urlParams.get('loadSketch');

        if (!sketchIdToLoad) return;

        const savedSketchesJSON = localStorage.getItem(this.STORAGE_KEY);
        const allSketches = savedSketchesJSON ? JSON.parse(savedSketchesJSON) : {};

        let sketchToLoad = null;
        for (const name in allSketches) {
            if (allSketches[name].id === sketchIdToLoad) {
                sketchToLoad = allSketches[name];
                break;
            }
        }

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
    }
}