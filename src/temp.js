// UPDATE the displaySavedSketches function in index.html to show report types:

async function displaySavedSketches() {
    const listContainer = document.getElementById('savedSketchesList');
    
    try {
        // Fetch all sketches from the 'sketches' object store, order by savedAt descending.
        const allSketches = await db.sketches.orderBy('savedAt').reverse().toArray();

        if (allSketches.length === 0) {
            listContainer.innerHTML = '<h2 style="text-align: center; margin-bottom: 1rem; color: #555;">Saved Sketches</h2><p style="text-align: center; color: #888;">No saved sketches found.</p>';
            return;
        }

        let html = '<h2 style="text-align: center; margin-bottom: 1rem; color: #555;">Saved Sketches</h2>';
        html += '<ul style="list-style: none; padding: 0; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">';

        for (const sketch of allSketches) {
            const savedDate = new Date(sketch.savedAt).toLocaleString();
            const loadUrl = `sketcher.html?loadSketch=${sketch.id}`;
            
            // Get report types from the sketch data
            let reportTypes = [];
            if (sketch.data && sketch.data.reportTypes) {
                if (sketch.data.reportTypes.exteriorOnly) reportTypes.push('Exterior-Only');
                if (sketch.data.reportTypes.fullInspection) reportTypes.push('Full-Inspection');
                if (sketch.data.reportTypes.fha) reportTypes.push('FHA');
            }
            
            // Format report types display
            let reportTypeDisplay = '';
            if (reportTypes.length > 0) {
                reportTypeDisplay = `<div style="font-size: 11px; color: #3498db; font-weight: 500; margin-top: 2px;">
                    ${reportTypes.join(' • ')}
                </div>`;
            }

            html += `<li style="display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid #eee;">
                        <div>
                            <strong style="color: #333;">${sketch.name}</strong>
                            <div style="font-size: 12px; color: #777;">Saved: ${savedDate}</div>
                            ${reportTypeDisplay}
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <a href="#" onclick="loadApp('${loadUrl}'); return false;" class="list-btn load-btn">Load</a>
                            <button onclick="exportSketch(${sketch.id}, '${sketch.name}')" class="list-btn export-btn">Save to Device</button>
                            <button onclick="deleteSketch(${sketch.id})" class="list-btn delete-btn">Delete</button>
                        </div>
                    </li>`;
        }

        html += '</ul>';
        listContainer.innerHTML = html;

    } catch (error) {
        console.error("Failed to display sketches from IndexedDB:", error);
        listContainer.innerHTML = '<h2 style="text-align: center; margin-bottom: 1rem; color: #555;">Error</h2><p style="text-align: center; color: #c00;">Could not load saved sketches from the database.</p>';
    }
}

// Also update the SaveManager to ensure report types are properly saved
// Add this to the _performSaveAs method in SaveManager:

async _performSaveAs(sketchName) {
    console.log(`Saving sketch with photos as "${sketchName}" to IndexedDB`);
    
    try {
        const snapshot = this.getEnhancedStateSnapshot();
        
        const newSketchEntry = {
            name: sketchName,
            savedAt: new Date().toISOString(),
            data: snapshot, // This now includes reportTypes
            // Add metadata for quick reference without loading full data
            metadata: {
                photoCount: snapshot.photos.length,
                totalPhotoSizeKB: Math.round(snapshot.metadata.totalPhotoSize / 1024),
                version: snapshot.metadata.exportVersion,
                reportTypes: snapshot.reportTypes // Store report types in metadata too for easy access
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
        
        // Include report types in the success message
        const reportTypesInfo = [];
        if (snapshot.reportTypes.exteriorOnly) reportTypesInfo.push('Exterior-Only');
        if (snapshot.reportTypes.fullInspection) reportTypesInfo.push('Full-Inspection');
        if (snapshot.reportTypes.fha) reportTypesInfo.push('FHA');
        const reportTypeText = reportTypesInfo.length > 0 ? ` [${reportTypesInfo.join(', ')}]` : '';
        
        alert(`Sketch "${sketchName}" saved successfully!${reportTypeText}${photoInfo}`);

    } catch (error) {
        console.error('Failed to save sketch with photos to IndexedDB:', error);
        if (error.name === 'ConstraintError') {
            alert('A sketch with this name already exists. Please choose a different name.');
        } else {
            alert('An error occurred while saving.');
        }
    }
}