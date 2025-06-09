// src/sketch.js - FIXED VERSION WITH WORKING ROTATION + SLIDER CONTROLS + MODULAR INTEGRATION - NO CONSOLE SPAM
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

// Icon editing variables - UPDATED for slider controls
let editingIcon = null;
let isResizing = false;
let isRotating = false;
let resizeHandle = null;
let rotationStartAngle = 0;
let elementStartRotation = 0;
let originalIconProperties = null; // NEW: Store original properties for reset

// Pan variables
let viewportTransform = {
    x: 0,
    y: 0,
    scale: 1 // Keep at 1, no zooming
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
    
    // Copy existing canvas and ctx references from AppState
    canvas = AppState.canvas;
    ctx = AppState.ctx;
    
    // Copy existing placedElements to AppState
    AppState.placedElements = placedElements;
    
    // Copy existing history to AppState
    AppState.actionHistory = actionHistory;
    AppState.historyIndex = historyIndex;
    
    // Copy existing viewportTransform to AppState
    AppState.viewportTransform = viewportTransform;
    
    // Set up viewport event listeners
    const viewport = document.getElementById('canvasViewport');
    
    // Mouse events for panning
    viewport.addEventListener('mousedown', handleViewportMouseDown);
    viewport.addEventListener('mousemove', handleViewportMouseMove);
    viewport.addEventListener('mouseup', handleViewportMouseUp);
    
    // Touch events for panning
    viewport.addEventListener('touchstart', handleViewportTouchStart, { passive: false });
    viewport.addEventListener('touchmove', handleViewportTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleViewportTouchEnd, { passive: false });
    
    // Canvas events for drawing/placing elements
    canvas.addEventListener('click', handleCanvasClick);
    
    // Delay palette setup to ensure DOM is ready
    setTimeout(setupPaletteListeners, 100);
    
    CanvasManager.updateViewportTransform();
    
    // Listen for canvas redraw events
    AppState.on('canvas:redraw:elements', () => {
        redrawPlacedElements();
    });
    
    console.log('DEBUG: initSketchModule() completed');
}

function redrawPlacedElements() {
    // REMOVED: Debug logging that was spamming console during every redraw
    
    // Save the current context state
    ctx.save();
    
    AppState.placedElements.forEach((element, index) => {
        // REMOVED: Logging for each element during redraw - was causing spam
        
        if (element.type === 'room') {
            const styling = element.styling;
            ctx.fillStyle = styling.backgroundColor || styling;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            
            // Draw rounded rectangle
            const radius = 4;
            ctx.beginPath();
            ctx.roundRect(element.x, element.y, element.width, element.height, radius);
            ctx.fill();
            ctx.stroke();
            
            // Draw text if not currently being edited
            if (element !== editingElement) {
                ctx.fillStyle = styling.color || 'white';
                ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(element.content, element.x + element.width/2, element.y + element.height/2 + 4);
            }
            
            // Draw delete button (red X) in edit mode - BIGGER and OUTSIDE to the right
            if (isEditMode && element !== editingElement) {
                const deleteSize = 20; // Increased from 16 to 20
                const deleteX = element.x + element.width + 5; // Position outside to the right
                const deleteY = element.y - 2; // Slightly adjusted vertical position
                
                // Draw red circle background
                ctx.fillStyle = '#e74c3c';
                ctx.beginPath();
                ctx.arc(deleteX + deleteSize/2, deleteY + deleteSize/2, deleteSize/2, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw white border around delete button
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(deleteX + deleteSize/2, deleteY + deleteSize/2, deleteSize/2, 0, Math.PI * 2);
                ctx.stroke();
                
                // Draw white X - bigger and thicker
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 3; // Increased line width
                ctx.lineCap = 'round';
                const offset = 6; // Increased offset for bigger X
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
            // Draw icon with rotation
            const drawRotatedIcon = (img) => {
                ctx.save();
                
                // Apply rotation if present
                if (element.rotation) {
                    // REMOVED: Debug logging for rotation - was spamming console
                    const centerX = element.x + element.width / 2;
                    const centerY = element.y + element.height / 2;
                    ctx.translate(centerX, centerY);
                    ctx.rotate(element.rotation);
                    ctx.translate(-centerX, -centerY);
                }
                
                ctx.drawImage(img, element.x, element.y, element.width, element.height);
                ctx.restore();
                
                // Draw edit handles for icons in edit mode (outside of save/restore)
                drawIconEditHandles(element);
            };
            
            if (!imageCache[element.content]) {
                const img = new Image();
                img.onload = () => {
                    imageCache[element.content] = img;
                    // Need to redraw the entire canvas when image loads
                    CanvasManager.redraw();
                };
                img.src = element.content;
                // Don't draw anything yet - wait for onload
            } else {
                drawRotatedIcon(imageCache[element.content]);
            }
        }
    });
    
    // Restore the context state
    ctx.restore();
    
    updateLegend();
    // REMOVED: Completion logging that was spamming console
}

// UPDATED: setupPaletteListeners function to include slider controls
function setupPaletteListeners() {
    console.log('Setting up palette listeners...');
    const roomLabels = document.querySelectorAll('.room-palette-label');
    const iconImages = document.querySelectorAll('.icon-palette-item img');
    
    console.log('Found', roomLabels.length, 'room labels and', iconImages.length, 'icons');
    
    roomLabels.forEach(label => {
        label.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Room label clicked:', label.textContent);
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
            console.log('Icon clicked:', img.alt);
            selectElement('icon', img.src, null, img.alt);
        });
    });

    // NEW: Setup icon edit controls
    setupIconEditControls();
}

// NEW: Setup icon edit controls
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
    
    if (!scaleSlider || !widthSlider || !heightSlider || !rotationSlider) {
        console.warn('Icon edit controls not found in DOM - they will be added when needed');
        return;
    }
    
    // Scale slider
    scaleSlider.addEventListener('input', (e) => {
        if (!editingIcon || !originalIconProperties) return;
        const scale = parseFloat(e.target.value);
        editingIcon.width = originalIconProperties.width * scale;
        editingIcon.height = originalIconProperties.height * scale;
        scaleDisplay.textContent = scale.toFixed(1);
        CanvasManager.redraw();
    });
    
    // Width slider
    widthSlider.addEventListener('input', (e) => {
        if (!editingIcon || !originalIconProperties) return;
        const widthScale = parseFloat(e.target.value);
        editingIcon.width = originalIconProperties.width * widthScale;
        widthDisplay.textContent = widthScale.toFixed(1);
        CanvasManager.redraw();
    });
    
    // Height slider
    heightSlider.addEventListener('input', (e) => {
        if (!editingIcon || !originalIconProperties) return;
        const heightScale = parseFloat(e.target.value);
        editingIcon.height = originalIconProperties.height * heightScale;
        heightDisplay.textContent = heightScale.toFixed(1);
        CanvasManager.redraw();
    });
    
    // Rotation slider (0-7 representing 8 positions: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)
    rotationSlider.addEventListener('input', (e) => {
        if (!editingIcon) return;
        const step = parseInt(e.target.value);
        const rotation = step * 45; // 45 degree increments
        editingIcon.rotation = (rotation * Math.PI) / 180; // Convert to radians
        rotationDisplay.textContent = rotation + '°';
        CanvasManager.redraw();
    });
    
    // Reset button
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (!editingIcon || !originalIconProperties) return;
            resetIconToOriginal();
        });
    }
    
    // Delete button
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (!editingIcon) return;
            deleteElement(editingIcon);
            hideIconEditControls();
        });
    }
    
    // Done button
    if (doneBtn) {
        doneBtn.addEventListener('click', () => {
            finishIconEditing();
        });
    }
}

// NEW: Show icon edit controls
function showIconEditControls(icon) {
    editingIcon = icon;
    
    // Store original properties for reset functionality
    originalIconProperties = {
        width: icon.width,
        height: icon.height,
        rotation: icon.rotation || 0
    };
    
    // Calculate current scale factors
    const currentScaleX = icon.width / originalIconProperties.width;
    const currentScaleY = icon.height / originalIconProperties.height;
    const currentRotationDegrees = ((icon.rotation || 0) * 180) / Math.PI;
    const currentRotationStep = Math.round(currentRotationDegrees / 45);
    
    // Set slider values - check if they exist first
    const scaleSlider = document.getElementById('scaleSlider');
    const widthSlider = document.getElementById('widthSlider');
    const heightSlider = document.getElementById('heightSlider');
    const rotationSlider = document.getElementById('rotationSlider');
    
    const scaleDisplay = document.getElementById('scaleDisplay');
    const widthDisplay = document.getElementById('widthDisplay');
    const heightDisplay = document.getElementById('heightDisplay');
    const rotationDisplay = document.getElementById('rotationDisplay');
    
    if (!scaleSlider || !widthSlider || !heightSlider || !rotationSlider) {
        console.warn('Slider controls not found - make sure the HTML is added');
        return;
    }
    
    // For scale, use the average of width and height scales
    const averageScale = (currentScaleX + currentScaleY) / 2;
    
    scaleSlider.value = averageScale;
    widthSlider.value = currentScaleX;
    heightSlider.value = currentScaleY;
    rotationSlider.value = currentRotationStep;
    
    // Update displays if they exist
    if (scaleDisplay && widthDisplay && heightDisplay && rotationDisplay) {
        scaleDisplay.textContent = averageScale.toFixed(1);
        widthDisplay.textContent = currentScaleX.toFixed(1);
        heightDisplay.textContent = currentScaleY.toFixed(1);
        rotationDisplay.textContent = (currentRotationStep * 45) + '°';
    }
    
    // Hide all regular bottom palettes
    document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
    
    // Show icon edit controls
    const controls = document.getElementById('iconEditControls');
    if (controls) {
        controls.classList.remove('hidden');
    }
    
    CanvasManager.redraw();
}

// NEW: Hide icon edit controls
function hideIconEditControls() {
    const controls = document.getElementById('iconEditControls');
    if (controls) {
        controls.classList.add('hidden');
    }
    editingIcon = null;
    originalIconProperties = null;
}

// NEW: Reset icon to original properties
function resetIconToOriginal() {
    if (!editingIcon || !originalIconProperties) return;
    
    editingIcon.width = originalIconProperties.width;
    editingIcon.height = originalIconProperties.height;
    editingIcon.rotation = originalIconProperties.rotation;
    
    // Reset sliders - check if they exist first
    const scaleSlider = document.getElementById('scaleSlider');
    const widthSlider = document.getElementById('widthSlider');
    const heightSlider = document.getElementById('heightSlider');
    const rotationSlider = document.getElementById('rotationSlider');
    
    const scaleDisplay = document.getElementById('scaleDisplay');
    const widthDisplay = document.getElementById('widthDisplay');
    const heightDisplay = document.getElementById('heightDisplay');
    const rotationDisplay = document.getElementById('rotationDisplay');
    
    if (scaleSlider && widthSlider && heightSlider && rotationSlider) {
        scaleSlider.value = 1;
        widthSlider.value = 1;
        heightSlider.value = 1;
        rotationSlider.value = 0;
        
        if (scaleDisplay && widthDisplay && heightDisplay && rotationDisplay) {
            scaleDisplay.textContent = '1.0';
            widthDisplay.textContent = '1.0';
            heightDisplay.textContent = '1.0';
            rotationDisplay.textContent = '0°';
        }
    }
    
    CanvasManager.redraw();
    CanvasManager.saveAction();
}

// KEPT: Original THREE RESIZE MODES function (for backward compatibility)
function getIconEditHandle(icon, x, y) {
    // For slider-based editing, we don't need handles, but keeping for compatibility
    if (!isEditMode || editingIcon !== icon) {
        return null;
    }
    
    // On mobile or when slider controls are active, don't use handles
    if (isMobileDevice() || document.getElementById('iconEditControls')?.classList.contains('hidden') === false) {
        return null;
    }
    
    // Keep original handle logic for desktop fallback
    const handleSize = 20;
    const deleteSize = 20;
    const rotateSize = 20;
    
    const centerX = icon.x + icon.width / 2;
    const centerY = icon.y + icon.height / 2;
    
    // Delete button (upper-right, outside icon boundary)
    const deleteX = icon.x + icon.width + 10;
    const deleteY = icon.y - 10;
    const deleteDist = Math.sqrt((x - deleteX) * (x - deleteX) + (y - deleteY) * (y - deleteY));
    if (deleteDist <= deleteSize/2) {
        return 'delete';
    }
    
    // Rotate button (fixed position above and to the left of icon)
    const rotateOffsetX = -10;
    const rotateOffsetY = -10;
    const rotateX = icon.x + rotateOffsetX;
    const rotateY = icon.y + rotateOffsetY;
    const rotateDist = Math.sqrt((x - rotateX) * (x - rotateX) + (y - rotateY) * (y - rotateY));
    if (rotateDist <= rotateSize/2) {
        return 'rotate';
    }
    
    // Proportional resize (bottom-left corner)
    const swCornerX = icon.x;
    const swCornerY = icon.y + icon.height;
    const swDistance = Math.sqrt((x - swCornerX) * (x - swCornerX) + (y - swCornerY) * (y - swCornerY));
    if (swDistance <= handleSize/2) {
        return 'proportional';
    }
    
    // Horizontal-only resize (middle-right edge)
    const rightEdgeX = icon.x + icon.width;
    const rightEdgeY = icon.y + icon.height / 2;
    const rightDistance = Math.sqrt((x - rightEdgeX) * (x - rightEdgeX) + (y - rightEdgeY) * (y - rightEdgeY));
    if (rightDistance <= handleSize/2) {
        return 'horizontal';
    }
    
    // Vertical-only resize (bottom-center edge)
    const bottomEdgeX = icon.x + icon.width / 2;
    const bottomEdgeY = icon.y + icon.height;
    const bottomDistance = Math.sqrt((x - bottomEdgeX) * (x - bottomEdgeX) + (y - bottomEdgeY) * (y - bottomEdgeY));
    if (bottomDistance <= handleSize/2) {
        return 'vertical';
    }
    
    return null;
}

// KEPT: Calculate distance between two points
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
}

// KEPT: Calculate angle between two points
function angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

// KEPT: Rotate icon function
function rotateIcon90Degrees(icon) {
    console.log('DEBUG: *** rotateIcon90Degrees() called! ***');
    console.log('DEBUG: Icon before rotation:', icon);
    
    if (!icon) {
        console.log('DEBUG: ERROR - No icon provided to rotateIcon90Degrees!');
        return;
    }
    
    // Initialize rotation if not set
    if (typeof icon.rotation !== 'number') {
        console.log('DEBUG: Icon rotation not set, initializing to 0');
        icon.rotation = 0;
    }
    
    const oldRotation = icon.rotation;
    
    // Add 90 degrees (π/2 radians) clockwise
    icon.rotation += Math.PI / 2;
    
    // Normalize rotation to keep it between 0 and 2π
    while (icon.rotation >= 2 * Math.PI) {
        icon.rotation -= 2 * Math.PI;
    }
    while (icon.rotation < 0) {
        icon.rotation += 2 * Math.PI;
    }
    
    console.log('DEBUG: Rotation changed from', (oldRotation * 180 / Math.PI), 'degrees to', (icon.rotation * 180 / Math.PI), 'degrees');
    console.log('DEBUG: Icon after rotation:', icon);
    
    // Force immediate redraw and save
    console.log('DEBUG: About to redraw canvas and save action');
    CanvasManager.redraw();
    CanvasManager.saveAction();
    console.log('DEBUG: *** rotateIcon90Degrees() completed! ***');
}

// KEPT: Viewport pan handlers
function handleViewportMouseDown(e) {
    console.log('DEBUG: handleViewportMouseDown() called');
    if (e.button !== 0) return; // Only left mouse button

    const viewport = document.getElementById('canvasViewport');
    const rect = viewport.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) - AppState.viewportTransform.x;
    const canvasY = (e.clientY - rect.top) - AppState.viewportTransform.y;
    console.log('DEBUG: Mouse down at canvas coords:', canvasX, canvasY);

    // PRIORITY 1: Check for icon edit handles on the CURRENTLY editing icon (only if sliders not shown)
    if (isEditMode && editingIcon && !isMobileDevice()) {
        const handle = getIconEditHandle(editingIcon, canvasX, canvasY);
        console.log('DEBUG: In edit mode, checking for handles on editingIcon. Handle detected:', handle);

        if (handle) {
            // CRITICAL: Prevent all further event processing for handle clicks
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (handle === 'delete') {
                console.log('DEBUG: Delete handle clicked');
                deleteElement(editingIcon);
                return;
            } else if (handle === 'rotate') {
                console.log('DEBUG: *** ROTATE HANDLE CLICKED! ***');
                rotateIcon90Degrees(editingIcon);
                // CRITICAL: Don't set any flags that might interfere
                return;
            } else if (['proportional', 'horizontal', 'vertical'].includes(handle)) {
                console.log('DEBUG: Resize handle clicked:', handle);
                isResizing = true;
                isDragging = true;
                resizeHandle = handle;
                dragOffset.x = canvasX;
                dragOffset.y = canvasY;
                canvas.style.cursor = 'grabbing';
                return;
            }
        }
    }

    // Original logic for other actions (dragging, panning)
    const elementAtPoint = getElementAt(canvasX, canvasY);
    console.log('DEBUG: Element at point:', elementAtPoint);

    if (elementAtPoint && !editingIcon) {
        console.log('DEBUG: Starting element dragging');
        isDragging = true;
        draggedElement = elementAtPoint;
        dragOffset.x = canvasX - draggedElement.x;
        dragOffset.y = canvasY - draggedElement.y;
        canvas.style.cursor = 'grabbing';
    } else if (!selectedElement && !editingIcon) {
        console.log('DEBUG: Starting panning');
        isPanning = true;
        lastPanPoint = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
    }
}

function handleViewportMouseMove(e) {
    if (isResizing && editingIcon && resizeHandle) {
        // PRIORITY 1: Handle icon resizing
        e.preventDefault();
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left) - AppState.viewportTransform.x;
        const canvasY = (e.clientY - rect.top) - AppState.viewportTransform.y;
        handleIconResize(canvasX, canvasY);
        CanvasManager.redraw();
    } else if (isDragging && draggedElement && !isResizing && !isRotating && !editingIcon) {
        // PRIORITY 2: Handle element dragging (DISABLED when editing an icon)
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left) - AppState.viewportTransform.x;
        const canvasY = (e.clientY - rect.top) - AppState.viewportTransform.y;
        draggedElement.x = canvasX - dragOffset.x;
        draggedElement.y = canvasY - dragOffset.y;
        CanvasManager.redraw();
    } else if (isPanning && !isDragging && !isResizing && !isRotating && !editingIcon) {
        // PRIORITY 3: Handle panning (DISABLED when editing an icon)
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
    console.log('DEBUG: handleViewportMouseUp() called');
    // Save action if we were doing any modification
    if ((isDragging && draggedElement) || isResizing || isRotating) {
        CanvasManager.saveAction();
    }
    
    // Reset all interaction states
    isPanning = false;
    isDragging = false;
    isResizing = false;
    isRotating = false;
    resizeHandle = null;
    draggedElement = null;
    
    // Reset cursor
    canvas.style.cursor = selectedElement ? 'none' : 'default';
}

function handleWheel(e) {
    e.preventDefault();
    
    const viewport = document.getElementById('canvasViewport');
    const rect = viewport.getBoundingClientRect();
    
    // Get mouse position relative to viewport
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Much less aggressive zoom (was 0.9/1.1, now 0.97/1.03)
    const scaleFactor = e.deltaY > 0 ? 0.97 : 1.03;
    const newScale = Math.max(0.1, Math.min(5, AppState.viewportTransform.scale * scaleFactor));
    
    // Adjust position to zoom towards mouse cursor
    const scaleChange = newScale - AppState.viewportTransform.scale;
    AppState.viewportTransform.x -= mouseX * scaleChange;
    AppState.viewportTransform.y -= mouseY * scaleChange;
    AppState.viewportTransform.scale = newScale;
    
    CanvasManager.updateViewportTransform();
    CanvasManager.redraw();
    
    // Clear existing timeout
    if (wheelTimeout) {
        clearTimeout(wheelTimeout);
    }
    
    // Set new timeout to center after zooming stops
    wheelTimeout = setTimeout(() => {
        centerViewOnElements();
    }, 500); // Wait 500ms after last wheel event
}

// KEPT: handleViewportTouchStart with slider integration
function handleViewportTouchStart(e) {
    console.log('DEBUG: handleViewportTouchStart() called with', e.touches.length, 'touches');
    
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        const canvasX = (touch.clientX - rect.left) - AppState.viewportTransform.x;
        const canvasY = (touch.clientY - rect.top) - AppState.viewportTransform.y;
        
        console.log('DEBUG: Touch at canvas coords:', canvasX, canvasY);

        // PRIORITY 1: Check for icon edit handles only on desktop (mobile uses sliders)
        if (isEditMode && editingIcon && !isMobileDevice()) {
            const handle = getIconEditHandle(editingIcon, canvasX, canvasY);
            console.log('DEBUG: Touch - checking for handles on editingIcon. Handle detected:', handle);
            
            if (handle) {
                // CRITICAL: Prevent all further event processing for handle touches
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                if (handle === 'delete') {
                    console.log('DEBUG: Delete handle touched');
                    deleteElement(editingIcon);
                } else if (handle === 'rotate') {
                    console.log('DEBUG: *** ROTATE HANDLE TOUCHED! ***');
                    isRotating = true;
                    rotateIcon90Degrees(editingIcon);
                    isRotating = false;
                    // Revalidate editingIcon and reset touch context
                    setTimeout(() => {
                        editingIcon = AppState.placedElements.find(el => el === editingIcon);
                        CanvasManager.redraw();
                    }, 10);
                } else if (['proportional', 'horizontal', 'vertical'].includes(handle)) {
                    console.log('DEBUG: Resize handle touched:', handle);
                    isResizing = true;
                    isDragging = true;
                    resizeHandle = handle;
                    dragOffset.x = canvasX;
                    dragOffset.y = canvasY;
                }
                return; // Action handled, so we exit the function.
            }
        }
        
        const elementAtPoint = getElementAt(canvasX, canvasY);
        console.log('DEBUG: Element at touch point:', elementAtPoint);
        
        if (isEditMode && elementAtPoint && elementAtPoint.type === 'icon') {
            e.preventDefault();
            // Use slider controls for mobile, handles for desktop
            if (isMobileDevice()) {
                showIconEditControls(elementAtPoint);
            } else {
                editingIcon = elementAtPoint;
                CanvasManager.redraw();
            }
            return;
        }

        if (isEditMode && elementAtPoint && elementAtPoint.type === 'room') {
            e.preventDefault();
            const deleteSize = 20;
            const deleteX = elementAtPoint.x + elementAtPoint.width + 5;
            const deleteY = elementAtPoint.y - 2;
            const centerX = deleteX + deleteSize/2;
            const centerY = deleteY + deleteSize/2;
            const distance = Math.sqrt((canvasX - centerX) * (canvasX - centerX) + (canvasY - centerY) * (canvasY - centerY));
            if (distance <= deleteSize/2) {
                return;
            } else {
                return;
            }
        }
        
        if (!isEditMode && elementAtPoint && !editingIcon) {
            e.preventDefault();
            draggedElement = elementAtPoint;
            isDragging = true;
            dragOffset.x = canvasX - draggedElement.x;
            dragOffset.y = canvasY - draggedElement.y;
        } else if (selectedElement && !isEditMode && !editingIcon) {
            e.preventDefault();
        }
    } else if (e.touches.length === 2 && !editingIcon) {
        e.preventDefault();
        isGesturing = true;
        isPanning = false;
        isDragging = false;
        isResizing = false;
        isRotating = false;
        draggedElement = null;
        
        lastTouchCenter = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
    }
}

function handleViewportTouchMove(e) {
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        // Calculate canvas coordinates
        const canvasX = (touch.clientX - rect.left) - AppState.viewportTransform.x;
        const canvasY = (touch.clientY - rect.top) - AppState.viewportTransform.y;
        
        if (isResizing && editingIcon && resizeHandle) {
            // Handle icon resizing
            e.preventDefault();
            console.log('DEBUG: Resizing icon with handle:', resizeHandle);
            handleIconResize(canvasX, canvasY);
            CanvasManager.redraw();
        } else if (isDragging && draggedElement && !editingIcon) {
            // Single touch dragging an element (DISABLED when editing an icon)
            e.preventDefault();
            draggedElement.x = canvasX - dragOffset.x;
            draggedElement.y = canvasY - dragOffset.y;
            CanvasManager.redraw();
        }
    } else if (e.touches.length === 2 && isGesturing && !editingIcon) {
        // Two touches - pan only (DISABLED when editing an icon)
        e.preventDefault();
        
        // If we were doing something else, stop it
        if (isDragging || isResizing || isRotating) {
            isDragging = false;
            isResizing = false;
            isRotating = false;
            draggedElement = null;
        }
        
        // Calculate new center point
        const newCenter = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
        
        // Pan based on center point movement
        const panDx = newCenter.x - lastTouchCenter.x;
        const panDy = newCenter.y - lastTouchCenter.y;
        AppState.viewportTransform.x += panDx;
        AppState.viewportTransform.y += panDy;
        
        lastTouchCenter = newCenter;
        CanvasManager.updateViewportTransform();
        CanvasManager.redraw();
    }
}

// UPDATED: handleViewportTouchEnd with slider integration
function handleViewportTouchEnd(e) {
    console.log('DEBUG: handleViewportTouchEnd() called');
    
    // Handle edit mode touch interactions
    if (isEditMode && e.changedTouches.length > 0 && !isDragging && !isResizing && !isRotating) {
        console.log('DEBUG: Handling edit mode touch end');
        const touch = e.changedTouches[0];
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        // Calculate canvas coordinates
        const canvasX = (touch.clientX - rect.left) - AppState.viewportTransform.x;
        const canvasY = (touch.clientY - rect.top) - AppState.viewportTransform.y;
        
        // Skip handle checking on mobile when using sliders
        if (!isMobileDevice() && editingIcon) {
            const handle = getIconEditHandle(editingIcon, canvasX, canvasY);
            console.log('DEBUG: Touch end - checking for handles, found:', handle);
            
            if (handle) {
                console.log('DEBUG: Touch ended on a handle - KEEPING edit mode active');
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
        
        const clickedElement = getElementAt(canvasX, canvasY);
        console.log('DEBUG: Clicked element on touch end:', clickedElement);
        
        if (clickedElement && clickedElement.type === 'room') {
            // Check if tapping on delete button area
            const deleteSize = 20;
            const deleteX = clickedElement.x + clickedElement.width + 5;
            const deleteY = clickedElement.y - 2;
            const centerX = deleteX + deleteSize/2;
            const centerY = deleteY + deleteSize/2;
            const distance = Math.sqrt((canvasX - centerX) * (canvasX - centerX) + (canvasY - centerY) * (canvasY - centerY));
            
            if (distance <= deleteSize/2) {
                // Delete button was handled
            } else {
                // Tapped on room label for editing
                e.preventDefault();
                e.stopPropagation();
                hideIconEditControls(); // Hide icon controls
                startEditingElement(clickedElement);
                return;
            }
        } else if (clickedElement && clickedElement.type === 'icon') {
            // Tapped on icon - show appropriate controls (sliders for mobile, handles for desktop)
            console.log('DEBUG: Tapped on icon, showing controls');
            e.preventDefault();
            e.stopPropagation();
            finishEditing(); // Finish any text editing
            if (isMobileDevice()) {
                showIconEditControls(clickedElement);
            } else {
                editingIcon = clickedElement;
                CanvasManager.redraw();
            }
            return;
        } else {
            // Only finish editing if we tapped somewhere completely away from any elements
            console.log('DEBUG: Tapped elsewhere, finishing editing');
            hideIconEditControls();
            finishEditing();
        }
    }
    
    // Handle placing elements (only when NOT in edit mode)
    if (!isEditMode && selectedElement && e.touches.length === 0 && !isDragging && !isResizing && !isRotating) {
        console.log('DEBUG: Placing element from touch end');
        e.preventDefault();
        const pos = getEventPos(e);
        placeElement(pos.x, pos.y);
    }
    
    if (e.touches.length === 0) {
        // All touches ended - save action if we were modifying
        if ((isDragging && draggedElement) || isResizing || isRotating) {
            console.log('DEBUG: Saving action after touch interaction');
            CanvasManager.saveAction();
        }
        
        // Reset all states
        isPanning = false;
        isGesturing = false;
        isDragging = false;
        isResizing = false;
        isRotating = false;
        resizeHandle = null;
        draggedElement = null;
    } else if (e.touches.length === 1) {
        // Switching from two fingers to one - stop gesturing
        isGesturing = false;
    }
}

// KEPT: THREE RESIZE MODES function
function handleIconResize(x, y) {
    if (!editingIcon || !resizeHandle) return;
    
    const dx = x - dragOffset.x;
    const dy = y - dragOffset.y;
    
    // Store original values
    const originalWidth = editingIcon.width;
    const originalHeight = editingIcon.height;
    const originalX = editingIcon.x;
    const originalY = editingIcon.y;
    
    console.log('Resizing icon:', resizeHandle, 'dx:', dx, 'dy:', dy);
    
    switch (resizeHandle) {
        case 'proportional':
            // Proportional scaling - maintains aspect ratio
            // FIXED: Invert the logic so dragging outward makes it bigger
            const aspectRatio = originalWidth / originalHeight;
            
            // Calculate distance from starting point
            const totalMovement = Math.sqrt(dx * dx + dy * dy);
            
            // Determine if scaling up or down based on movement away from center
            const centerX = originalX + originalWidth / 2;
            const centerY = originalY + originalHeight / 2;
            
            // Calculate if moving away from or toward center
            const startDistanceFromCenter = Math.sqrt(
                (dragOffset.x - centerX) * (dragOffset.x - centerX) + 
                (dragOffset.y - centerY) * (dragOffset.y - centerY)
            );
            const currentDistanceFromCenter = Math.sqrt(
                (x - centerX) * (x - centerX) + 
                (y - centerY) * (y - centerY)
            );
            
            const isScalingUp = currentDistanceFromCenter > startDistanceFromCenter;
            const scaleFactor = totalMovement / Math.max(originalWidth, originalHeight);
            const scale = isScalingUp ? 1 + scaleFactor : 1 - scaleFactor;
            
            const newWidth = Math.max(20, originalWidth * scale);
            const newHeight = Math.max(20, originalHeight * scale);
            
            editingIcon.width = newWidth;
            editingIcon.height = newHeight;
            
            // Adjust position to keep bottom-left corner fixed
            editingIcon.x = originalX + (originalWidth - newWidth);
            // Y position stays the same for SW corner
            break;
            
        case 'horizontal':
            // Horizontal-only scaling - only width changes
            const newWidthH = Math.max(20, originalWidth + dx);
            editingIcon.width = newWidthH;
            // Height and position stay the same
            break;
            
        case 'vertical':
            // Vertical-only scaling - only height changes
            const newHeightV = Math.max(20, originalHeight + dy);
            editingIcon.height = newHeightV;
            // Width and position stay the same
            break;
    }
    
    dragOffset.x = x;
    dragOffset.y = y;
}

// UPDATED: finishIconEditing function
function finishIconEditing() {
    console.log('DEBUG: finishIconEditing() called');
    hideIconEditControls(); // Hide slider controls
    
    // Automatically show the icons palette
    const iconsPalette = document.getElementById('iconsPalette');
    if (iconsPalette) {
        // Hide all other palettes first
        document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
        // Show icons palette
        iconsPalette.classList.remove('hidden');
        lastVisiblePalette = 'iconsPalette'; // Remember it's visible
        
        // Also update the button states
        const paletteButtons = document.querySelectorAll('[data-palette]');
        paletteButtons.forEach(btn => btn.classList.remove('active'));
        const iconsBtn = document.getElementById('iconsBtn');
        if (iconsBtn) {
            iconsBtn.classList.add('active');
        }
    }
    
    editingIcon = null;
    isResizing = false;
    isRotating = false;
    resizeHandle = null;
    CanvasManager.saveAction(); // Save the changes
    CanvasManager.redraw();
}

function selectElement(type, content, styling, alt = '') {
    console.log('selectElement called:', type, content);
    selectedElement = { type, content, styling, alt };
    
    // Hide current visible palette and remember which one it was
    const visiblePalette = document.querySelector('.one-of-bottom-pallets:not(.hidden)');
    if (visiblePalette) {
        lastVisiblePalette = visiblePalette.id;
        visiblePalette.classList.add('hidden');
    }
    
    const customCursor = document.getElementById('customCursor');
    
    if (!customCursor) {
        console.warn('Custom cursor element not found');
        return;
    }
    
    console.log('Creating custom cursor for:', content);
    
    // On mobile devices, don't show the custom cursor immediately
    if (isMobileDevice()) {
        // Hide the custom cursor on mobile - it will only appear when placed
        customCursor.classList.add('hidden');
        customCursor.innerHTML = '';
        canvas.style.cursor = 'default';
    } else {
        // Desktop behavior - show custom cursor
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
        document.addEventListener('touchmove', updateCustomCursor, { passive: false });
    }
    
    console.log('Custom cursor setup complete for mobile:', isMobileDevice());
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
    
    // Convert to canvas coordinates considering viewport transform
    const canvasX = (clientX - rect.left) - AppState.viewportTransform.x;
    const canvasY = (clientY - rect.top) - AppState.viewportTransform.y;
    
    return { x: canvasX, y: canvasY };
}

// UPDATED: handleCanvasClick function
function handleCanvasClick(e) {
    console.log('DEBUG: handleCanvasClick() called');
    
    // Get the click position
    const pos = getEventPos(e);
    
    // PRIORITY 1: Check for icon edit handles FIRST in edit mode (only on desktop)
    if (isEditMode && editingIcon && !isMobileDevice()) {
        const handle = getIconEditHandle(editingIcon, pos.x, pos.y);
        console.log('DEBUG: handleCanvasClick - checking for handles, found:', handle);
        
        if (handle) {
            console.log('DEBUG: Handle detected in canvas click, preventing default behavior');
            e.preventDefault();
            e.stopPropagation();
            
            if (handle === 'delete') {
                console.log('DEBUG: Delete handle in canvas click');
                deleteElement(editingIcon);
                return;
            } else if (handle === 'rotate') {
                console.log('DEBUG: ROTATE HANDLE in canvas click - IGNORING (already handled in mousedown)');
                // DON'T call rotateIcon90Degrees here - it was already called in mousedown
                return;
            } else if (['proportional', 'horizontal', 'vertical'].includes(handle)) {
                console.log('DEBUG: Resize handle in canvas click:', handle);
                // Don't do anything here - resize is handled in mouse down/move
                return;
            }
        }
    }
    
    // Only proceed with normal click behavior if no handles were clicked
    if (selectedElement && !isPanning && !isDragging && !isResizing && !isRotating) {
        placeElement(pos.x, pos.y);
    } else if (isEditMode && !isPanning && !isDragging && !isResizing && !isRotating) {
        // In edit mode, check if clicking on a room label or icon
        const clickedElement = getElementAt(pos.x, pos.y);
        
        console.log('DEBUG: Canvas click in edit mode, element:', clickedElement);
        
        if (clickedElement && clickedElement.type === 'room') {
            e.preventDefault();
            e.stopPropagation();
            hideIconEditControls(); // Hide icon controls
            startEditingElement(clickedElement);
        } else if (clickedElement && clickedElement.type === 'icon') {
            e.preventDefault();
            e.stopPropagation();
            console.log('DEBUG: Icon clicked in edit mode');
            finishEditing(); // Finish any text editing
            // Use appropriate editing method based on device
            if (isMobileDevice()) {
                showIconEditControls(clickedElement);
            } else {
                editingIcon = clickedElement;
                CanvasManager.redraw();
            }
        } else {
            // If clicking elsewhere, finish any current editing
            hideIconEditControls();
            finishEditing();
        }
    }
}

function placeElement(x, y) {
    if (!selectedElement) return;
    const textWidth = selectedElement.type === 'room' ? Math.max(58, selectedElement.content.length * 8 + 8) : 45;
    const newElement = {
        id: Date.now(),
        type: selectedElement.type,
        content: selectedElement.content,
        styling: selectedElement.styling,
        alt: selectedElement.alt,
        x: x,
        y: y,
        width: selectedElement.type === 'icon' ? 45 : textWidth,
        height: selectedElement.type === 'icon' ? 45 : 16,
        rotation: 0 // Initialize rotation for all elements
    };
    AppState.placedElements.push(newElement);
    selectedElement = null;
    hideCustomCursor();
    CanvasManager.redraw();
    CanvasManager.saveAction();
    console.log('DEBUG: Element placed:', newElement);
}

function getElementAt(x, y) {
    console.log('DEBUG: getElementAt() called with coords:', x, y);
    console.log('DEBUG: Total placed elements:', AppState.placedElements.length);
    
    for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
        const element = AppState.placedElements[i];
        
        console.log('DEBUG: Checking element', i, ':', element);
        
        // In edit mode, check for icon edit handles first (only on desktop)
        if (isEditMode && element.type === 'icon' && editingIcon === element && !isMobileDevice()) {
            console.log('DEBUG: Checking icon edit handles for element', i);
            const handle = getIconEditHandle(element, x, y);
            if (handle === 'delete') {
                console.log('DEBUG: Delete handle detected, deleting element');
                deleteElement(element);
                return null;
            }
        }
        
        // In edit mode, check if clicking on delete button for room elements
        if (isEditMode && element.type === 'room') {
            const deleteSize = 20; // Updated to match drawing size
            const deleteX = element.x + element.width + 5; // Updated to match drawing position
            const deleteY = element.y - 2; // Updated to match drawing position
            
            // Check if click is within delete button area (circular hit detection)
            const centerX = deleteX + deleteSize/2;
            const centerY = deleteY + deleteSize/2;
            const distance = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
            
            if (distance <= deleteSize/2) {
                // Handle delete action
                console.log('DEBUG: Room delete button clicked');
                deleteElement(element);
                return null; // Return null to prevent further processing
            }
        }
        
        // Check if clicking on the element itself
        if (x >= element.x && x <= element.x + element.width && 
            y >= element.y && y <= element.y + element.height) {
            console.log('DEBUG: Element hit detected:', element);
            return element;
        }
    }
    console.log('DEBUG: No element found at coordinates');
    return null;
}

function startEditingElement(element) {
    // Finish any current editing first
    finishEditing();
    
    editingElement = element;
    
    // Create an input element for editing
    editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.value = element.content;
    editInput.style.position = 'fixed'; // Use fixed positioning
    
    // Calculate screen position
    const viewport = document.getElementById('canvasViewport');
    const rect = viewport.getBoundingClientRect();
    const screenX = rect.left + AppState.viewportTransform.x + element.x;
    const screenY = rect.top + AppState.viewportTransform.y + element.y;
    
    editInput.style.left = screenX + 'px';
    editInput.style.top = screenY + 'px';
    
    // CHANGE: Set a wider width during editing (enough for 4-5 words)
    const editingWidth = Math.max(160, element.content.length * 8 + 40); // Wider for editing
    editInput.style.width = editingWidth + 'px';
    
    editInput.style.height = (element.height + 8) + 'px'; // Slightly taller for mobile
    editInput.style.fontSize = '16px'; // Always 16px to prevent zoom
    editInput.style.fontWeight = '600';
    editInput.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    editInput.style.border = '3px solid #3498db';
    editInput.style.borderRadius = '4px';
    editInput.style.padding = '4px 8px';
    editInput.style.backgroundColor = 'white';
    editInput.style.color = '#333';
    editInput.style.zIndex = '999999'; // Very high z-index
    editInput.style.textAlign = 'center';
    editInput.style.touchAction = 'auto';
    editInput.style.userSelect = 'text';
    editInput.style.webkitUserSelect = 'text';
    editInput.style.pointerEvents = 'auto';
    editInput.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    
    // Mobile-specific attributes
    editInput.setAttribute('autocomplete', 'off');
    editInput.setAttribute('autocorrect', 'off');
    editInput.setAttribute('autocapitalize', 'off');
    editInput.setAttribute('spellcheck', 'false');
    editInput.setAttribute('inputmode', 'text');
    
    // Debug logging
    console.log('Creating edit input for element:', element.content);
    
    // Add event listeners
    editInput.addEventListener('blur', () => {
        console.log('Input blurred');
        setTimeout(finishEditing, 200);
    });
    editInput.addEventListener('keydown', handleEditKeydown);
    
    // Add touch event handlers to prevent propagation
    editInput.addEventListener('touchstart', (e) => {
        console.log('Touch start on input');
        e.stopPropagation();
    }, { passive: false });
    
    editInput.addEventListener('click', (e) => {
        console.log('Click on input');
        e.stopPropagation();
    });
    
    // Add to document body for highest z-index context
    document.body.appendChild(editInput);
    
    // Store reference for position updates
    editInput._updatePosition = () => {
        const rect = viewport.getBoundingClientRect();
        const screenX = rect.left + AppState.viewportTransform.x + element.x;
        const screenY = rect.top + AppState.viewportTransform.y + element.y;
        editInput.style.left = screenX + 'px';
        editInput.style.top = screenY + 'px';
    };
    
    // Focus handling with multiple strategies
    if (isMobileDevice()) {
        console.log('Mobile device detected, attempting focus...');
        
        // Strategy 1: Immediate focus
        editInput.focus();
        
        // Strategy 2: Delayed focus
        setTimeout(() => {
            console.log('Attempting delayed focus...');
            editInput.focus();
            editInput.click(); // Simulate click
        }, 100);
        
        // Strategy 3: Force selection
        setTimeout(() => {
            if (document.activeElement === editInput) {
                console.log('Input is focused, selecting text');
                editInput.setSelectionRange(0, editInput.value.length);
            } else {
                console.log('Input not focused, trying again...');
                editInput.focus();
            }
        }, 300);
    } else {
        // Desktop - immediate focus
        setTimeout(() => {
            editInput.focus();
            editInput.select();
        }, 50);
    }
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

// UPDATED: finishEditing function
function finishEditing() {
  if (!editingElement || !editInput) return;
  const newContent = editInput.value.trim();
  let contentChanged = false;
  if (newContent && newContent !== editingElement.content) {
    editingElement.content = newContent;
    editingElement.width = Math.max(58, newContent.length * 8 + 8);
    contentChanged = true;
  }
  cleanupEditing();
  if (contentChanged) {
    CanvasManager.saveAction();
  }
  // Don't automatically exit edit mode - let user control this
  CanvasManager.redraw();
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
    console.log('DEBUG: deleteElement() called for:', element);
    const index = AppState.placedElements.indexOf(element);
    if (index > -1) {
        AppState.placedElements.splice(index, 1);
        // If we were editing this element, clear the editing state
        if (editingIcon === element) {
            hideIconEditControls(); // NEW: Hide slider controls
        }
        CanvasManager.redraw();
        CanvasManager.saveAction();
        console.log('DEBUG: Element deleted successfully');
    }
}

// UPDATED: drawIconEditHandles function - simplified for slider integration
function drawIconEditHandles(element) {
    // REMOVED: Debug logging that was spamming console during every redraw
    if (!isEditMode || editingIcon !== element) {
        return;
    }
    
    // If slider controls are visible (mobile), just show a simple border
    const sliderControlsVisible = !document.getElementById('iconEditControls')?.classList.contains('hidden');
    if (sliderControlsVisible) {
        // Just draw a simple border around the editing icon
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(element.x - 3, element.y - 3, element.width + 6, element.height + 6);
        ctx.setLineDash([]);
        // REMOVED: Debug logging
        return;
    }
    
    // Desktop mode - draw full handles
    const handleSize = 22;
    const deleteSize = 22;
    const rotateSize = 25;
    
    // REMOVED: Debug logging that was spamming console
    
    // Draw red boundary around icon
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(element.x - 2, element.y - 2, element.width + 4, element.height + 4);
    ctx.setLineDash([]);
    
    // Proportional resize (bottom-left corner) - BLUE
    const swCorner = { x: element.x, y: element.y + element.height };
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(swCorner.x, swCorner.y, handleSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(swCorner.x, swCorner.y, handleSize/2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const arrowSize = 4;
    ctx.beginPath();
    ctx.moveTo(swCorner.x + arrowSize, swCorner.y - arrowSize);
    ctx.lineTo(swCorner.x - arrowSize, swCorner.y + arrowSize);
    ctx.moveTo(swCorner.x - arrowSize, swCorner.y + arrowSize);
    ctx.lineTo(swCorner.x - arrowSize + 2, swCorner.y + arrowSize - 2);
    ctx.moveTo(swCorner.x + arrowSize, swCorner.y - arrowSize);
    ctx.lineTo(swCorner.x + arrowSize - 2, swCorner.y - arrowSize + 2);
    ctx.stroke();
    
    // Horizontal resize (middle-right edge) - GREEN
    const rightEdge = { x: element.x + element.width, y: element.y + element.height / 2 };
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.arc(rightEdge.x, rightEdge.y, handleSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(rightEdge.x, rightEdge.y, handleSize/2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rightEdge.x - arrowSize, rightEdge.y);
    ctx.lineTo(rightEdge.x + arrowSize, rightEdge.y);
    ctx.moveTo(rightEdge.x + arrowSize, rightEdge.y);
    ctx.lineTo(rightEdge.x + arrowSize - 2, rightEdge.y - 2);
    ctx.moveTo(rightEdge.x + arrowSize, rightEdge.y);
    ctx.lineTo(rightEdge.x + arrowSize - 2, rightEdge.y + 2);
    ctx.stroke();
    
    // Vertical resize (bottom-center edge) - ORANGE
    const bottomEdge = { x: element.x + element.width / 2, y: element.y + element.height };
    ctx.fillStyle = '#f39c12';
    ctx.beginPath();
    ctx.arc(bottomEdge.x, bottomEdge.y, handleSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bottomEdge.x, bottomEdge.y, handleSize/2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bottomEdge.x, bottomEdge.y - arrowSize);
    ctx.lineTo(bottomEdge.x, bottomEdge.y + arrowSize);
    ctx.moveTo(bottomEdge.x, bottomEdge.y + arrowSize);
    ctx.lineTo(bottomEdge.x - 2, bottomEdge.y + arrowSize - 2);
    ctx.moveTo(bottomEdge.x, bottomEdge.y + arrowSize);
    ctx.lineTo(bottomEdge.x + 2, bottomEdge.y + arrowSize - 2);
    ctx.stroke();
    
    // Rotate button (fixed position above and to the left of icon) - PURPLE
    const rotateOffsetX = -10;
    const rotateOffsetY = -10;
    const rotateX = element.x + rotateOffsetX;
    const rotateY = element.y + rotateOffsetY;
    
    // REMOVED: Debug logging for rotate button position
    
    ctx.fillStyle = '#9b59b6';
    ctx.beginPath();
    ctx.arc(rotateX, rotateY, rotateSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(rotateX, rotateY, rotateSize/2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(rotateX, rotateY, 6, -Math.PI/2, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rotateX + 4, rotateY + 2);
    ctx.lineTo(rotateX + 6, rotateY);
    ctx.lineTo(rotateX + 6, rotateY + 4);
    ctx.stroke();
    
    // Delete button (upper-right, outside icon boundary) - RED
    const deleteX = element.x + element.width + 10;
    const deleteY = element.y - 10;
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(deleteX, deleteY, deleteSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(deleteX, deleteY, deleteSize/2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const offset = 5;
    ctx.beginPath();
    ctx.moveTo(deleteX - offset, deleteY - offset);
    ctx.lineTo(deleteX + offset, deleteY + offset);
    ctx.moveTo(deleteX + offset, deleteY - offset);
    ctx.lineTo(deleteX - offset, deleteY + offset);
    ctx.stroke();
    
    // REMOVED: Completion logging
}

function updateCustomCursor(e) {
    // Only update custom cursor on desktop
    if (isMobileDevice()) return;
    
    const customCursor = document.getElementById('customCursor');
    if (customCursor) {
        let clientX, clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        customCursor.style.left = (clientX + 10) + 'px';
        customCursor.style.top = (clientY - 10) + 'px';
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
    document.removeEventListener('touchmove', updateCustomCursor);
    
    // Restore the last visible palette
    if (lastVisiblePalette) {
        const palette = document.getElementById(lastVisiblePalette);
        if (palette) {
            palette.classList.remove('hidden');
        }
        lastVisiblePalette = null;
    }
}

// REPLACE the existing updateLegend function with this:
function updateLegend() {
    let bedrooms = 0;
    let bathrooms = 0;
    AppState.placedElements.forEach(element => {
        if (element.type === 'room') {
            const label = element.content.toLowerCase();
            if (label.includes('bedroom')) {
                bedrooms++;
            } else if (label.includes('1/2 bath')) {
                // Handle 1/2 bath first to avoid double counting
                bathrooms += 0.5;
            } else if (label.includes('bath.m') || label.includes('bath')) {
                // Only count as full bath if it's not already counted as 1/2 bath
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

// UPDATED: toggleEditMode function
function toggleEditMode() {
    console.log('DEBUG: toggleEditMode() called, current isEditMode:', isEditMode);
    isEditMode = !isEditMode;
    const modeIndicator = document.getElementById('modeIndicator');
    const editBtn = document.getElementById('editBtn');
    
    // Finish any current editing when toggling modes
    finishEditing();
    hideIconEditControls(); // NEW: Hide icon edit controls
    
    if (isEditMode) {
        modeIndicator.textContent = 'EDITING';
        modeIndicator.classList.add('edit-mode');
        editBtn.classList.add('active');
        console.log('DEBUG: Edit mode ENABLED');
    } else {
        modeIndicator.textContent = 'READY';
        modeIndicator.classList.remove('edit-mode');
        editBtn.classList.remove('active');
        console.log('DEBUG: Edit mode DISABLED');
    }
    
    // Redraw to show/hide delete buttons and edit handles
    CanvasManager.redraw();
}

function showpallets(id) {
    const target = document.getElementById(id);
    const isVisible = !target.classList.contains('hidden');
    document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
    if (!isVisible) {
        target.classList.remove('hidden');
        lastVisiblePalette = id; // Remember which palette is now visible
    }
}

// Updated showangleinput function in sketch.js
// Replace the existing showangleinput function with this version
 

function showangleinput() {
    const angleDisplay = document.getElementById('angleDisplay');
    const cornerArrows = document.querySelectorAll('.dir-btn.up-left, .dir-btn.up-right, .dir-btn.down-left, .dir-btn.down-right');
    
    if (angleDisplay.classList.contains('hidden')) {
        // Show angle input
        angleDisplay.classList.remove('hidden');
        cornerArrows.forEach(arrow => { 
            arrow.style.backgroundColor = '#FFB366'; 
        });
        
        // MOBILE FOCUS HANDLING - borrowed from drawing.js
        // Temporarily suppress redraws during focus to prevent interference
        let suppressRedrawForInput = true;
        
        // Setup mobile-specific attributes
        if (isMobileDevice()) {
            angleDisplay.setAttribute('readonly', 'readonly');
            angleDisplay.setAttribute('inputmode', 'none');
            angleDisplay.style.caretColor = 'transparent';
            console.log('Angle field setup - mobile device detected, native keyboard prevented');
        } else {
            // Desktop - allow normal keyboard input (but keep readonly to match drawing.js pattern)
            angleDisplay.setAttribute('readonly', 'readonly');
            angleDisplay.setAttribute('inputmode', 'none');
            angleDisplay.style.caretColor = 'transparent';
            console.log('Angle field setup - desktop device');
        }
        
        // Reset angle value
        angleDisplay.value = '0.0';
        
        // IMPROVED FOCUS HANDLING with multiple strategies (from drawing.js)
        setTimeout(() => {
            if (isMobileDevice()) {
                console.log('Mobile device detected, attempting angle input focus...');
                
                // Strategy 1: Immediate focus
                angleDisplay.focus();
                
                // Strategy 2: Delayed focus
                setTimeout(() => {
                    console.log('Attempting delayed angle input focus...');
                    angleDisplay.focus();
                    angleDisplay.click(); // Simulate click
                }, 100);
                
                // Strategy 3: Force selection
                setTimeout(() => {
                    if (document.activeElement === angleDisplay) {
                        console.log('Angle input is focused, selecting text');
                        angleDisplay.setSelectionRange(0, angleDisplay.value.length);
                    } else {
                        console.log('Angle input not focused, trying again...');
                        angleDisplay.focus();
                    }
                }, 300);
                
                // Update visual active state (if you have this function)
                if (typeof updateActiveInputVisuals === 'function') {
                    updateActiveInputVisuals(angleDisplay);
                }
            } else {
                // Desktop - immediate focus
                angleDisplay.focus();
                angleDisplay.select();
            }
            
            // Re-enable redraws after focus is established
            setTimeout(() => {
                suppressRedrawForInput = false;
            }, 400);
        }, 50);
        
    } else {
        // Hide angle input
        angleDisplay.classList.add('hidden');
        cornerArrows.forEach(arrow => { 
            arrow.style.backgroundColor = '#3498db'; 
        });
        
        // Refocus distance input when hiding angle input
        const distanceInput = document.getElementById('distanceDisplay');
        if (distanceInput) {
            setTimeout(() => {
                distanceInput.focus();
                if (!isMobileDevice()) {
                    distanceInput.select();
                }
                
                // Update visual active state (if you have this function)
                if (typeof updateActiveInputVisuals === 'function') {
                    updateActiveInputVisuals(distanceInput);
                }
            }, 50);
        }
    }
}



export { showpallets, showangleinput, initSketchModule, toggleLegend, toggleEditMode };