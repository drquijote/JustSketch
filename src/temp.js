// STEP 1: Add this helper function to sketch.js (place it near the top with other helper functions)

/**
 * Helper function to check if an element has any photos
 * @param {Object} element - The room/icon element to check
 * @returns {boolean} - True if element has photos
 */
function elementHasPhotos(elementId) {
    if (!AppState.photos || !Array.isArray(AppState.photos)) {
        return false;
    }
    return AppState.photos.some(photo => photo.elementId === elementId);
}

// STEP 2: REPLACE the entire redrawPlacedElements function in sketch.js with this updated version:

function redrawPlacedElements() {
    ctx.save();
    
    AppState.placedElements.forEach((element, index) => {
        ctx.save();

        if (AppState.activePhotoElement && AppState.activePhotoElement.id === element.id) {
            ctx.strokeStyle = '#8e44ad';
            ctx.lineWidth = 3;
            ctx.strokeRect(element.x - 2, element.y - 2, element.width + 4, element.height + 4);
        }

        if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
            ctx.globalAlpha = 0.3;
        }

        if (element.type === 'room' || element.type === 'area_label') {
            // Check if we should gray out this element (in photo mode and has photos)
            const shouldGrayOut = AppState.currentMode === 'photos' && elementHasPhotos(element.id);
            
            if (element.type === 'area_label') {
                const linkedPolygon = AppState.drawnPolygons.find(p => p.id === element.linkedPolygonId);
                if (linkedPolygon) {
                    element.areaData.sqftText = `${linkedPolygon.area.toFixed(1)} sq ft`;
                    element.areaData.areaText = linkedPolygon.label;
                }
                ctx.fillStyle = shouldGrayOut ? '#666666' : (element.styling.color || '#000');
                ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                if (element.type === 'area_label') {
                    ctx.fillText(element.areaData.sqftText, element.x, element.y);
                    ctx.fillText(element.areaData.areaText, element.x, element.y + 16);
                } else {
                    ctx.fillText(element.content, element.x + element.width / 2, element.y + element.height / 2);
                }
            } else {
                // Apply gray background if element has photos and we're in photo mode
                ctx.fillStyle = shouldGrayOut ? '#9e9e9e' : (element.styling.backgroundColor || '#3498db');
                ctx.fillRect(element.x, element.y, element.width, element.height);
                
                if (element.styling.borderRadius && element.styling.borderRadius !== '0px') {
                    const radius = parseInt(element.styling.borderRadius) || 4;
                    ctx.beginPath();
                    ctx.moveTo(element.x + radius, element.y);
                    ctx.lineTo(element.x + element.width - radius, element.y);
                    ctx.quadraticCurveTo(element.x + element.width, element.y, element.x + element.width, element.y + radius);
                    ctx.lineTo(element.x + element.width, element.y + element.height - radius);
                    ctx.quadraticCurveTo(element.x + element.width, element.y + element.height, element.x + element.width - radius, element.y + element.height);
                    ctx.lineTo(element.x + radius, element.y + element.height);
                    ctx.quadraticCurveTo(element.x, element.y + element.height, element.x, element.y + element.height - radius);
                    ctx.lineTo(element.x, element.y + radius);
                    ctx.quadraticCurveTo(element.x, element.y, element.x + radius, element.y);
                    ctx.closePath();
                    ctx.fill();
                }
                
                ctx.fillStyle = shouldGrayOut ? '#f5f5f5' : (element.styling.color || 'white');
                ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(element.content, element.x + element.width / 2, element.y + element.height / 2);
            }
            
            if (isEditMode && AppState.editSubMode === 'labels' && (element.type === 'room' || element.type === 'area_label')) {
                const iconSize = 24;
                const padding = 6;
                const elementCenterY = element.y + element.height / 2;
                const editX = element.x - iconSize - padding;
                const editY = elementCenterY - (iconSize / 2);
                const deleteX = element.x + element.width + padding;
                const deleteY = elementCenterY - (iconSize / 2);
                
                ctx.fillStyle = '#3498db';
                ctx.fillRect(editX, editY, iconSize, iconSize);
                ctx.fillStyle = 'white';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('✏', editX + iconSize/2, editY + iconSize/2);
                
                ctx.strokeStyle = '#e74c3c';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(deleteX + iconSize/2, deleteY + iconSize/2, iconSize/2, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                const crossOffset = 7;
                const crossCenterX = deleteX + iconSize/2;
                const crossCenterY = deleteY + iconSize/2;
                ctx.beginPath();
                ctx.moveTo(crossCenterX - crossOffset, crossCenterY - crossOffset);
                ctx.lineTo(crossCenterX + crossOffset, crossCenterY + crossOffset);
                ctx.moveTo(crossCenterX + crossOffset, crossCenterY - crossOffset);
                ctx.lineTo(crossCenterX - crossOffset, crossCenterY + crossOffset);
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
                drawIconEditHighlight(element);
            };
            
            if (!AppState.imageCache[element.content]) {
                const img = new Image();
                img.onload = () => { AppState.imageCache[element.content] = img; CanvasManager.redraw(); };
                img.src = element.content;
            } else {
                drawRotatedIcon(AppState.imageCache[element.content]);
            }
        }
        
        // DRAW PHOTO CHECKMARK - NEW CODE
        // Only show checkmark in photos mode and if element has photos
        if (AppState.currentMode === 'photos' && elementHasPhotos(element.id)) {
            // Draw checkmark indicator - positioned at upper right corner, just touching
            const checkSize = 20;
            const checkX = element.x + element.width - checkSize/2;
            const checkY = element.y - checkSize/2;
            
            // Green circle background
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.arc(checkX, checkY, checkSize/2, 0, Math.PI * 2);
            ctx.fill();
            
            // White checkmark
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(checkX - 5, checkY);
            ctx.lineTo(checkX - 1, checkY + 5);
            ctx.lineTo(checkX + 5, checkY - 5);
            ctx.stroke();
        }
        
        ctx.restore();
    });
    
    ctx.restore();
    updateLegend();
}

// STEP 3: Add this CSS to your style.css file for visual polish (optional but recommended):

/*
.photo-checkmark {
    position: absolute;
    width: 20px;
    height: 20px;
    background-color: #27ae60;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
*/