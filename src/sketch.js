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
let elementToEditInModal = null;

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


// src/sketch.js

// NEW: Add this function to forcibly reset canvas interaction states.
/**
 * Resets any 'stuck' canvas states like panning or dragging.
 * This is a failsafe to prevent the cursor from getting stuck.
 */
function forceResetCanvasState() {
    console.log('Forcibly resetting canvas interaction state.');
    isPanning = false;
    isDragging = false;
    draggedElement = null;
    
    // Reset the cursor to the default pointer
    if(canvas) {
        canvas.style.cursor = 'default';
    }
}

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


 function preloadImages() {
    console.log('Preloading UI images...');
    const imagesToLoad = {
        'editIcon': 'public/edit.svg',
        'deleteIcon': 'public/delete.svg'
    };

    for (const key in imagesToLoad) {
        const img = new Image();
        img.src = imagesToLoad[key];
        img.onload = () => {
            AppState.imageCache[imagesToLoad[key]] = img;
            console.log(`Image '${key}' preloaded and cached from ${imagesToLoad[key]}.`);
            
            // --- THIS IS THE FIX ---
            // Force a redraw of the canvas *after* the image has loaded.
            CanvasManager.redraw(); 
        };
        img.onerror = () => {
            console.error(`Failed to load image: ${imagesToLoad[key]}`);
        };
    }
}



function initSketchModule() {
    console.log('DEBUG: initSketchModule() called');
    
    canvas = AppState.canvas;
    ctx = AppState.ctx;
    
    preloadImages();
    preloadPaletteIcons(); // Add this line
    
    AppState.placedElements = placedElements;
    AppState.actionHistory = actionHistory;
    AppState.historyIndex = historyIndex;
    AppState.viewportTransform = viewportTransform;
    
    // --- FIX START: Prevent click-through on the label edit modal ---
    // This stops mousedown events on the modal from starting a pan on the canvas.
    const labelEditModal = document.getElementById('labelEditModal');
    if (labelEditModal) {
        labelEditModal.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        labelEditModal.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: false });
    }
    // --- FIX END ---

    AppState.on('mode:editToggled', (e) => {
        isEditMode = e.detail.isEditMode;
        console.log('Sketch.js: isEditMode set to', isEditMode);
        
        if (!isEditMode) {
            if (editingIcon) finishIconEditing();
            // No need to check for editingElement as it was removed
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
// REPLACE this function to use the shared AppState.imageCache

 // src/sketch.js

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
                ctx.fillStyle = shouldGrayOut ? '#9e9e9e' : (element.styling.backgroundColor || '#3498db');
                
                // Rounded corners logic
                const radius = parseInt(element.styling.borderRadius) || 4;
                ctx.beginPath();
                ctx.moveTo(element.x + radius, element.y);
                ctx.lineTo(element.x + element.width - radius, element.y);
                ctx.quadraticCurveTo(element.x + element.width, element.y, element.x + element.width, element.y + radius);
                ctx.lineTo(element.x + element.width, element.y + element.height - radius);
                ctx.quadraticCurveTo(element.x + element.width, element.y + element.height, element.x + element.width - radius, element.y + element.height);
                ctx.lineTo(element.x + radius, element.y + element.height);
                // **** THIS IS THE FIX: Changed 'y' to 'element.y' ****
                ctx.quadraticCurveTo(element.x, element.y + element.height, element.x, element.y + element.height - radius);
                // **** END FIX ****
                ctx.lineTo(element.x, element.y + radius);
                ctx.quadraticCurveTo(element.x, element.y, element.x + radius, element.y);
                ctx.closePath();
                ctx.fill();
                
                ctx.fillStyle = shouldGrayOut ? '#f5f5f5' : (element.styling.color || 'white');
                ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(element.content, element.x + element.width / 2, element.y + element.height / 2);
            }
            
            if (isEditMode && AppState.editSubMode === 'labels' && (element.type === 'room' || element.type === 'area_label')) {
                const iconSize = 24;
                const padding = 6;
                let editX, editY, deleteX, deleteY;
                
                if (element.type === 'area_label') {
                    const labelLeft = element.x - element.width / 2;
                    const labelRight = element.x + element.width / 2;
                    const labelTop = element.y - element.height / 2;
                    editX = labelLeft - iconSize - padding;
                    editY = labelTop;
                    deleteX = labelRight + padding;
                    deleteY = labelTop;
                } else {
                    const elementCenterY = element.y + element.height / 2;
                    editX = element.x - iconSize - padding;
                    editY = elementCenterY - (iconSize / 2);
                    deleteX = element.x + element.width + padding;
                    deleteY = elementCenterY - (iconSize / 2);
                }
                
                const editIconPath = 'public/edit.svg';
                if (AppState.imageCache[editIconPath]) {
                    ctx.drawImage(AppState.imageCache[editIconPath], editX, editY, iconSize, iconSize);
                }
                
                const deleteIconPath = 'public/delete.svg';
                if (AppState.imageCache[deleteIconPath]) {
                    ctx.drawImage(AppState.imageCache[deleteIconPath], deleteX, deleteY, iconSize, iconSize);
                }
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
            
            if (AppState.imageCache[element.content]) {
                drawRotatedIcon(AppState.imageCache[element.content]);
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


function preloadPaletteIcons() {
    console.log('Preloading palette icon images...');
    
    // Find all icon images in the palette
    const iconImages = document.querySelectorAll('.icon-palette-item img');
    
    iconImages.forEach(img => {
        if (img.src && !AppState.imageCache[img.src]) {
            const preloadImg = new Image();
            preloadImg.src = img.src;
            preloadImg.onload = () => {
                AppState.imageCache[img.src] = preloadImg;
                console.log(`Palette icon preloaded: ${img.src}`);
            };
            preloadImg.onerror = () => {
                console.error(`Failed to preload palette icon: ${img.src}`);
            };
        }
    });
}

// Call this function in initSketchModule after preloadImages()
// Add this line after the preloadImages() call:
// preloadPaletteIcons();
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
        // For icons, preload the image if it's not already cached
        if (!AppState.imageCache[content]) {
            const img = new Image();
            img.src = content;
            img.onload = () => {
                AppState.imageCache[content] = img;
                console.log(`Icon image cached: ${content}`);
                // Redraw canvas to show any icons that were waiting for this image
                CanvasManager.redraw();
            };
            img.onerror = () => {
                console.error(`Failed to load icon image: ${content}`);
            };
        }
        
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

    let elemWidth, elemHeight;

    // Unified logic to determine element dimensions based on its type
    if (selectedElement.type === 'icon') {
        // Icons have a fixed, square size
        elemWidth = 45;
        elemHeight = 45;
    } else if (selectedElement.type === 'room') {
        // Room labels have a dynamic width to fit the text and a fixed height
        elemWidth = Math.max(58, selectedElement.content.length * 8 + 8);
        elemHeight = 16;
    } else {
        // A sensible fallback for any other potential element types
        elemWidth = 45;
        elemHeight = 45;
    }

    const newElement = {
        id: Date.now(),
        type: selectedElement.type,
        content: selectedElement.content,
        styling: selectedElement.styling,
        alt: selectedElement.alt,
        // This placement logic is now identical for all types.
        // It correctly centers the element on the cursor's canvas coordinates.
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


/**
 * Opens the label editing modal and populates it with the element's data.
 * @param {object} element The room or area label element to edit.
 */
function openLabelEditModal(element) {
    if (!element) return;
    elementToEditInModal = element;

    const modal = document.getElementById('labelEditModal');
    const input = document.getElementById('labelEditTextInput');
    const saveBtn = document.getElementById('saveLabelEditBtn');
    const cancelBtn = document.getElementById('cancelLabelEditBtn');

    // Populate the input with the current label content
    input.value = element.content;

    // Set up button listeners
    saveBtn.onclick = saveLabelEdit;
    cancelBtn.onclick = closeLabelEditModal;

    // Show the modal
    modal.classList.remove('hidden');

    // Automatically focus the input field for immediate typing
    setTimeout(() => input.focus(), 50);
}

/**
 * Hides the label editing modal and cleans up the state.
 */
 function closeLabelEditModal() {
    const modal = document.getElementById('labelEditModal');
    modal.classList.add('hidden');
    elementToEditInModal = null; // Clear the element being edited

    // FIX: Forcibly reset any 'stuck' canvas states to fix the cursor issue.
    forceResetCanvasState();
}

/**
 * Saves the new text from the modal to the selected element.
 */
function saveLabelEdit() {
    const input = document.getElementById('labelEditTextInput');
    const newContent = input.value.trim();

    if (elementToEditInModal && newContent) {
        // Update the element's content
        elementToEditInModal.content = newContent;

        // Dynamically adjust the width of the label to fit the new text
        if (elementToEditInModal.type === 'area_label') {
            elementToEditInModal.areaData.areaText = newContent;
            const linkedPolygon = AppState.drawnPolygons.find(p => p.id === elementToEditInModal.linkedPolygonId);
            if (linkedPolygon) {
                linkedPolygon.label = newContent;
            }
            AppState.emit('app:requestLegendUpdate');
        } else {
             // Adjust width for standard room labels
            elementToEditInModal.width = Math.max(58, newContent.length * 8 + 8);
        }

        console.log(`Label updated to "${newContent}"`);

        // Save the change to history and redraw the canvas
        CanvasManager.saveAction();
        CanvasManager.redraw();
    }
    
    closeLabelEditModal();
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

 // MODIFIED: This function is updated
 

// MODIFIED: Simplified to remove on-canvas handle logic.
function handleViewportMouseDown(e) {
    if (e.button !== 0) return;
    if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
        return;
    }

    const pos = getEventPos(e);
    const elementAtPoint = getElementAt(pos.x, pos.y);

    // Allow dragging elements in placement and edit labels modes
    if (elementAtPoint && !editingIcon && (AppState.currentMode === 'placement' || AppState.editSubMode === 'labels')) {
        isDragging = true;
        draggedElement = elementAtPoint;
        dragOffset.x = pos.x - draggedElement.x;
        dragOffset.y = pos.y - draggedElement.y;
        canvas.style.cursor = 'grabbing';
        return;
    }
    
    // Enable panning in ALL modes including photos mode
    // Remove the restriction that prevented panning when selectedElement exists
    if (!editingIcon && !isDragging) {
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
    if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
        return;
    }

    const touches = e.touches;
    
    if (touches.length === 1) {
        const touch = touches[0];
        const pos = getEventPos({touches: [touch]});
        const elementAtPoint = getElementAt(pos.x, pos.y);
        
        // Allow dragging elements in placement and edit labels modes
        if (elementAtPoint && !editingIcon && (AppState.currentMode === 'placement' || AppState.editSubMode === 'labels')) {
            isDragging = true;
            draggedElement = elementAtPoint;
            dragOffset.x = pos.x - draggedElement.x;
            dragOffset.y = pos.y - draggedElement.y;
            e.preventDefault();
        } else {
            // Enable panning in ALL modes including photos mode
            isPanning = true;
            lastPanPoint = { x: touch.clientX, y: touch.clientY };
            // Don't prevent default to allow touch scrolling
        }
    } else if (touches.length === 2) {
        isGesturing = true;
        isPanning = false;
        isDragging = false;
        const centerX = (touches[0].clientX + touches[1].clientX) / 2;
        const centerY = (touches[0].clientY + touches[1].clientY) / 2;
        lastTouchCenter = { x: centerX, y: centerY };
        e.preventDefault();
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
 

 // REPLACE this function with the updated version below
function getElementAt(x, y) {
    if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
        return null;
    }
    
    for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
        const element = AppState.placedElements[i];
        
        let isHit = (x >= element.x && x <= element.x + element.width && 
                     y >= element.y && y <= element.y + element.height);

        if (isEditMode && AppState.editSubMode === 'labels' && (element.type === 'room' || element.type === 'area_label')) {
            const iconSize = 24;
            const padding = 6;
            const elementCenterY = element.y + element.height / 2;

            // Edit Icon Hit Box (Left of the label)
            const editX = element.x - iconSize - padding;
            const editY = elementCenterY - (iconSize / 2);
            if (x >= editX && x <= editX + iconSize && y >= editY && y <= editY + iconSize) {
                console.log('Edit icon clicked, opening modal for:', element.content);
                openLabelEditModal(element); // Call the new modal function
                return null; 
            }

            // Delete Icon Hit Box (Right of the label)
            const deleteX = element.x + element.width + padding;
            const deleteY = elementCenterY - (iconSize / 2);
            const deleteCenterX = deleteX + iconSize/2;
            const deleteCenterY = deleteY + iconSize/2;
            const distance = Math.sqrt((x - deleteCenterX) * (x - deleteCenterX) + (y - deleteCenterY) * (y - deleteCenterY));
            
            if (distance <= iconSize/2) {
                deleteElement(element);
                return null; 
            }
        }
        
        // Return the element if it's being dragged, but not for initiating edits
        if (isHit) {
            return element;
        }
    }
    return null;
}

// REPLACE this function with the updated version below
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
        // The getElementAt function now handles all label edit/delete actions,
        // so we only need to handle icon editing here.
        const clickedElement = getElementAt(pos.x, pos.y);
        
        if (clickedElement && AppState.editSubMode === 'labels') {
            e.preventDefault();
            e.stopPropagation();

            if (clickedElement.type === 'icon') {
                // This logic is for the other icons, not labels.
                showIconEditControls(clickedElement);
            }
            // IMPORTANT: The part that made labels editable on click is now removed.

        } else {
             // If clicking anywhere else, ensure any open editing panels are closed.
             hideIconEditControls();
        }
    }
}

// REPLACE this function with the updated version below
function handleViewportTouchEnd(e) {
    if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
        return;
    }

    // `getElementAt` now handles both delete and edit icon taps.
    // We check for a touched element here primarily for icon editing.
    if (isEditMode && e.changedTouches.length > 0 && !isDragging) {
        const touch = e.changedTouches[0];
        const pos = getEventPos({changedTouches: [touch]});
        const clickedElement = getElementAt(pos.x, pos.y);
        
        if (clickedElement && clickedElement.type === 'icon') {
            showIconEditControls(clickedElement);
            e.preventDefault();
            return;
        }
        // IMPORTANT: The redundant logic for deleting or editing labels is removed
        // because getElementAt() now correctly handles it for both touch and click.
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
