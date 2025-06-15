// src/sketch.js - COMPLETE FILE with unified slider controls for icon editing.
import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

let canvas, ctx;
let actionHistory = [];
let historyIndex = -1;
let selectedElement = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let placedElements = [];
let draggedElement = null;
let lastVisiblePalette = null;
let isEditMode = false;
let editingElement = null;
let editInput = null;

// Icon editing variables
let editingIcon = null;
// The 'isResizing', 'isRotating', and 'resizeHandle' variables are no longer used by the new system.
let isResizing = false;
let isRotating = false;
let resizeHandle = null;
let rotationStartAngle = 0;
let elementStartRotation = 0;
let originalIconProperties = null; // Used by sliders to reset the icon.

// Pan variables
let viewportTransform = {
    x: 0,
    y: 0,
    scale: 1
};
let isPanning = false;
let lastPanPoint = { x: 0, y: 0 };
let isGesturing = false;
let lastTouchCenter = { x: 0, y: 0 };

// Image cache to prevent reloading
const imageCache = {};

// Mobile detection
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
}

function initSketchModule() {
    console.log('DEBUG: initSketchModule() called');
    
    canvas = AppState.canvas;
    ctx = AppState.ctx;
    
    AppState.placedElements = placedElements;
    AppState.actionHistory = actionHistory;
    AppState.historyIndex = historyIndex;
    AppState.viewportTransform = viewportTransform;
    
    AppState.on('mode:editToggled', (e) => {
        isEditMode = e.detail.isEditMode;
        console.log('Sketch.js: isEditMode set to', isEditMode);
        
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

// MODIFIED: This function now calls drawIconEditHighlight() instead of drawIconEditHandles()
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
            } else { 
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
            
            if (isEditMode && AppState.editSubMode === 'labels' && element !== editingElement) {
                const deleteSize = 20;
                const deleteX = element.x + element.width + 2;
                const deleteY = element.y - 2;
                ctx.globalAlpha = 1.0;
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
                // THIS IS THE KEY CHANGE: Call the new highlight function
                drawIconEditHighlight(element);
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
 
function setupPaletteListeners() {
    console.log('Setting up palette listeners...');
    const roomLabels = document.querySelectorAll('.room-palette-label');
    const iconImages = document.querySelectorAll('.icon-palette-item img');
    
    roomLabels.forEach(label => {
        label.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const styles = getComputedStyle(label);
            const styling = {
                backgroundColor: styles.backgroundColor,
                color: styles.color,
                borderRadius: styles.borderRadius,
                border: styles.border,
                padding: styles.padding,
                className: label.className
            };
            selectElement('room', label.textContent, styling);
        });
    });
    
    iconImages.forEach(img => {
        img.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectElement('icon', img.src, null, img.alt);
        });
    });

    setupIconEditControls();
}

function setupIconEditControls() {
    const scaleSlider = document.getElementById('scaleSlider');
    const widthSlider = document.getElementById('widthSlider');
    const heightSlider = document.getElementById('heightSlider');
    const rotationSlider = document.getElementById('rotationSlider');
    
    const scaleDisplay = document.getElementById('scaleDisplay');
    const widthDisplay = document.getElementById('widthDisplay');
    const heightDisplay = document.getElementById('heightDisplay');
    const rotationDisplay = document.getElementById('rotationDisplay');
    
    const resetBtn = document.getElementById('resetIconBtn');
    const deleteBtn = document.getElementById('deleteIconBtn');
    const doneBtn = document.getElementById('doneEditingBtn');
    
    if (!scaleSlider) return;
    
    scaleSlider.addEventListener('input', (e) => {
        if (!editingIcon || !originalIconProperties) return;
        const scale = parseFloat(e.target.value);
        editingIcon.width = originalIconProperties.width * scale;
        editingIcon.height = originalIconProperties.height * scale;
        scaleDisplay.textContent = scale.toFixed(1);
        CanvasManager.redraw();
    });
    
    widthSlider.addEventListener('input', (e) => {
        if (!editingIcon || !originalIconProperties) return;
        const widthScale = parseFloat(e.target.value);
        editingIcon.width = originalIconProperties.width * widthScale;
        widthDisplay.textContent = widthScale.toFixed(1);
        CanvasManager.redraw();
    });
    
    heightSlider.addEventListener('input', (e) => {
        if (!editingIcon || !originalIconProperties) return;
        const heightScale = parseFloat(e.target.value);
        editingIcon.height = originalIconProperties.height * heightScale;
        heightDisplay.textContent = heightScale.toFixed(1);
        CanvasManager.redraw();
    });
    
    rotationSlider.addEventListener('input', (e) => {
        if (!editingIcon) return;
        const step = parseInt(e.target.value);
        const rotation = step * 45;
        editingIcon.rotation = (rotation * Math.PI) / 180;
        rotationDisplay.textContent = rotation + '°';
        CanvasManager.redraw();
    });
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (!editingIcon || !originalIconProperties) return;
            resetIconToOriginal();
        });
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (!editingIcon) return;
            deleteElement(editingIcon);
            hideIconEditControls();
        });
    }
    
    if (doneBtn) {
        doneBtn.addEventListener('click', () => {
            finishIconEditing();
        });
    }
}

function showIconEditControls(icon) {
    editingIcon = icon;
    
    originalIconProperties = {
        width: icon.width,
        height: icon.height,
        rotation: icon.rotation || 0
    };
    
    const currentScaleX = icon.width / originalIconProperties.width;
    const currentScaleY = icon.height / originalIconProperties.height;
    const currentRotationDegrees = ((icon.rotation || 0) * 180) / Math.PI;
    const currentRotationStep = Math.round(currentRotationDegrees / 45);
    
    const scaleSlider = document.getElementById('scaleSlider');
    const widthSlider = document.getElementById('widthSlider');
    const heightSlider = document.getElementById('heightSlider');
    const rotationSlider = document.getElementById('rotationSlider');
    
    const scaleDisplay = document.getElementById('scaleDisplay');
    const widthDisplay = document.getElementById('widthDisplay');
    const heightDisplay = document.getElementById('heightDisplay');
    const rotationDisplay = document.getElementById('rotationDisplay');
    
    if (!scaleSlider) return;
    
    const averageScale = (currentScaleX + currentScaleY) / 2;
    
    scaleSlider.value = averageScale;
    widthSlider.value = currentScaleX;
    heightSlider.value = currentScaleY;
    rotationSlider.value = currentRotationStep;
    
    if (scaleDisplay) {
        scaleDisplay.textContent = averageScale.toFixed(1);
        widthDisplay.textContent = currentScaleX.toFixed(1);
        heightDisplay.textContent = currentScaleY.toFixed(1);
        rotationDisplay.textContent = (currentRotationStep * 45) + '°';
    }
    
    document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
    
    const controls = document.getElementById('iconEditControls');
    if (controls) {
        controls.classList.remove('hidden');
    }
    
    CanvasManager.redraw();
}

function hideIconEditControls() {
    const controls = document.getElementById('iconEditControls');
    if (controls) {
        controls.classList.add('hidden');
    }
    editingIcon = null;
    originalIconProperties = null;
}

function resetIconToOriginal() {
    if (!editingIcon || !originalIconProperties) return;
    
    editingIcon.width = originalIconProperties.width;
    editingIcon.height = originalIconProperties.height;
    editingIcon.rotation = originalIconProperties.rotation;
    
    const scaleSlider = document.getElementById('scaleSlider');
    const widthSlider = document.getElementById('widthSlider');
    const heightSlider = document.getElementById('heightSlider');
    const rotationSlider = document.getElementById('rotationSlider');
    
    const scaleDisplay = document.getElementById('scaleDisplay');
    const widthDisplay = document.getElementById('widthDisplay');
    const heightDisplay = document.getElementById('heightDisplay');
    const rotationDisplay = document.getElementById('rotationDisplay');
    
    if (scaleSlider) {
        scaleSlider.value = 1;
        widthSlider.value = 1;
        heightSlider.value = 1;
        rotationSlider.value = 0;
        
        if (scaleDisplay) {
            scaleDisplay.textContent = '1.0';
            widthDisplay.textContent = '1.0';
            heightDisplay.textContent = '1.0';
            rotationDisplay.textContent = '0°';
        }
    }
    
    CanvasManager.redraw();
    CanvasManager.saveAction();
}

function getIconEditHandle(icon, x, y) {
    // This function is kept for reference but is no longer used for interaction
    // in the unified UI. All interactions are handled by the sliders.
    return null;
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
}

function angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

function rotateIcon90Degrees(icon) {
    if (!icon) return;
    if (typeof icon.rotation !== 'number') icon.rotation = 0;
    icon.rotation += Math.PI / 2;
    while (icon.rotation >= 2 * Math.PI) icon.rotation -= 2 * Math.PI;
    CanvasManager.redraw();
    CanvasManager.saveAction();
}

function handleIconResize(x, y) {
    // This function is no longer called by mouse/touch move events.
    // It's kept for reference.
    if (!editingIcon || !resizeHandle) return;
}

function finishIconEditing() {
    hideIconEditControls(); 
    
    const iconsPalette = document.getElementById('iconsPalette');
    if (iconsPalette) {
        document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
        iconsPalette.classList.remove('hidden');
        lastVisiblePalette = 'iconsPalette'; 
        
        const paletteButtons = document.querySelectorAll('[data-palette]');
        paletteButtons.forEach(btn => btn.classList.remove('active'));
        const iconsBtn = document.getElementById('iconsBtn');
        if (iconsBtn) iconsBtn.classList.add('active');
    }
    
    editingIcon = null;
    CanvasManager.saveAction(); 
    CanvasManager.redraw();
}

function selectElement(type, content, styling, alt = '') {
    selectedElement = { type, content, styling, alt };
    
    const visiblePalette = document.querySelector('.one-of-bottom-pallets:not(.hidden)');
    if (visiblePalette) {
        lastVisiblePalette = visiblePalette.id;
        visiblePalette.classList.add('hidden');
    }
    
    const customCursor = document.getElementById('customCursor');
    if (!customCursor) return;
    
    if (type === 'room') {
        const textWidth = Math.max(58, selectedElement.content.length * 8 + 8);
        customCursor.innerHTML = `<div style="background-color: ${styling.backgroundColor}; color: ${styling.color || 'white'}; padding: 2px 4px; border-radius: 4px; font: 600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; white-space: nowrap; border: 1px solid rgba(255,255,255,0.2); pointer-events: none; width: ${textWidth}px; height: 16px; display: flex; align-items: center; justify-content: center;">${content}</div>`;
    } else {
        customCursor.innerHTML = `<img src="${content}" alt="${alt}" style="width: 45px; height: 45px; pointer-events: none;">`;
    }
    
    customCursor.classList.remove('hidden');
    customCursor.style.display = 'block';
    canvas.style.cursor = 'none';
    document.addEventListener('mousemove', updateCustomCursor);
}

function getEventPos(e) {
    const viewport = document.getElementById('canvasViewport');
    const rect = viewport.getBoundingClientRect();
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    } else {
        clientX = e.clientX || 0;
        clientY = e.clientY || 0;
    }
    
    const canvasX = (clientX - rect.left) - AppState.viewportTransform.x;
    const canvasY = (clientY - rect.top) - AppState.viewportTransform.y;
    
    return { x: canvasX, y: canvasY };
}

function placeElement(x, y) {
    if (!selectedElement) return;

    const textWidth = selectedElement.type === 'room' ? Math.max(58, selectedElement.content.length * 8 + 8) : 45;
    const elemWidth = selectedElement.type === 'icon' ? 45 : textWidth;
    const elemHeight = selectedElement.type === 'icon' ? 45 : 16;

    const newElement = {
        id: Date.now(),
        type: selectedElement.type,
        content: selectedElement.content,
        styling: selectedElement.styling,
        alt: selectedElement.alt,
        x: x - elemWidth / 2,
        y: y - elemHeight / 2,
        width: elemWidth,
        height: elemHeight,
        rotation: 0 
    };

    AppState.placedElements.push(newElement);
    selectedElement = null;
    hideCustomCursor();
    CanvasManager.redraw();
    CanvasManager.saveAction();
}

function handleEditKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        finishEditing();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEditing();
    }
}

function cancelEditing() {
    cleanupEditing();
}

function cleanupEditing() {
    if (editInput) {
        editInput.remove();
        editInput = null;
    }
    editingElement = null;
}

function deleteElement(element) {
    const index = AppState.placedElements.indexOf(element);
    if (index > -1) {
        AppState.placedElements.splice(index, 1);
        if (editingIcon === element) {
            hideIconEditControls(); 
        }
        CanvasManager.redraw();
        CanvasManager.saveAction();
    }
}

// REPLACED: This function now just draws a simple highlight.
function drawIconEditHighlight(element) {
    if (editingIcon !== element) {
        return;
    }
    
    // Draw a simple, clear border around the icon being edited with sliders.
    ctx.strokeStyle = '#3498db'; // Bright blue for visibility
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]); // Dashed line for a "selected" look
    
    // Apply rotation to the highlight box itself
    ctx.save();
    if (element.rotation) {
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(element.rotation);
        ctx.translate(-centerX, -centerY);
    }
    ctx.strokeRect(element.x - 3, element.y - 3, element.width + 6, element.height + 6);
    ctx.restore();

    ctx.setLineDash([]);
}

function updateCustomCursor(e) {
    const customCursor = document.getElementById('customCursor');
    if (customCursor) {
        customCursor.style.left = e.clientX + 'px';
        customCursor.style.top = e.clientY + 'px';
    }
}

function hideCustomCursor() {
    const customCursor = document.getElementById('customCursor');
    if (customCursor) {
        customCursor.classList.add('hidden');
        customCursor.innerHTML = '';
    }
    canvas.style.cursor = 'default';
    document.removeEventListener('mousemove', updateCustomCursor);

    // MODIFIED: Restore the last visible palette after placing an element.
    // This makes placing multiple items of the same type much quicker.
    if (lastVisiblePalette) {
        const paletteToShow = document.getElementById(lastVisiblePalette);
        if (paletteToShow) {
            console.log(`Restoring palette: ${lastVisiblePalette}`);
            paletteToShow.classList.remove('hidden');
        }
        // Clear the variable so it doesn't accidentally show a palette later.
        lastVisiblePalette = null;
    }
}

function updateLegend() {
    let bedrooms = 0;
    let bathrooms = 0;
    AppState.placedElements.forEach(element => {
        if (element.type === 'room') {
            const label = element.content.toLowerCase();
            if (label.includes('bedroom')) {
                bedrooms++;
            } else if (label.includes('1/2 bath')) {
                bathrooms += 0.5;
            } else if (label.includes('bath')) {
                bathrooms++;
            }
        }
    });
    document.getElementById('legendBedrooms').textContent = bedrooms;
    document.getElementById('legendBathrooms').textContent = bathrooms;
}

function toggleLegend() {
    const legend = document.getElementById('summaryLegend');
    legend.classList.toggle('hidden');
}

function showpallets(id) {
    const target = document.getElementById(id);
    const isVisible = !target.classList.contains('hidden');
    document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
    if (!isVisible) {
        target.classList.remove('hidden');
        lastVisiblePalette = id; 
    }
}

function startEditingElement(element) {
    finishEditing();
    
    editingElement = element;
    
    editInput = document.createElement('input');
    editInput.type = 'text';
    
    if (element.type === 'area_label') {
        editInput.value = element.areaData ? element.areaData.areaText : element.content;
    } else {
        editInput.value = element.content;
    }
    
    editInput.style.position = 'fixed';
    
    const viewport = document.getElementById('canvasViewport');
    const rect = viewport.getBoundingClientRect();
    const screenX = rect.left + AppState.viewportTransform.x + element.x;
    const screenY = rect.top + AppState.viewportTransform.y + element.y;
    
    editInput.style.left = screenX + 'px';
    editInput.style.top = screenY + 'px';
    
    const editingWidth = Math.max(160, element.content.length * 8 + 40);
    editInput.style.width = editingWidth + 'px';
    editInput.style.height = (element.height + 8) + 'px';
    editInput.style.fontSize = '16px';
    editInput.style.fontWeight = '600';
    editInput.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    editInput.style.border = '3px solid #3498db';
    editInput.style.borderRadius = '4px';
    editInput.style.padding = '4px 8px';
    editInput.style.backgroundColor = 'white';
    editInput.style.color = '#333';
    editInput.style.zIndex = '999999';
    editInput.style.textAlign = 'center';
    editInput.style.touchAction = 'auto';
    editInput.style.userSelect = 'text';
    editInput.style.webkitUserSelect = 'text';
    editInput.style.pointerEvents = 'auto';
    editInput.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    
    editInput.setAttribute('autocomplete', 'off');
    editInput.setAttribute('autocorrect', 'off');
    editInput.setAttribute('autocapitalize', 'off');
    editInput.setAttribute('spellcheck', 'false');
    editInput.setAttribute('inputmode', 'text');
    
    editInput.addEventListener('blur', () => {
        setTimeout(finishEditing, 200);
    });
    editInput.addEventListener('keydown', handleEditKeydown);
    
    document.body.appendChild(editInput);
    
    setTimeout(() => {
        editInput.focus();
        editInput.select();
    }, 50);
}

function finishEditing() {
    if (!editingElement || !editInput) return;
    
    const newContent = editInput.value.trim();
    let contentChanged = false;
    
    if (newContent && newContent !== editingElement.content) {
        if (editingElement.type === 'area_label') {
            editingElement.content = newContent;
            editingElement.areaData.areaText = newContent;
            editingElement.width = Math.max(80, newContent.length * 8 + 16);
            
            const linkedPolygon = AppState.drawnPolygons.find(p => p.id === editingElement.linkedPolygonId);
            if (linkedPolygon) {
                linkedPolygon.label = newContent;
            }
            contentChanged = true;
        } else {
            editingElement.content = newContent;
            editingElement.width = Math.max(58, newContent.length * 8 + 8);
            contentChanged = true;
        }
    }
    
    cleanupEditing();
    
    if (contentChanged) {
        CanvasManager.saveAction();
        if (editingElement.type === 'area_label') {
            AppState.emit('app:requestLegendUpdate');
        }
    }
    
    CanvasManager.redraw();
}

function getElementAt(x, y) {
    if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
        return null;
    }
    
    for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
        const element = AppState.placedElements[i];
        
        let isHit = (x >= element.x && x <= element.x + element.width && 
                     y >= element.y && y <= element.y + element.height);

        if (isEditMode && AppState.editSubMode === 'labels' && (element.type === 'room' || element.type === 'area_label')) {
            const deleteSize = 20;
            const deleteX = element.x + element.width + 2;
            const deleteY = element.y - 2;
            const centerX = deleteX + deleteSize/2;
            const centerY = deleteY + deleteSize/2;
            const distance = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
            
            if (distance <= deleteSize/2) {
                deleteElement(element);
                return null; 
            }
        }
        
        if (isHit) {
            return element;
        }
    }
    return null;
}

// MODIFIED: Simplified to remove on-canvas handle logic.
function handleViewportMouseDown(e) {
    if (e.button !== 0) return;
    if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
        return;
    }

    const pos = getEventPos(e);
    const elementAtPoint = getElementAt(pos.x, pos.y);

    if (elementAtPoint && !editingIcon) {
        if (AppState.currentMode === 'placement' || AppState.editSubMode === 'labels') {
             isDragging = true;
             draggedElement = elementAtPoint;
             dragOffset.x = pos.x - draggedElement.x;
             dragOffset.y = pos.y - draggedElement.y;
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

// MODIFIED: Simplified to remove on-canvas handle logic.
function handleViewportMouseMove(e) {
    if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
        return;
    }

    const pos = getEventPos(e);

    if (isDragging && draggedElement) { // No longer check for editingIcon here
        draggedElement.x = pos.x - dragOffset.x;
        draggedElement.y = pos.y - dragOffset.y;
        CanvasManager.redraw();
    } else if (isPanning && !isDragging) {
        const dx = e.clientX - lastPanPoint.x;
        const dy = e.clientY - lastPanPoint.y;
        AppState.viewportTransform.x += dx;
        AppState.viewportTransform.y += dy;
        lastPanPoint = { x: e.clientX, y: e.clientY };
        CanvasManager.updateViewportTransform();
        CanvasManager.redraw();
    }
}

function handleViewportMouseUp(e) {
    if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
        return;
    }
    
    if (isDragging && draggedElement) {
        CanvasManager.saveAction();
    }
    
    isPanning = false;
    isDragging = false;
    draggedElement = null;
    canvas.style.cursor = selectedElement ? 'none' : 'default';
}

function handleViewportTouchStart(e) {
    if (e.touches.length === 1) {
        if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
            return;
        }
        const pos = getEventPos(e);
        const elementAtPoint = getElementAt(pos.x, pos.y);
        
        if (elementAtPoint && !editingIcon) {
            if (AppState.currentMode === 'placement' || AppState.editSubMode === 'labels') {
                isDragging = true;
                draggedElement = elementAtPoint;
                dragOffset.x = pos.x - draggedElement.x;
                dragOffset.y = pos.y - draggedElement.y;
                e.preventDefault();
            }
        }
    } else if (e.touches.length === 2 && !editingIcon) {
        e.preventDefault();
        isGesturing = true;
        isPanning = false;
        isDragging = false;
        draggedElement = null;
        
        lastTouchCenter = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
    }
}

function handleViewportTouchMove(e) {
    if (e.touches.length === 1 && !isGesturing) {
        if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
            return;
        }
        if (isDragging && draggedElement) {
            e.preventDefault();
            const pos = getEventPos(e);
            draggedElement.x = pos.x - dragOffset.x;
            draggedElement.y = pos.y - dragOffset.y;
            CanvasManager.redraw();
        }
    } else if (e.touches.length === 2 && isGesturing) {
        e.preventDefault();
        const newCenter = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
        const panDx = newCenter.x - lastTouchCenter.x;
        const panDy = newCenter.y - lastTouchCenter.y;
        AppState.viewportTransform.x += panDx;
        AppState.viewportTransform.y += panDy;
        lastTouchCenter = newCenter;
        CanvasManager.updateViewportTransform();
        CanvasManager.redraw();
    }
}

// MODIFIED: Logic now unified for click and touch
function handleCanvasClick(e) {
    if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
        return;
    }

    const pos = getEventPos(e);
    
    if (selectedElement && !isPanning && !isDragging) {
        placeElement(pos.x, pos.y);
        return;
    } 
    
    if (isEditMode) {
        const clickedElement = getElementAt(pos.x, pos.y);
        
        if (clickedElement && AppState.editSubMode === 'labels') {
            e.preventDefault();
            e.stopPropagation();

            if (clickedElement.type === 'room' || clickedElement.type === 'area_label') {
                hideIconEditControls();
                startEditingElement(clickedElement);
            } else if (clickedElement.type === 'icon') {
                finishEditing(); 
                showIconEditControls(clickedElement);
            }
        } else {
            finishEditing();
            hideIconEditControls();
        }
    }
}

// MODIFIED: Logic now unified for click and touch
function handleViewportTouchEnd(e) {
    if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
        return;
    }

    if (isEditMode && e.changedTouches.length > 0 && !isDragging) {
        const touch = e.changedTouches[0];
        const pos = getEventPos({changedTouches: [touch]});
        const clickedElement = getElementAt(pos.x, pos.y);
        
        if (clickedElement) {
             if (clickedElement.type === 'room' || clickedElement.type === 'area_label') {
                const deleteSize = 20;
                const deleteX = clickedElement.x + clickedElement.width + 2;
                const deleteY = clickedElement.y - 2;
                const centerX = deleteX + deleteSize/2;
                const centerY = deleteY + deleteSize/2;
                const distance = Math.sqrt((pos.x - centerX) * (pos.x - centerX) + (pos.y - centerY) * (pos.y - centerY));
                
                if (distance <= deleteSize/2) {
                    deleteElement(clickedElement);
                } else {
                    startEditingElement(clickedElement);
                }
                e.preventDefault();
                return;
            } else if (clickedElement.type === 'icon') {
                showIconEditControls(clickedElement);
                e.preventDefault();
                return;
            }
        }
    }
    
    if (!isEditMode && selectedElement && e.touches.length === 0 && !isDragging) {
        e.preventDefault();
        const pos = getEventPos(e);
        placeElement(pos.x, pos.y);
    }
    
    if (e.touches.length === 0) {
        if (isDragging && draggedElement) {
            CanvasManager.saveAction();
        }
        
        isPanning = false;
        isGesturing = false;
        isDragging = false;
        draggedElement = null;
    } else if (e.touches.length === 1) {
        isGesturing = false;
    }
}

function activateSketchListeners() {
    const viewport = document.getElementById('canvasViewport');
    if (!viewport) return;
    
    console.log('Activating sketch.js listeners.');
    viewport.addEventListener('mousedown', handleViewportMouseDown);
    viewport.addEventListener('mousemove', handleViewportMouseMove);
    viewport.addEventListener('mouseup', handleViewportMouseUp);
    viewport.addEventListener('touchstart', handleViewportTouchStart, { passive: false });
    viewport.addEventListener('touchmove', handleViewportTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleViewportTouchEnd, { passive: false });
    canvas.addEventListener('click', handleCanvasClick);
}

function deactivateSketchListeners() {
    const viewport = document.getElementById('canvasViewport');
    if (!viewport) return;

    console.log('Deactivating sketch.js listeners.');
    viewport.removeEventListener('mousedown', handleViewportMouseDown);
    viewport.removeEventListener('mousemove', handleViewportMouseMove);
    viewport.removeEventListener('mouseup', handleViewportMouseUp);
    viewport.removeEventListener('touchstart', handleViewportTouchStart);
    viewport.removeEventListener('touchmove', handleViewportTouchMove);
    viewport.removeEventListener('touchend', handleViewportTouchEnd);
    canvas.removeEventListener('click', handleCanvasClick);
}

// These functions remain but are not part of the primary interaction flow anymore
function toggleEditMode() { /* Deprecated by main.js logic */ }
function showangleinput() { /* This seems to be a legacy function */ }

export { 
    showpallets, 
    initSketchModule, 
    toggleLegend, 
    activateSketchListeners,
    deactivateSketchListeners
};
