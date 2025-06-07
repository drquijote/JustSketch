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

// Viewport pan handlers
function handleViewportMouseDown(e) {
    if (e.button !== 0) return; // Only left mouse button
    
    const viewport = document.getElementById('canvasViewport');
    const rect = viewport.getBoundingClientRect();
    
    // Calculate canvas coordinates
    const canvasX = (e.clientX - rect.left) - viewportTransform.x;
    const canvasY = (e.clientY - rect.top) - viewportTransform.y;
    
    // Check if clicking on an element
    draggedElement = getElementAt(canvasX, canvasY);
    
    if (draggedElement) {
        isDragging = true;
        dragOffset.x = canvasX - draggedElement.x;
        dragOffset.y = canvasY - draggedElement.y;
        canvas.style.cursor = 'grabbing';
    } else if (!selectedElement) {
        // Start panning on desktop with mouse drag
        isPanning = true;
        lastPanPoint = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
    }
}

function handleViewportMouseMove(e) {
    if (isPanning) {
        const dx = e.clientX - lastPanPoint.x;
        const dy = e.clientY - lastPanPoint.y;
        
        viewportTransform.x += dx;
        viewportTransform.y += dy;
        
        lastPanPoint = { x: e.clientX, y: e.clientY };
        updateViewportTransform();
        redrawCanvas();
    } else if (isDragging && draggedElement) {
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        // Calculate canvas coordinates
        const canvasX = (e.clientX - rect.left) - viewportTransform.x;
        const canvasY = (e.clientY - rect.top) - viewportTransform.y;
        
        draggedElement.x = canvasX - dragOffset.x;
        draggedElement.y = canvasY - dragOffset.y;
        redrawCanvas();
    }
}

function handleViewportMouseUp(e) {
    if (isPanning) {
        isPanning = false;
        canvas.style.cursor = selectedElement ? 'none' : 'default';
    }
    if (isDragging && draggedElement) {
        isDragging = false;
        draggedElement = null;
        canvas.style.cursor = selectedElement ? 'none' : 'default';
        saveAction();
    }
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
            const deleteSize = 16;
            const deleteX = elementAtPoint.x + elementAtPoint.width - deleteSize;
            const deleteY = elementAtPoint.y;
            
            // If touching delete button area, allow normal processing (delete will happen in getElementAt)
            if (canvasX >= deleteX && canvasX <= deleteX + deleteSize && 
                canvasY >= deleteY && canvasY <= deleteY + deleteSize) {
                e.preventDefault();
                return;
            } else {
                // Touching room label for editing - DON'T start dragging
                e.preventDefault();
                return;
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
        draggedElement = null; // Cancel any dragging
        
        // Calculate center point for panning
        lastTouchCenter = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
    }
}

function handleViewportTouchMove(e) {
    if (e.touches.length === 1 && isDragging && draggedElement) {
        // Single touch dragging an element
        e.preventDefault();
        const touch = e.touches[0];
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        // Calculate canvas coordinates
        const canvasX = (touch.clientX - rect.left) - viewportTransform.x;
        const canvasY = (touch.clientY - rect.top) - viewportTransform.y;
        
        draggedElement.x = canvasX - dragOffset.x;
        draggedElement.y = canvasY - dragOffset.y;
        redrawCanvas();
    } else if (e.touches.length === 2 && isGesturing) {
        // Two touches - pan only
        e.preventDefault();
        
        // If we were dragging, stop it
        if (isDragging) {
            isDragging = false;
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
    if (isEditMode && e.changedTouches.length > 0 && !isDragging) {
        const touch = e.changedTouches[0];
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        // Calculate canvas coordinates
        const canvasX = (touch.clientX - rect.left) - viewportTransform.x;
        const canvasY = (touch.clientY - rect.top) - viewportTransform.y;
        
        const clickedElement = getElementAt(canvasX, canvasY);
        
        if (clickedElement && clickedElement.type === 'room') {
            // Check if tapping on delete button area
            const deleteSize = 16;
            const deleteX = clickedElement.x + clickedElement.width - deleteSize;
            const deleteY = clickedElement.y;
            
            if (canvasX >= deleteX && canvasX <= deleteX + deleteSize && 
                canvasY >= deleteY && canvasY <= deleteY + deleteSize) {
                // Delete button was handled in getElementAt, do nothing
            } else {
                // Tapped on room label for editing
                e.preventDefault();
                e.stopPropagation();
                startEditingElement(clickedElement);
                return;
            }
        } else {
            // Tapped elsewhere, finish any current editing
            finishEditing();
        }
    }
    
    if (selectedElement && e.touches.length === 0 && !isDragging && !isEditMode) {
        // Place element with single tap (only when not in edit mode)
        e.preventDefault();
        const pos = getEventPos(e);
        placeElement(pos.x, pos.y);
    }
    
    if (e.touches.length === 0) {
        // All touches ended
        isPanning = false;
        isGesturing = false;
        if (isDragging && draggedElement) {
            saveAction();
        }
        isDragging = false;
        draggedElement = null;
    } else if (e.touches.length === 1) {
        // Switching from two fingers to one - stop gesturing
        isGesturing = false;
    }
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
    if (selectedElement && !isPanning && !isDragging) {
        const pos = getEventPos(e);
        placeElement(pos.x, pos.y);
    } else if (isEditMode && !isPanning && !isDragging) {
        // In edit mode, check if clicking on a room label
        const pos = getEventPos(e);
        const clickedElement = getElementAt(pos.x, pos.y);
        
        if (clickedElement && clickedElement.type === 'room') {
            e.preventDefault();
            e.stopPropagation();
            startEditingElement(clickedElement);
        } else {
            // If clicking elsewhere, finish any current editing
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
        height: selectedElement.type === 'icon' ? 45 : 16
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
        
        // In edit mode, check if clicking on delete button for room elements
        if (isEditMode && element.type === 'room') {
            const deleteSize = 16;
            const deleteX = element.x + element.width - deleteSize;
            const deleteY = element.y;
            
            // Check if click is within delete button area
            if (x >= deleteX && x <= deleteX + deleteSize && 
                y >= deleteY && y <= deleteY + deleteSize) {
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
    editInput.style.position = 'absolute';
    editInput.style.left = (element.x + viewportTransform.x) + 'px';
    editInput.style.top = (element.y + viewportTransform.y) + 'px';
    editInput.style.width = element.width + 'px';
    editInput.style.height = element.height + 'px';
    editInput.style.fontSize = '12px';
    editInput.style.fontWeight = '600';
    editInput.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    editInput.style.border = '2px solid #3498db';
    editInput.style.borderRadius = '4px';
    editInput.style.padding = '2px 4px';
    editInput.style.backgroundColor = 'white';
    editInput.style.color = '#333';
    editInput.style.zIndex = '1001';
    editInput.style.textAlign = 'center';
    
    // Mobile-specific styling to ensure keyboard appears
    if (isMobileDevice()) {
        editInput.style.fontSize = '16px'; // Prevent zoom on iOS
        editInput.style.transform = 'scale(0.75)'; // Scale down to match original size
        editInput.style.transformOrigin = 'top left';
        editInput.setAttribute('autocomplete', 'off');
        editInput.setAttribute('autocorrect', 'off');
        editInput.setAttribute('autocapitalize', 'off');
        editInput.setAttribute('spellcheck', 'false');
        // Ensure input is not readonly and can receive focus
        editInput.removeAttribute('readonly');
        editInput.style.pointerEvents = 'auto';
        editInput.style.userSelect = 'text';
        editInput.style.webkitUserSelect = 'text';
    }
    
    // Add event listeners
    editInput.addEventListener('blur', finishEditing);
    editInput.addEventListener('keydown', handleEditKeydown);
    
    // Mobile-specific event listeners
    if (isMobileDevice()) {
        editInput.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        });
        editInput.addEventListener('touchend', (e) => {
            e.stopPropagation();
        });
        editInput.addEventListener('focus', (e) => {
            console.log('Input focused on mobile');
            // Scroll input into view if needed
            setTimeout(() => {
                editInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        });
    }
    
    // Add to viewport container so it moves with the canvas
    const viewport = document.getElementById('canvasViewport');
    viewport.appendChild(editInput);
    
    // Focus and select all text with multiple attempts for mobile
    if (isMobileDevice()) {
        // Multiple focus attempts for mobile reliability
        setTimeout(() => {
            editInput.focus();
            editInput.click(); // Trigger click to ensure keyboard
        }, 50);
        
        setTimeout(() => {
            editInput.focus();
            editInput.select();
        }, 150);
        
        setTimeout(() => {
            if (document.activeElement !== editInput) {
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
    if (newContent && newContent !== editingElement.content) {
        // Update the element content
        editingElement.content = newContent;
        // Recalculate width based on new content
        editingElement.width = Math.max(58, newContent.length * 8 + 8);
        redrawCanvas();
        saveAction();
    }
    
    cleanupEditing();
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
        redrawCanvas();
        saveAction();
    }
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
            
            // Draw delete button (red X) in edit mode
            if (isEditMode && element !== editingElement) {
                const deleteSize = 16;
                const deleteX = element.x + element.width - deleteSize;
                const deleteY = element.y;
                
                // Draw red circle background
                ctx.fillStyle = '#e74c3c';
                ctx.beginPath();
                ctx.arc(deleteX + deleteSize/2, deleteY + deleteSize/2, deleteSize/2, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw white X
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                const offset = 4;
                ctx.beginPath();
                ctx.moveTo(deleteX + offset, deleteY + offset);
                ctx.lineTo(deleteX + deleteSize - offset, deleteY + deleteSize - offset);
                ctx.moveTo(deleteX + deleteSize - offset, deleteY + offset);
                ctx.lineTo(deleteX + offset, deleteY + deleteSize - offset);
                ctx.stroke();
            }
        } else if (element.type === 'icon') {
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
        redrawCanvas();
    }
}

function redo() {
    if (historyIndex < actionHistory.length - 1) {
        historyIndex++;
        placedElements = JSON.parse(JSON.stringify(actionHistory[historyIndex]));
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
    
    if (isEditMode) {
        modeIndicator.textContent = 'EDITING';
        modeIndicator.classList.add('edit-mode');
        editBtn.classList.add('active');
    } else {
        modeIndicator.textContent = 'READY';
        modeIndicator.classList.remove('edit-mode');
        editBtn.classList.remove('active');
    }
    
    // Redraw to show/hide delete buttons
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