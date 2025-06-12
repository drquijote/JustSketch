// src/saveManager.js - FINAL VERSION WITH "SAVE AS"

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
        this.cancelSaveBtn.addEventListener('click', () => this.hideSaveModal());
        this.confirmSaveBtn.addEventListener('click', () => this.handleConfirmSave());
    }

    /**
     * Main function for the "Save" button. Decides whether to
     * overwrite instantly or prompt for a name (for new sketches).
     */
    promptOrSave() {
        if (AppState.currentSketchId) {
            this._performOverwrite();
        } else {
            this.promptForNewName(); // A new sketch is always a "Save As"
        }
    }

    /**
     * NEW: Main function for the "Save As..." button. Always prompts.
     */
    promptForNewName() {
        console.log('Prompting for a new sketch name (Save As)...');
        // Pre-fill with the current name + " copy" if a sketch is loaded
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
     * Saves a sketch under a specific name. This is used for both
     * initial saves and "Save As" copies. It creates a new entry.
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

            allSketches[sketchName] = newSketchEntry;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allSketches));
            
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
        console.log(`Overwriting sketch: "${sketchName}"`);

        try {
            const snapshot = AppState.getStateSnapshot();
            const savedSketchesJSON = localStorage.getItem(this.STORAGE_KEY);
            const allSketches = JSON.parse(savedSketchesJSON || '{}');

            if (allSketches[sketchName]) {
                allSketches[sketchName].data = snapshot;
                allSketches[sketchName].savedAt = new Date().toISOString();
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allSketches));
                alert(`Sketch "${sketchName}" updated successfully!`);
            } else {
                console.error('Could not find sketch to overwrite. Forcing "Save As"...');
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
            AppState.restoreStateSnapshot(sketchToLoad.data);
            AppState.currentSketchId = sketchToLoad.id;
            AppState.currentSketchName = sketchToLoad.name;
            CanvasManager.redraw();
            AppState.emit('app:sketchLoaded');
        } else {
            alert(`Error: Could not find sketch with ID: ${sketchIdToLoad}`);
        }
    }
}