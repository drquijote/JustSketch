// src/sketch.js
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
let isResizing = false;
let isRotating = false;
let resizeHandle = null;
let rotationStartAngle = 0;
let elementStartRotation = 0;

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

// Mobile detection
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
}

function initCanvas() {
    canvas = document.getElementById('drawingCanvas');
    ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;
    
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
    
    updateViewportTransform();
    redrawCanvas();
    saveAction();
}

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
}

// Get icon edit handle at position
function getIconEditHandle(icon, x, y) {
    if (!isEditMode || editingIcon !== icon) return null;
    
    const handleSize = 12;
    const deleteSize = 20; // Bigger delete button
    const centerX = icon.x + icon.width / 2;
    const centerY = icon.y + icon.height / 2;
    
    // Delete button (upper-right, outside icon boundary) - bigger hit area
    const deleteX = icon.x + icon.width + 5; // Position outside icon boundary
    const deleteY = icon.y - 5; // Position outside icon boundary
    if (x >= deleteX - deleteSize/2 && x <= deleteX + deleteSize/2 && 
        y >= deleteY - deleteSize/2 && y <= deleteY + deleteSize/2) {
        return 'delete';
    }
    
    // Rotation handle (top-center, extended) - bigger size
    const rotateX = centerX;
    const rotateY = icon.y - 30;
    const rotateSize = 20; // Same size as delete button
    if (x >= rotateX - rotateSize/2 && x <= rotateX + rotateSize/2 && 
        y >= rotateY - rotateSize/2 && y <= rotateY + rotateSize/2) {
        return 'rotate';
    }
    
    // Corner resize handles
    const corners = [
        { x: icon.x - handleSize/2, y: icon.y - handleSize/2, handle: 'nw' },
        { x: icon.x + icon.width - handleSize/2, y: icon.y - handleSize/2, handle: 'ne' },
        { x: icon.x - handleSize/2, y: icon.y + icon.height - handleSize/2, handle: 'sw' },
        { x: icon.x + icon.width - handleSize/2, y: icon.y + icon.height - handleSize/2, handle: 'se' }
    ];
    
    for (const corner of corners) {
        if (x >= corner.x && x <= corner.x + handleSize && 
            y >= corner.y && y <= corner.y + handleSize) {
            return corner.handle;
        }
    }
    
    return null;
}

// Calculate distance between two points
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
}

// Calculate angle between two points
function angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

// Viewport pan handlers
function handleViewportMouseDown(e) {
    if (e.button !== 0) return; // Only left mouse button
    
    const viewport = document.getElementById('canvasViewport');
    const rect = viewport.getBoundingClientRect();
    
    // Calculate canvas coordinates
    const canvasX = (e.clientX - rect.left) - viewportTransform.x;
    const canvasY = (e.clientY - rect.top) - viewportTransform.y;
    
    // Check for element at mouse position
    const elementAtPoint = getElementAt(canvasX, canvasY);
    
    // PRIORITY 1: Check for icon edit handles in edit mode
    if (isEditMode && elementAtPoint && elementAtPoint.type === 'icon') {
        const handle = getIconEditHandle(elementAtPoint, canvasX, canvasY);
        if (handle) {
            e.preventDefault();
            e.stopPropagation();
            if (handle === 'delete') {
                deleteElement(elementAtPoint);
                return;
            } else if (handle === 'rotate') {
                isRotating = true;
                isDragging = true;
                editingIcon = elementAtPoint;
                const centerX = elementAtPoint.x + elementAtPoint.width / 2;
                const centerY = elementAtPoint.y + elementAtPoint.height / 2;
                rotationStartAngle = angle(centerX, centerY, canvasX, canvasY);
                elementStartRotation = elementAtPoint.rotation || 0;
                canvas.style.cursor = 'grabbing';
                return;
            } else if (['nw', 'ne', 'sw', 'se'].includes(handle)) {
                isResizing = true;
                isDragging = true;
                editingIcon = elementAtPoint;
                resizeHandle = handle;
                dragOffset.x = canvasX;
                dragOffset.y = canvasY;
                canvas.style.cursor = 'grabbing';
                return;
            }
        }
    }
    
    // PRIORITY 2: Regular element dragging
    if (elementAtPoint) {
        isDragging = true;
        draggedElement = elementAtPoint;
        dragOffset.x = canvasX - draggedElement.x;
        dragOffset.y = canvasY - draggedElement.y;
        canvas.style.cursor = 'grabbing';
    } else if (!selectedElement) {
        // PRIORITY 3: Start panning only if no element interaction
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
        const canvasX = (e.clientX - rect.left) - viewportTransform.x;
        const canvasY = (e.clientY - rect.top) - viewportTransform.y;
        handleIconResize(canvasX, canvasY);
        redrawCanvas();
    } else if (isRotating && editingIcon) {
        // PRIORITY 2: Handle icon rotation
        e.preventDefault();
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left) - viewportTransform.x;
        const canvasY = (e.clientY - rect.top) - viewportTransform.y;
        handleIconRotation(canvasX, canvasY);
        redrawCanvas();
    } else if (isDragging && draggedElement && !isResizing && !isRotating) {
        // PRIORITY 3: Handle element dragging
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left) - viewportTransform.x;
        const canvasY = (e.clientY - rect.top) - viewportTransform.y;
        draggedElement.x = canvasX - dragOffset.x;
        draggedElement.y = canvasY - dragOffset.y;
        redrawCanvas();
    } else if (isPanning && !isDragging && !isResizing && !isRotating) {
        // PRIORITY 4: Handle panning
        const dx = e.clientX - lastPanPoint.x;
        const dy = e.clientY - lastPanPoint.y;
        viewportTransform.x += dx;
        viewportTransform.y += dy;
        lastPanPoint = { x: e.clientX, y: e.clientY };
        updateViewportTransform();
        redrawCanvas();
    }
}

function handleViewportMouseUp(e) {
    // Save action if we were doing any modification
    if ((isDragging && draggedElement) || isResizing || isRotating) {
        saveAction();
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
    const newScale = Math.max(0.1, Math.min(5, viewportTransform.scale * scaleFactor));
    
    // Adjust position to zoom towards mouse cursor
    const scaleChange = newScale - viewportTransform.scale;
    viewportTransform.x -= mouseX * scaleChange;
    viewportTransform.y -= mouseY * scaleChange;
    viewportTransform.scale = newScale;
    
    updateViewportTransform();
    redrawCanvas();
    
    // Clear existing timeout
    if (wheelTimeout) {
        clearTimeout(wheelTimeout);
    }
    
    // Set new timeout to center after zooming stops
    wheelTimeout = setTimeout(() => {
        centerViewOnElements();
    }, 500); // Wait 500ms after last wheel event
}

function handleViewportTouchStart(e) {
    if (e.touches.length === 1) {
        // Single touch
        const touch = e.touches[0];
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        // Calculate canvas coordinates
        const canvasX = (touch.clientX - rect.left) - viewportTransform.x;
        const canvasY = (touch.clientY - rect.top) - viewportTransform.y;
        
        // Check for element at touch point
        const elementAtPoint = getElementAt(canvasX, canvasY);
        
        // In edit mode, prevent dragging of room elements (except delete button)
        if (isEditMode && elementAtPoint && elementAtPoint.type === 'room') {
            const deleteSize = 20; // Updated size
            const deleteX = elementAtPoint.x + elementAtPoint.width + 5; // Updated position
            const deleteY = elementAtPoint.y - 2; // Updated position
            
            // Check if touching delete button area (circular hit detection)
            const centerX = deleteX + deleteSize/2;
            const centerY = deleteY + deleteSize/2;
            const distance = Math.sqrt((canvasX - centerX) * (canvasX - centerX) + (canvasY - centerY) * (canvasY - centerY));
            
            if (distance <= deleteSize/2) {
                e.preventDefault();
                return;
            } else {
                // Touching room label for editing - DON'T start dragging
                e.preventDefault();
                return;
            }
        }
        
        // Check for icon edit handles in edit mode
        if (isEditMode && elementAtPoint && elementAtPoint.type === 'icon') {
            const handle = getIconEditHandle(elementAtPoint, canvasX, canvasY);
            if (handle) {
                e.preventDefault();
                if (handle === 'delete') {
                    deleteElement(elementAtPoint);
                    return;
                } else if (handle === 'rotate') {
                    isRotating = true;
                    isDragging = true; // Set dragging to true to enable move events
                    editingIcon = elementAtPoint;
                    const centerX = elementAtPoint.x + elementAtPoint.width / 2;
                    const centerY = elementAtPoint.y + elementAtPoint.height / 2;
                    rotationStartAngle = angle(centerX, centerY, canvasX, canvasY);
                    elementStartRotation = elementAtPoint.rotation || 0;
                    return;
                } else if (['nw', 'ne', 'sw', 'se'].includes(handle)) {
                    isResizing = true;
                    isDragging = true; // Set dragging to true to enable move events
                    editingIcon = elementAtPoint;
                    resizeHandle = handle;
                    dragOffset.x = canvasX;
                    dragOffset.y = canvasY;
                    return;
                }
            }
        }
        
        // Normal behavior - allow dragging when NOT in edit mode or when touching icons
        if (elementAtPoint) {
            e.preventDefault();
            draggedElement = elementAtPoint;
            isDragging = true;
            dragOffset.x = canvasX - draggedElement.x;
            dragOffset.y = canvasY - draggedElement.y;
        } else if (selectedElement) {
            // Allow placing elements with single touch
            e.preventDefault();
        }
        // Do NOT start panning with single touch
    } else if (e.touches.length === 2) {
        // Two touches - start panning only
        e.preventDefault();
        isGesturing = true;
        isPanning = false;
        isDragging = false;
        isResizing = false;
        isRotating = false;
        draggedElement = null; // Cancel any dragging
        
        // Calculate center point for panning
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
        const canvasX = (touch.clientX - rect.left) - viewportTransform.x;
        const canvasY = (touch.clientY - rect.top) - viewportTransform.y;
        
        if (isResizing && editingIcon && resizeHandle) {
            // Handle icon resizing
            e.preventDefault();
            handleIconResize(canvasX, canvasY);
            redrawCanvas();
        } else if (isRotating && editingIcon) {
            // Handle icon rotation
            e.preventDefault();
            handleIconRotation(canvasX, canvasY);
            redrawCanvas();
        } else if (isDragging && draggedElement) {
            // Single touch dragging an element
            e.preventDefault();
            draggedElement.x = canvasX - dragOffset.x;
            draggedElement.y = canvasY - dragOffset.y;
            redrawCanvas();
        }
    } else if (e.touches.length === 2 && isGesturing) {
        // Two touches - pan only
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
        viewportTransform.x += panDx;
        viewportTransform.y += panDy;
        
        lastTouchCenter = newCenter;
        updateViewportTransform();
        redrawCanvas();
    }
}

function handleViewportTouchEnd(e) {
    // Handle edit mode touch interactions
    if (isEditMode && e.changedTouches.length > 0 && !isDragging && !isResizing && !isRotating) {
        const touch = e.changedTouches[0];
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        // Calculate canvas coordinates
        const canvasX = (touch.clientX - rect.left) - viewportTransform.x;
        const canvasY = (touch.clientY - rect.top) - viewportTransform.y;
        
        const clickedElement = getElementAt(canvasX, canvasY);
        
        if (clickedElement && clickedElement.type === 'room') {
            // Check if tapping on delete button area (circular hit detection)
            const deleteSize = 20; // Updated size
            const deleteX = clickedElement.x + clickedElement.width + 5; // Updated position
            const deleteY = clickedElement.y - 2; // Updated position
            const centerX = deleteX + deleteSize/2;
            const centerY = deleteY + deleteSize/2;
            const distance = Math.sqrt((canvasX - centerX) * (canvasX - centerX) + (canvasY - centerY) * (canvasY - centerY));
            
            if (distance <= deleteSize/2) {
                // Delete button was handled in getElementAt, do nothing
            } else {
                // Tapped on room label for editing
                e.preventDefault();
                e.stopPropagation();
                startEditingElement(clickedElement);
                return;
            }
        } else if (clickedElement && clickedElement.type === 'icon') {
            // Tapped on icon - enter icon edit mode
            e.preventDefault();
            e.stopPropagation();
            editingIcon = clickedElement;
            redrawCanvas();
            return;
        } else {
            // Tapped elsewhere, finish any current editing
            finishIconEditing();
            finishEditing();
        }
    }
    
    if (selectedElement && e.touches.length === 0 && !isDragging && !isEditMode && !isResizing && !isRotating) {
        // Place element with single tap (only when not in edit mode)
        e.preventDefault();
        const pos = getEventPos(e);
        placeElement(pos.x, pos.y);
    }
    
    if (e.touches.length === 0) {
        // All touches ended - save action if we were modifying
        if ((isDragging && draggedElement) || isResizing || isRotating) {
            saveAction();
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

function handleIconResize(x, y) {
    if (!editingIcon || !resizeHandle) return;
    
    const dx = x - dragOffset.x;
    const dy = y - dragOffset.y;
    
    // Store original values for constraint checking
    const originalWidth = editingIcon.width;
    const originalHeight = editingIcon.height;
    const originalX = editingIcon.x;
    const originalY = editingIcon.y;
    
    switch (resizeHandle) {
        case 'nw':
            // Northwest corner - resize from top-left
            const newWidth_nw = Math.max(20, originalWidth - dx);
            const newHeight_nw = Math.max(20, originalHeight - dy);
            editingIcon.width = newWidth_nw;
            editingIcon.height = newHeight_nw;
            editingIcon.x = originalX + (originalWidth - newWidth_nw);
            editingIcon.y = originalY + (originalHeight - newHeight_nw);
            break;
        case 'ne':
            // Northeast corner - resize from top-right
            const newWidth_ne = Math.max(20, originalWidth + dx);
            const newHeight_ne = Math.max(20, originalHeight - dy);
            editingIcon.width = newWidth_ne;
            editingIcon.height = newHeight_ne;
            editingIcon.y = originalY + (originalHeight - newHeight_ne);
            break;
        case 'sw':
            // Southwest corner - resize from bottom-left
            const newWidth_sw = Math.max(20, originalWidth - dx);
            const newHeight_sw = Math.max(20, originalHeight + dy);
            editingIcon.width = newWidth_sw;
            editingIcon.height = newHeight_sw;
            editingIcon.x = originalX + (originalWidth - newWidth_sw);
            break;
        case 'se':
            // Southeast corner - resize from bottom-right
            editingIcon.width = Math.max(20, originalWidth + dx);
            editingIcon.height = Math.max(20, originalHeight + dy);
            break;
    }
    
    dragOffset.x = x;
    dragOffset.y = y;
}

function handleIconRotation(x, y) {
    if (!editingIcon) return;
    
    const centerX = editingIcon.x + editingIcon.width / 2;
    const centerY = editingIcon.y + editingIcon.height / 2;
    const currentAngle = angle(centerX, centerY, x, y);
    const deltaAngle = currentAngle - rotationStartAngle;
    
    // Apply rotation with some smoothing
    editingIcon.rotation = elementStartRotation + deltaAngle;
    
    // Normalize rotation to keep it between 0 and 2π for consistency
    while (editingIcon.rotation < 0) editingIcon.rotation += 2 * Math.PI;
    while (editingIcon.rotation >= 2 * Math.PI) editingIcon.rotation -= 2 * Math.PI;
}

function finishIconEditing() {
    editingIcon = null;
    isResizing = false;
    isRotating = false;
    resizeHandle = null;
}

function updateViewportTransform() {
    const container = document.getElementById('canvasContainer');
    container.style.transform = `translate(${viewportTransform.x}px, ${viewportTransform.y}px)`;
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
    const canvasX = (clientX - rect.left) - viewportTransform.x;
    const canvasY = (clientY - rect.top) - viewportTransform.y;
    
    return { x: canvasX, y: canvasY };
}

function handleCanvasClick(e) {
    if (selectedElement && !isPanning && !isDragging && !isResizing && !isRotating) {
        const pos = getEventPos(e);
        placeElement(pos.x, pos.y);
    } else if (isEditMode && !isPanning && !isDragging && !isResizing && !isRotating) {
        // In edit mode, check if clicking on a room label or icon
        const pos = getEventPos(e);
        const clickedElement = getElementAt(pos.x, pos.y);
        
        if (clickedElement && clickedElement.type === 'room') {
            e.preventDefault();
            e.stopPropagation();
            startEditingElement(clickedElement);
        } else if (clickedElement && clickedElement.type === 'icon') {
            e.preventDefault();
            e.stopPropagation();
            editingIcon = clickedElement;
            redrawCanvas();
        } else {
            // If clicking elsewhere, finish any current editing
            finishIconEditing();
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
    placedElements.push(newElement);
    selectedElement = null;
    hideCustomCursor();
    redrawCanvas();
    saveAction();
}

function getElementAt(x, y) {
    for (let i = placedElements.length - 1; i >= 0; i--) {
        const element = placedElements[i];
        
        // In edit mode, check for icon edit handles first
        if (isEditMode && element.type === 'icon' && editingIcon === element) {
            const handle = getIconEditHandle(element, x, y);
            if (handle === 'delete') {
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
                deleteElement(element);
                return null; // Return null to prevent further processing
            }
        }
        
        // Check if clicking on the element itself
        if (x >= element.x && x <= element.x + element.width && 
            y >= element.y && y <= element.y + element.height) {
            return element;
        }
    }
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
    const screenX = rect.left + viewportTransform.x + element.x;
    const screenY = rect.top + viewportTransform.y + element.y;
    
    editInput.style.left = screenX + 'px';
    editInput.style.top = screenY + 'px';
    editInput.style.width = element.width + 'px';
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
        const screenX = rect.left + viewportTransform.x + element.x;
        const screenY = rect.top + viewportTransform.y + element.y;
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
    saveAction();
  }
  isEditMode = false;
  const modeIndicator = document.getElementById('modeIndicator');
  const editBtn = document.getElementById('editBtn');
  modeIndicator.textContent = 'READY';
  modeIndicator.classList.remove('edit-mode');
  editBtn.classList.remove('active');
  redrawCanvas();
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
    const index = placedElements.indexOf(element);
    if (index > -1) {
        placedElements.splice(index, 1);
        // If we were editing this element, clear the editing state
        if (editingIcon === element) {
            finishIconEditing();
        }
        redrawCanvas();
        saveAction();
    }
}

function drawIconEditHandles(element) {
    if (!isEditMode || editingIcon !== element) return;
    
    const handleSize = 12;
    const deleteSize = 20; // Bigger delete button
    
    // Draw red boundary around icon
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(element.x - 2, element.y - 2, element.width + 4, element.height + 4);
    ctx.setLineDash([]);
    
    // Draw corner resize handles with hover effect styling
    const corners = [
        { x: element.x - handleSize/2, y: element.y - handleSize/2, label: 'NW' },
        { x: element.x + element.width - handleSize/2, y: element.y - handleSize/2, label: 'NE' },
        { x: element.x - handleSize/2, y: element.y + element.height - handleSize/2, label: 'SW' },
        { x: element.x + element.width - handleSize/2, y: element.y + element.height - handleSize/2, label: 'SE' }
    ];
    
    corners.forEach(corner => {
        // Draw handle background
        ctx.fillStyle = '#3498db';
        ctx.fillRect(corner.x, corner.y, handleSize, handleSize);
        
        // Draw handle border
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(corner.x, corner.y, handleSize, handleSize);
        
        // Draw resize arrows in corner
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        const centerX = corner.x + handleSize/2;
        const centerY = corner.y + handleSize/2;
        const arrowSize = 3;
        
        // Draw diagonal resize arrows based on corner
        if (corner.label === 'NW' || corner.label === 'SE') {
            // NW-SE diagonal arrows
            ctx.beginPath();
            ctx.moveTo(centerX - arrowSize, centerY - arrowSize);
            ctx.lineTo(centerX + arrowSize, centerY + arrowSize);
            ctx.moveTo(centerX + arrowSize, centerY + arrowSize);
            ctx.lineTo(centerX + arrowSize - 2, centerY + arrowSize - 2);
            ctx.moveTo(centerX - arrowSize, centerY - arrowSize);
            ctx.lineTo(centerX - arrowSize + 2, centerY - arrowSize + 2);
            ctx.stroke();
        } else {
            // NE-SW diagonal arrows
            ctx.beginPath();
            ctx.moveTo(centerX + arrowSize, centerY - arrowSize);
            ctx.lineTo(centerX - arrowSize, centerY + arrowSize);
            ctx.moveTo(centerX - arrowSize, centerY + arrowSize);
            ctx.lineTo(centerX - arrowSize + 2, centerY + arrowSize - 2);
            ctx.moveTo(centerX + arrowSize, centerY - arrowSize);
            ctx.lineTo(centerX + arrowSize - 2, centerY - arrowSize + 2);
            ctx.stroke();
        }
    });
    
    // Draw rotation handle (top-center, extended) - bigger size
    const centerX = element.x + element.width / 2;
    const rotateY = element.y - 30;
    const rotateSize = 20; // Same size as delete button
    
    // Draw line from icon to rotation handle
    ctx.strokeStyle = '#95a5a6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, element.y);
    ctx.lineTo(centerX, rotateY + rotateSize/2);
    ctx.stroke();
    
    // Draw rotation handle circle - bigger
    ctx.fillStyle = '#9b59b6';
    ctx.beginPath();
    ctx.arc(centerX, rotateY, rotateSize/2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw white border around rotation handle
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, rotateY, rotateSize/2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw rotation symbol - bigger
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, rotateY, 6, 0, Math.PI * 1.5);
    ctx.stroke();
    // Arrow tip - bigger
    ctx.beginPath();
    ctx.moveTo(centerX - 4, rotateY - 6);
    ctx.lineTo(centerX, rotateY - 8);
    ctx.lineTo(centerX + 2, rotateY - 4);
    ctx.stroke();
    
    // Draw delete button (upper-right, outside icon boundary) - bigger size
    const deleteX = element.x + element.width + 5; // Position outside icon boundary
    const deleteY = element.y - 5; // Position outside icon boundary
    
    // Draw red circle background
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(deleteX, deleteY, deleteSize/2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw white border around delete button
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(deleteX, deleteY, deleteSize/2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw white X - bigger and thicker
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
}

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save the current context state
    ctx.save();
    
    // Store loaded images to prevent reloading
    const imageCache = {};
    
    placedElements.forEach(element => {
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
            ctx.save();
            
            // Apply rotation if present
            if (element.rotation) {
                const centerX = element.x + element.width / 2;
                const centerY = element.y + element.height / 2;
                ctx.translate(centerX, centerY);
                ctx.rotate(element.rotation);
                ctx.translate(-centerX, -centerY);
            }
            
            if (!imageCache[element.content]) {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, element.x, element.y, element.width, element.height);
                    imageCache[element.content] = img;
                };
                img.src = element.content;
            } else {
                ctx.drawImage(imageCache[element.content], element.x, element.y, element.width, element.height);
            }
            
            ctx.restore();
            
            // Draw edit handles for icons in edit mode
            drawIconEditHandles(element);
        }
    });
    
    // Restore the context state
    ctx.restore();
    
    updateLegend();
}

function saveAction() {
    historyIndex++;
    actionHistory = actionHistory.slice(0, historyIndex);
    actionHistory.push(JSON.parse(JSON.stringify(placedElements)));
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        placedElements = JSON.parse(JSON.stringify(actionHistory[historyIndex]));
        finishIconEditing(); // Clear any icon editing state
        redrawCanvas();
    }
}

function redo() {
    if (historyIndex < actionHistory.length - 1) {
        historyIndex++;
        placedElements = JSON.parse(JSON.stringify(actionHistory[historyIndex]));
        finishIconEditing(); // Clear any icon editing state
        redrawCanvas();
    }
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

function updateLegend() {
    let bedrooms = 0;
    let bathrooms = 0;
    placedElements.forEach(element => {
        if (element.type === 'room') {
            const label = element.content.toLowerCase();
            if (label.includes('bedroom')) {
                bedrooms++;
            } else if (label.includes('bath.m') || label.includes('bath')) {
                bathrooms++;
            } else if (label.includes('1/2 bath')) {
                bathrooms += 0.5;
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

function toggleEditMode() {
    isEditMode = !isEditMode;
    const modeIndicator = document.getElementById('modeIndicator');
    const editBtn = document.getElementById('editBtn');
    
    // Finish any current editing when toggling modes
    finishEditing();
    finishIconEditing();
    
    if (isEditMode) {
        modeIndicator.textContent = 'EDITING';
        modeIndicator.classList.add('edit-mode');
        editBtn.classList.add('active');
    } else {
        modeIndicator.textContent = 'READY';
        modeIndicator.classList.remove('edit-mode');
        editBtn.classList.remove('active');
    }
    
    // Redraw to show/hide delete buttons and edit handles
    redrawCanvas();
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

function showangleinput() {
    const angleDisplay = document.getElementById('angleDisplay');
    const cornerArrows = document.querySelectorAll('.dir-btn.up-left, .dir-btn.up-right, .dir-btn.down-left, .dir-btn.down-right');
    if (angleDisplay.classList.contains('hidden')) {
        angleDisplay.classList.remove('hidden');
        cornerArrows.forEach(arrow => { arrow.style.backgroundColor = '#FFB366'; });
    } else {
        angleDisplay.classList.add('hidden');
        cornerArrows.forEach(arrow => { arrow.style.backgroundColor = '#3498db'; });
    }
}

export { showpallets, showangleinput, initCanvas, undo, redo, toggleLegend, toggleEditMode };