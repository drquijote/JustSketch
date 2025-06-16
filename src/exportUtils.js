// src/exportUtils.js - Shared export functionality for both index.html and sketcher.html

/**
 * Shared export utility that handles both live sketches and saved sketches
 * This ensures both index.html and sketcher.html use identical export logic
 */
export class ExportUtils {
    
    /**
     * Export a sketch from the current AppState (used by sketcher.html)
     * @param {string} sketchName - Name for the exported file
     * @param {Object} appState - Current application state with photos
     */
    static exportCurrentSketch(sketchName, appState) {
        const snapshot = this._createEnhancedSnapshot(appState);
        
        const sketchData = {
            version: '2.0',
            createdAt: new Date().toISOString(),
            application: 'Floor Plan Sketcher',
            data: snapshot,
            metadata: {
                name: sketchName || 'Untitled Sketch',
                photoCount: snapshot.photos.length,
                totalPhotoSizeKB: Math.round(this._calculatePhotoSize(snapshot.photos) / 1024),
                exportFormat: 'JSON with embedded photos'
            }
        };
        
        const filename = sketchName 
            ? `${sketchName.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`
            : `sketch-data-${Date.now()}.json`;
        
        this._triggerDownload(sketchData, filename);
        
        const photoInfo = snapshot.photos.length > 0 
            ? ` (includes ${snapshot.photos.length} photos, ~${Math.round(this._calculatePhotoSize(snapshot.photos) / 1024)}KB)`
            : '';
        
        console.log(`✅ Exported current sketch to JSON${photoInfo}`);
        return sketchData;
    }
    
    /**
     * Export a saved sketch from IndexedDB (used by index.html)
     * @param {Object} sketchEntry - Sketch entry from IndexedDB
     * @param {string} sketchName - Name for the exported file
     */
    static exportSavedSketch(sketchEntry, sketchName) {
        // Check if the sketch data already includes photos
        const hasPhotos = sketchEntry.data.photos && sketchEntry.data.photos.length > 0;
        const dataVersion = sketchEntry.data.metadata?.exportVersion || (hasPhotos ? '2.0' : '1.0');

        let fileData;
        
        if (dataVersion === '2.0' || hasPhotos) {
            // Version 2.0 format with photos
            fileData = {
                version: '2.0',
                createdAt: sketchEntry.savedAt,
                application: 'Floor Plan Sketcher',
                data: sketchEntry.data,
                metadata: {
                    name: sketchName,
                    photoCount: sketchEntry.data.photos ? sketchEntry.data.photos.length : 0,
                    totalPhotoSizeKB: sketchEntry.metadata?.totalPhotoSizeKB || 0,
                    exportFormat: 'JSON with embedded photos'
                }
            };
            
            console.log(`Exporting saved sketch "${sketchName}" as version 2.0 with ${fileData.metadata.photoCount} photos`);
        } else {
            // Legacy version 1.0 format (backward compatibility)
            fileData = {
                version: '1.0',
                createdAt: sketchEntry.savedAt,
                data: sketchEntry.data
            };
            
            console.log(`Exporting saved sketch "${sketchName}" as legacy version 1.0 (no photos)`);
        }

        const fileName = `${sketchName.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`;
        this._triggerDownload(fileData, fileName);

        // Show export info
        const photoInfo = fileData.metadata?.photoCount > 0 
            ? ` (includes ${fileData.metadata.photoCount} photos)`
            : '';
        
        console.log(`✅ Saved sketch exported successfully${photoInfo}`);
        return fileData;
    }
    
    /**
     * Create enhanced snapshot with photos (matches SaveManager logic)
     * @private
     */
    static _createEnhancedSnapshot(appState) {
        const standardSnapshot = appState.getStateSnapshot();
        
        return {
            ...standardSnapshot,
            photos: appState.photos || [],
            metadata: {
                ...standardSnapshot.metadata,
                photoCount: appState.photos ? appState.photos.length : 0,
                totalPhotoSize: this._calculatePhotoSize(appState.photos || []),
                exportVersion: '2.0',
                exportDate: new Date().toISOString()
            }
        };
    }
    
    /**
     * Calculate approximate total size of photos in bytes
     * @private
     */
    static _calculatePhotoSize(photos) {
        if (!photos || photos.length === 0) return 0;
        
        return photos.reduce((total, photo) => {
            const imageSize = photo.imageData ? photo.imageData.length * 0.75 : 0;
            const thumbSize = photo.thumbnailData ? photo.thumbnailData.length * 0.75 : 0;
            return total + imageSize + thumbSize;
        }, 0);
    }
    
    /**
     * Trigger file download
     * @private
     */
    static _triggerDownload(dataObject, fileName) {
        const jsonString = JSON.stringify(dataObject, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}