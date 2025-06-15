// In sketch.js, replace the entire initSketchModule function with this one.
function initSketchModule() {
    console.log('DEBUG: initSketchModule() called');
    
    canvas = AppState.canvas;
    ctx = AppState.ctx;
    
    AppState.placedElements = placedElements;
    AppState.actionHistory = actionHistory;
    AppState.historyIndex = historyIndex;
    AppState.viewportTransform = viewportTransform;
    
    // NEW: Listen for edit mode toggles to set local isEditMode variable
    AppState.on('mode:editToggled', (e) => {
        isEditMode = e.detail.isEditMode;
        console.log('Sketch.js: isEditMode set to', isEditMode);
        
        // When exiting any edit mode, clean up editing states
        if (!isEditMode) {
            if (editingIcon) finishIconEditing();
            if (editingElement) finishEditing();
        }
    });
    
    activateSketchListeners();
    setTimeout(setupPaletteListeners, 100);
    CanvasManager.updateViewportTransform();
    
    AppState.on('canvas:redraw:elements', () => {
        redrawPlacedElements();
    });
    
    console.log('DEBUG: initSketchModule() completed');
}


// In sketch.js, replace the entire handleViewportMouseDown function with this one.
function handleViewportMouseDown(e) {
    if (e.button !== 0) return;

    const viewport = document.getElementById('canvasViewport');
    const rect = viewport.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) - AppState.viewportTransform.x;
    const canvasY = (e.clientY - rect.top) - AppState.viewportTransform.y;

    if (isEditMode && window.areaManager && window.areaManager.isDraggingArea) {
        return; // Let area manager handle it
    }
    
    const elementAtPoint = getElementAt(canvasX, canvasY);

    // MODIFIED: Allow element dragging only in 'placement' mode or 'edit labels' sub-mode
    if (elementAtPoint && !editingIcon) {
        if (AppState.currentMode === 'placement' || (AppState.currentMode === 'edit' && AppState.editSubMode === 'labels')) {
             isDragging = true;
             draggedElement = elementAtPoint;
             dragOffset.x = canvasX - draggedElement.x;
             dragOffset.y = canvasY - draggedElement.y;
             canvas.style.cursor = 'grabbing';
             return;
        }
    } 
    
    if (!selectedElement && !editingIcon && !isDragging) {
        isPanning = true;
        lastPanPoint = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
    }
}


// In sketch.js, replace the entire handleCanvasClick function with this one.
function handleCanvasClick(e) {
    const pos = getEventPos(e);

    // Logic for placing a new selected element
    if (selectedElement && !isPanning && !isDragging) {
        placeElement(pos.x, pos.y);
        return;
    } 
    
    // Logic for interacting with existing elements in Edit mode
    if (isEditMode && !isPanning && !isDragging) {
        const clickedElement = getElementAt(pos.x, pos.y);
        
        // MODIFIED: Only allow starting edits in 'labels' sub-mode
        if (clickedElement && AppState.editSubMode === 'labels') {
            e.preventDefault();
            e.stopPropagation();

            if (clickedElement.type === 'room' || clickedElement.type === 'area_label') {
                hideIconEditControls();
                startEditingElement(clickedElement);
            } else if (clickedElement.type === 'icon') {
                finishEditing(); // Finish text editing if any
                if (isMobileDevice()) {
                    showIconEditControls(clickedElement);
                } else {
                    editingIcon = clickedElement;
                    CanvasManager.redraw();
                }
            }
        } else {
            // If clicked elsewhere, or not in 'labels' sub-mode, finish any active editing.
            finishEditing();
            hideIconEditControls();
        }
    }
}


// In sketch.js, replace the entire getElementAt function with this one.
function getElementAt(x, y) {
    for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
        const element = AppState.placedElements[i];
        
        let isHit = (x >= element.x && x <= element.x + element.width && 
                     y >= element.y && y <= element.y + element.height);

        // Check for delete button clicks only in 'edit labels' mode
        if (isEditMode && AppState.editSubMode === 'labels' && (element.type === 'room' || element.type === 'area_label')) {
            const deleteSize = 20;
            const deleteX = element.x + element.width + 2;
            const deleteY = element.y - 2;
            const centerX = deleteX + deleteSize/2;
            const centerY = deleteY + deleteSize/2;
            const distance = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
            
            if (distance <= deleteSize/2) {
                deleteElement(element);
                return null; // Don't return the element, as it was just deleted
            }
        }
        
        if (isHit) {
            return element;
        }
    }
    return null;
}

// In sketch.js, replace the entire redrawPlacedElements function with this one.
function redrawPlacedElements() {
    ctx.save();
    
    AppState.placedElements.forEach((element, index) => {
        ctx.save();

        if (AppState.activePhotoElement && AppState.activePhotoElement.id === element.id) {
            ctx.strokeStyle = '#8e44ad';
            ctx.lineWidth = 3;
            ctx.strokeRect(element.x - 2, element.y - 2, element.width + 4, element.height + 4);
        }

        // NEW: If in 'edit areas' mode, make labels less prominent
        if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
            ctx.globalAlpha = 0.3;
        }

        if (element.type === 'room' || element.type === 'area_label') {
            // Common logic for labels
            if (element.type === 'area_label') {
                const linkedPolygon = AppState.drawnPolygons.find(p => p.id === element.linkedPolygonId);
                if (linkedPolygon) {
                    element.areaData.sqftText = `${linkedPolygon.area.toFixed(1)} sq ft`;
                    element.areaData.areaText = linkedPolygon.label;
                }
                ctx.fillStyle = element.styling.color || '#000';
                ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(element.areaData.areaText, element.x + element.width/2, element.y + element.height/2 - 8);
                ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
                ctx.fillText(element.areaData.sqftText, element.x + element.width/2, element.y + element.height/2 + 8);
            } else { // 'room' type
                const styling = element.styling;
                ctx.fillStyle = styling.backgroundColor || styling;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(element.x, element.y, element.width, element.height, 4);
                ctx.fill();
                ctx.stroke();
                
                if (element !== editingElement) {
                    ctx.fillStyle = styling.color || 'white';
                    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(element.content, element.x + element.width/2, element.y + element.height/2 + 4);
                }
            }
            
            // MODIFIED: Draw delete button (red X) ONLY in 'edit labels' mode
            if (isEditMode && AppState.editSubMode === 'labels' && element !== editingElement) {
                const deleteSize = 20;
                const deleteX = element.x + element.width + 2;
                const deleteY = element.y - 2;
                ctx.globalAlpha = 1.0; // Ensure delete button is fully opaque
                ctx.fillStyle = '#e74c3c';
                ctx.beginPath();
                ctx.arc(deleteX + deleteSize/2, deleteY + deleteSize/2, deleteSize/2, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(deleteX + deleteSize/2, deleteY + deleteSize/2, deleteSize/2, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                const offset = 6;
                const centerX = deleteX + deleteSize/2;
                const centerY = deleteY + deleteSize/2;
                ctx.beginPath();
                ctx.moveTo(centerX - offset, centerY - offset);
                ctx.lineTo(centerX + offset, centerY + offset);
                ctx.moveTo(centerX + offset, centerY - offset);
                ctx.lineTo(centerX - offset, centerY + offset);
                ctx.stroke();
            }
        } else if (element.type === 'icon') {
            const drawRotatedIcon = (img) => {
                ctx.save();
                if (element.rotation) {
                    const centerX = element.x + element.width / 2;
                    const centerY = element.y + element.height / 2;
                    ctx.translate(centerX, centerY);
                    ctx.rotate(element.rotation);
                    ctx.translate(-centerX, -centerY);
                }
                ctx.drawImage(img, element.x, element.y, element.width, element.height);
                ctx.restore();
                drawIconEditHandles(element);
            };
            
            if (!imageCache[element.content]) {
                const img = new Image();
                img.onload = () => { imageCache[element.content] = img; CanvasManager.redraw(); };
                img.src = element.content;
            } else {
                drawRotatedIcon(imageCache[element.content]);
            }
        }
        ctx.restore();
    });
    
    ctx.restore();
    updateLegend();
}


// In sketch.js, you no longer need the toggleEditMode function.
// You can remove it entirely.
