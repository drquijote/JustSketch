// src/saveManager.js - UPDATED TO INCLUDE PHOTOS IN JSON

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { db } from './db.js';

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
        console.log('SaveManager initialized for IndexedDB with photo support.');
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
     * UPDATED: Enhanced state snapshot that includes photos
     */
   

    /**
     * Calculate approximate total size of photos in bytes
     */
    _calculatePhotoSize() {
        if (!AppState.photos || AppState.photos.length === 0) return 0;
        
        return AppState.photos.reduce((total, photo) => {
            // Rough estimation: base64 data URL length correlates to byte size
            const imageSize = photo.imageData ? photo.imageData.length * 0.75 : 0;
            const thumbSize = photo.thumbnailData ? photo.thumbnailData.length * 0.75 : 0;
            return total + imageSize + thumbSize;
        }, 0);
    }

    /**
     * UPDATED: Saves a sketch with photos to IndexedDB
     */
    async _performSaveAs(sketchName) {
        console.log(`Saving sketch with photos as "${sketchName}" to IndexedDB`);
        
        try {
            const snapshot = this.getEnhancedStateSnapshot();
            
            const newSketchEntry = {
                name: sketchName,
                savedAt: new Date().toISOString(),
                data: snapshot,
                // Add metadata for quick reference without loading full data
                metadata: {
                    photoCount: snapshot.photos.length,
                    totalPhotoSizeKB: Math.round(snapshot.metadata.totalPhotoSize / 1024),
                    version: snapshot.metadata.exportVersion
                }
            };

            // Use Dexie's put() method to add the new sketch.
            const id = await db.sketches.put(newSketchEntry);
            
            // Update the app's state to reflect the newly saved sketch.
            AppState.currentSketchId = id;
            AppState.currentSketchName = newSketchEntry.name;

            this.hideSaveModal();
            
            const photoInfo = snapshot.photos.length > 0 
                ? ` (includes ${snapshot.photos.length} photos, ~${Math.round(snapshot.metadata.totalPhotoSize / 1024)}KB)`
                : '';
            
            alert(`Sketch "${sketchName}" saved successfully!${photoInfo}`);

        } catch (error) {
            console.error('Failed to save sketch with photos to IndexedDB:', error);
            if (error.name === 'ConstraintError') {
                alert('A sketch with this name already exists. Please choose a different name.');
            } else {
                alert('An error occurred while saving.');
            }
        }
    }
    
    /**
     * UPDATED: Overwrites with photos included
     */
    async _performOverwrite() {
        const sketchId = AppState.currentSketchId;
        if (!sketchId) {
            console.error('Cannot overwrite: No sketch is currently loaded.');
            this.promptForNewName();
            return;
        }

        console.log(`Overwriting sketch ID: "${sketchId}" with photos`);
        try {
            const snapshot = this.getEnhancedStateSnapshot();

            // Use Dexie's update() method to modify the record by its primary key.
            await db.sketches.update(sketchId, {
                data: snapshot,
                savedAt: new Date().toISOString(),
                metadata: {
                    photoCount: snapshot.photos.length,
                    totalPhotoSizeKB: Math.round(snapshot.metadata.totalPhotoSize / 1024),
                    version: snapshot.metadata.exportVersion
                }
            });

            const photoInfo = snapshot.photos.length > 0 
                ? ` (${snapshot.photos.length} photos included)`
                : '';

            alert(`Sketch "${AppState.currentSketchName}" updated successfully!${photoInfo}`);
        } catch (error) {
            console.error('Failed to overwrite sketch:', error);
            alert('An error occurred while saving.');
        }
    }
    
    /**
     * UPDATED: Loads a sketch with photos from IndexedDB
     */
  // src/saveManager.js

    async loadSketchFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const sketchIdToLoad = parseInt(urlParams.get('loadSketch'), 10);

        if (!sketchIdToLoad) return;

        try {
            const sketchToLoad = await db.sketches.get(sketchIdToLoad);

            if (sketchToLoad) {
                console.log(`Loading sketch with photos: "${sketchToLoad.name}"`);
                
                // Restore the enhanced state including photos
                this.restoreEnhancedStateSnapshot(sketchToLoad.data);
                
                // Update app state to know which sketch is loaded
                AppState.currentSketchId = sketchToLoad.id;
                AppState.currentSketchName = sketchToLoad.name;

                //
                // ***** FIX: ADD THIS LINE *****
                // This synchronizes the visual CSS transform with the newly loaded state.
                CanvasManager.updateViewportTransform();
                // ***** END FIX *****
                //

                CanvasManager.redraw();
                AppState.emit('app:sketchLoaded');
                
                // Log photo loading success
                const photoCount = AppState.photos ? AppState.photos.length : 0;
                if (photoCount > 0) {
                    console.log(`Successfully loaded ${photoCount} photos with sketch.`);
                }
                
            } else {
                alert(`Error: Could not find sketch with ID: ${sketchIdToLoad}`);
            }
        } catch (error) {
            console.error('Failed to load sketch from DB:', error);
            alert('An error occurred while loading the sketch.');
        }
    }
 

 getEnhancedStateSnapshot() {
    const standardSnapshot = AppState.getStateSnapshot();
    
    // Get report type values from checkboxes
    const reportTypes = {
        exteriorOnly: document.getElementById('exteriorOnlyCheckbox')?.checked || false,
        fullInspection: document.getElementById('fullInspectionCheckbox')?.checked || false,
        fha: document.getElementById('fhaCheckbox')?.checked || false
    };
    
    // Add photos and report types to the snapshot
    const enhancedSnapshot = {
        ...standardSnapshot,
        photos: AppState.photos || [],
        reportTypes: reportTypes, // NEW: Add report types
        metadata: {
            ...standardSnapshot.metadata,
            photoCount: AppState.photos ? AppState.photos.length : 0,
            totalPhotoSize: AppState.photos ? this._calculatePhotoSize() : 0, // Use the existing method
            exportVersion: '2.0'
        }
    };
    
    return enhancedSnapshot;
}

// Also update the restoreEnhancedStateSnapshot method to restore these values:
restoreEnhancedStateSnapshot(data) {
    // First restore the standard state
    AppState.restoreStateSnapshot(data);
    
    // Then handle photos if they exist
    if (data.photos && Array.isArray(data.photos)) {
        AppState.photos = data.photos;
        console.log(`Restored ${data.photos.length} photos from saved data.`);
    } else {
        AppState.photos = [];
        console.log('No photos found in saved data, initialized empty photos array.');
    }
    
    // Restore report types if they exist
    if (data.reportTypes) {
        // Store in AppState for reference
        AppState.reportTypes = data.reportTypes;
        console.log('Restored report types:', data.reportTypes);
    }
    
    // Handle version compatibility
    if (data.metadata && data.metadata.exportVersion) {
        console.log(`Loading sketch data version: ${data.metadata.exportVersion}`);
    }
}





    /**
     * NEW: Export sketch with photos to JSON file
     */
    /**
     * NEW: Export sketch with photos to JSON file - USES SHARED UTILITY
     */
    exportSketchToJSON() {
        // Use the shared export utility for consistency
        import('./exportUtils.js').then(({ ExportUtils }) => {
            ExportUtils.exportCurrentSketch(
                AppState.currentSketchName || 'Untitled Sketch',
                AppState
            );
        }).catch(error => {
            console.error('Failed to load export utility:', error);
            // Fallback to original method if import fails
            this._fallbackExportSketchToJSON();
        });
    }

    /**
     * Fallback export method (original logic)
     * @private
     */
    _fallbackExportSketchToJSON() {
        const snapshot = this.getEnhancedStateSnapshot();
        
        const sketchData = {
            version: '2.0',
            createdAt: new Date().toISOString(),
            application: 'Floor Plan Sketcher',
            data: snapshot,
            metadata: {
                name: AppState.currentSketchName || 'Untitled Sketch',
                photoCount: snapshot.photos.length,
                totalPhotoSizeKB: Math.round(snapshot.metadata.totalPhotoSize / 1024),
                exportFormat: 'JSON with embedded photos'
            }
        };
        
        const jsonString = JSON.stringify(sketchData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        
        const filename = AppState.currentSketchName 
            ? `${AppState.currentSketchName.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`
            : `sketch-data-${Date.now()}.json`;
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        const photoInfo = snapshot.photos.length > 0 
            ? ` (includes ${snapshot.photos.length} photos, ~${Math.round(snapshot.metadata.totalPhotoSize / 1024)}KB)`
            : '';
        
        console.log(`Exported sketch to JSON${photoInfo}`);
    }


/**
     * DEBUG: Method to verify photos are properly loaded after import
     * Call this in console to check photo status: window.photoManager.debugPhotoStatus()
     */
    debugPhotoStatus() {
        console.log('=== PHOTO DEBUG STATUS ===');
        console.log(`Total photos in AppState: ${AppState.photos ? AppState.photos.length : 0}`);
        
        if (!AppState.photos || AppState.photos.length === 0) {
            console.log('❌ No photos found in AppState');
            return;
        }
        
        // Group photos by element
        const photosByElement = {};
        AppState.photos.forEach(photo => {
            if (!photosByElement[photo.elementId]) {
                photosByElement[photo.elementId] = [];
            }
            photosByElement[photo.elementId].push(photo);
        });
        
        console.log(`📸 Photos found for ${Object.keys(photosByElement).length} elements:`);
        Object.keys(photosByElement).forEach(elementId => {
            const photos = photosByElement[elementId];
            console.log(`   Element ${elementId}: ${photos.length} photo(s)`);
            photos.forEach((photo, index) => {
                console.log(`     Photo ${index + 1}: ${photo.imageData ? 'Image data OK' : 'Missing image data'}, ${photo.thumbnailData ? 'Thumbnail OK' : 'Missing thumbnail'}`);
            });
        });
        
        console.log(`Current mode: ${AppState.currentMode}`);
        console.log(`Active element: ${this.activeElement ? this.activeElement.id : 'None'}`);
        
        if (AppState.currentMode === 'photos' && this.activeElement) {
            const elementPhotos = AppState.photos.filter(p => p.elementId === this.activeElement.id);
            console.log(`Photos for current active element: ${elementPhotos.length}`);
        }
        
        console.log('=== END PHOTO DEBUG ===');
        
        return {
            totalPhotos: AppState.photos.length,
            photosByElement,
            currentMode: AppState.currentMode,
            activeElement: this.activeElement?.id || null
        };
    }

/**
     * Helper function to group photos by element for debugging
     */
    _groupPhotosByElement(photos) {
        const grouped = {};
        photos.forEach(photo => {
            if (!grouped[photo.elementId]) {
                grouped[photo.elementId] = [];
            }
            grouped[photo.elementId].push(photo);
        });
        return grouped;
    }
    /**
     * Helper method to manually trigger photo display refresh
     */
    refreshPhotoDisplay() {
        if (AppState.currentMode === 'photos' && this.activeElement) {
            console.log('🔄 Manually refreshing photo display...');
            this.loadAndDisplayThumbnails();
        } else {
            console.log('ℹ️ Not in photos mode or no active element selected');
        }
    }
        importSketchFromJSON(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                
                // Validate the imported data
                if (!importedData.data) {
                    throw new Error('Invalid sketch file: missing data structure.');
                }
                
                // Check version compatibility
                const dataVersion = importedData.version || importedData.data.metadata?.exportVersion || '1.0';
                console.log(`Importing sketch data version: ${dataVersion}`);
                
                // Handle different versions
                if (dataVersion === '1.0') {
                    // Legacy format without photos
                    AppState.restoreStateSnapshot(importedData.data);
                    AppState.photos = []; // Initialize empty photos array
                    console.log('Imported legacy sketch without photos.');
                } else {
                    // Version 2.0+ with photos
                    this.restoreEnhancedStateSnapshot(importedData.data);
                    console.log(`Imported enhanced sketch with ${AppState.photos.length} photos.`);
                }
                
                // Update helper points and redraw
                if (window.HelperPointManager) {
                    window.HelperPointManager.updateHelperPoints();
                }
                CanvasManager.updateViewportTransform();
                CanvasManager.redraw();
                CanvasManager.saveAction();
                
                // CRITICAL FIX: Notify PhotoManager that photos have been imported
                if (AppState.photos && AppState.photos.length > 0) {
                    console.log('🔄 Notifying PhotoManager about imported photos...');
                    AppState.emit('photos:imported', { 
                        photoCount: AppState.photos.length,
                        photosByElement: this._groupPhotosByElement(AppState.photos)
                    });
                }
                
                // Show success message with photo info
                const photoInfo = AppState.photos && AppState.photos.length > 0 
                    ? ` (${AppState.photos.length} photos included)`
                    : '';
                
                alert(`Sketch imported successfully!${photoInfo}`);
                
            } catch (error) {
                console.error('Error during import:', error);
                alert(`Failed to import sketch. ${error.message}`);
            }
        };
        
        reader.onerror = () => alert('An error occurred while trying to read the file.');
        reader.readAsText(file);
    }
}