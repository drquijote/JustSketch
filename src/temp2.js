performSplit(graphData) {
    AppState.emit('app:exitDrawingMode');

    this.isProcessingSplit = true;
    try {
        const originalPolygonsMap = new Map();
        graphData.connectedPolygons.forEach(p => {
            originalPolygonsMap.set(this.getCanonicalPathID(p.path), p);
        });
        
        // Remove original polygons from the drawn list
        graphData.connectedPolygons.forEach(polygon => {
            const index = AppState.drawnPolygons.indexOf(polygon);
            if (index > -1) AppState.drawnPolygons.splice(index, 1);
        });
        
        // Remove associated area labels
        const polygonIds = graphData.connectedPolygons.map(p => p.id);
        AppState.placedElements = AppState.placedElements.filter(el => 
            !(el.type === 'area_label' && polygonIds.includes(el.linkedPolygonId))
        );
        
        const junctionVertices = this.findJunctionVertices(graphData);
        if (junctionVertices.length !== 2) throw new Error(`Expected 2 junction vertices, found ${junctionVertices.length}`);
        
        const paths = this.findAllPathsBetweenJunctions(graphData, junctionVertices);
        if (paths.length !== 3) throw new Error(`Expected 3 paths, found ${paths.length}`);

        // --- NEW LOGIC TO PROPERLY CUT OUT AREAS ---
        
        console.log('🔪 SPLIT: Found 3 paths between junction vertices');
        
        // When splitting a polygon, we have:
        // - One original polygon that's being split
        // - A split line that was drawn to divide it
        // The 3 paths represent: 2 parts of the original perimeter + the split line
        
        // First, we need to identify which path is the split line
        // The split line is typically the path that has the fewest vertices from the original polygon
        
        let splitLineIndex = -1;
        let minOriginalVertices = Infinity;
        
        // For each path, count how many vertices belong to the original polygon(s)
        paths.forEach((path, pathIndex) => {
            let originalVertexCount = 0;
            
            path.forEach(vertex => {
                // Check if this vertex belongs to any original polygon
                for (const polygon of graphData.connectedPolygons) {
                    if (polygon.path.some(p => 
                        Math.abs(p.x - vertex.x) < 0.1 && 
                        Math.abs(p.y - vertex.y) < 0.1
                    )) {
                        originalVertexCount++;
                        break;
                    }
                }
            });
            
            console.log(`🔪 SPLIT: Path ${pathIndex} has ${originalVertexCount} original vertices out of ${path.length} total`);
            
            // The path with the least original vertices is likely the split line
            if (originalVertexCount < minOriginalVertices) {
                minOriginalVertices = originalVertexCount;
                splitLineIndex = pathIndex;
            }
        });
        
        // If we couldn't clearly identify the split line, use the shortest path
        if (splitLineIndex === -1 || minOriginalVertices === paths[0].length) {
            splitLineIndex = this.identifySharedPath(paths, graphData);
        }
        
        console.log(`🔪 SPLIT: Identified path ${splitLineIndex} as the split line`);
        
        // Now we construct only 2 polygons (not 3!)
        // We'll combine each perimeter part with the split line
        
        const splitPath = paths[splitLineIndex];
        const perimeterPaths = paths.filter((_, idx) => idx !== splitLineIndex);
        
        // Construct the two polygons
        const polygon1 = this.constructPolygonFromPaths(perimeterPaths[0], splitPath);
        const polygon2 = this.constructPolygonFromPaths(perimeterPaths[1], splitPath);
        
        // Calculate areas
        const area1 = this.calculateArea(polygon1);
        const area2 = this.calculateArea(polygon2);
        
        console.log(`🔪 SPLIT: Created two polygons with areas ${area1.toFixed(1)} and ${area2.toFixed(1)} sq ft`);
        
        // Check if either polygon matches an original
        const polygon1ID = this.getCanonicalPathID(polygon1);
        const polygon2ID = this.getCanonicalPathID(polygon2);
        
        const matchedOriginal1 = originalPolygonsMap.get(polygon1ID);
        const matchedOriginal2 = originalPolygonsMap.get(polygon2ID);
        
        if ((matchedOriginal1 && !matchedOriginal2) || (!matchedOriginal1 && matchedOriginal2)) {
            // One polygon is unchanged (this shouldn't happen in a proper split)
            console.log('✅ SPLIT: Detected one unchanged polygon. Entering single-prompt mode.');
            
            const unchangedPolygon = matchedOriginal1 || matchedOriginal2;
            const newPath = matchedOriginal1 ? polygon2 : polygon1;
            
            AppState.drawnPolygons.push(unchangedPolygon);
            this.createAreaLabelElement(unchangedPolygon);
            
            const area = this.calculateArea(newPath);
            const newPolygonToClassify = this.createPolygonFromCycle(newPath, area, 'New Area');
            AppState.drawnPolygons.push(newPolygonToClassify);
            
            // Show modal for classification
            this.showSingleAreaModal(newPolygonToClassify, area);
            
        } else {
            // Both areas are new (normal case for splitting)
            console.log('✅ SPLIT: Two new areas created. Entering two-prompt mode.');
            
            // Determine which is the larger area (likely the main floor)
            // and which is smaller (likely the garage being cut out)
            const largerPolygon = this.createPolygonFromCycle(
                area1 >= area2 ? polygon1 : polygon2, 
                Math.max(area1, area2), 
                'Area 1'
            );
            const smallerPolygon = this.createPolygonFromCycle(
                area1 < area2 ? polygon2 : polygon1, 
                Math.min(area1, area2), 
                'Area 2'
            );
            
            this.pendingSecondArea = smallerPolygon;
            AppState.currentPolygonPoints = [];
            AppState.currentPolygonCounter = 0;
            
            CanvasManager.redraw();
            this.showFirstAreaModal(largerPolygon, largerPolygon.area);
        }
    } catch (error) {
        console.error('🔥 SPLIT: Error during split:', error);
        this.isProcessingSplit = false;
    }
}

// Helper function to construct a polygon from perimeter and split paths
constructPolygonFromPaths(perimeterPath, splitPath) {
    console.log(`🔪 SPLIT: Constructing polygon from perimeter (${perimeterPath.length} vertices) and split (${splitPath.length} vertices)`);
    
    // Start with the perimeter path
    const polygon = [...perimeterPath];
    
    // Add the split path in reverse (excluding endpoints to avoid duplicates)
    // The endpoints are the junction vertices that connect to the perimeter
    for (let i = splitPath.length - 2; i >= 1; i--) {
        polygon.push(splitPath[i]);
    }
    
    console.log(`🔪 SPLIT: Constructed polygon with ${polygon.length} vertices`);
    return polygon;
}

// Add this helper function for showing single area modal
showSingleAreaModal(newPolygonToClassify, area) {
    const modal = document.getElementById('polygonModal');
    const nameInput = document.getElementById('polygonName');
    const typeSelect = document.getElementById('polygonType');
    const includeInGLACheckbox = document.getElementById('includeInGLA');
    const modalTitle = modal.querySelector('h3');
    const saveBtn = modal.querySelector('.btn-primary');
    const cancelBtn = modal.querySelector('.btn-secondary');

    modalTitle.textContent = `Classify Your New Area of ${area.toFixed(1)} sq ft`;
    const defaultType = 'garage'; // Default to garage for split areas
    typeSelect.value = defaultType;
    nameInput.value = AreaManager.generateAreaLabel(defaultType);
    
    const syncGlaCheckbox = () => {
        if (!includeInGLACheckbox) return;
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        includeInGLACheckbox.checked = parseInt(selectedOption.getAttribute('data-gla'), 10) === 1;
    };
    typeSelect.onchange = () => {
        nameInput.value = AreaManager.generateAreaLabel(typeSelect.value);
        syncGlaCheckbox();
    };
    syncGlaCheckbox();
    
    saveBtn.onclick = () => {
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        newPolygonToClassify.label = nameInput.value.trim();
        newPolygonToClassify.type = typeSelect.value;
        newPolygonToClassify.glaType = parseInt(selectedOption.getAttribute('data-gla'), 10);
        modal.classList.add('hidden');
        this.finalizeSplit();
    };

    cancelBtn.onclick = () => this.handleSplitCancel();
    modal.classList.remove('hidden');
    nameInput.focus();
}