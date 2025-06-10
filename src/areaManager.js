import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { AreaHelpers } from './helpers.js';

export class AreaManager {
    constructor() {
        this.activePathForModal = null;
        this.PIXELS_PER_FOOT = 8;
        
        // Properties for area dragging
        this.dragStartPoint = { x: 0, y: 0 };
        this.draggedGroup = null;
        this.isDraggingArea = false;
        this.isEditModeActive = false; // Track if edit mode is active
    }

    init() {
        console.log('AreaManager: Initialized and listening for events.');
        AppState.on('app:cycleClosed', (e) => this.handleCycleClosed(e));
        AppState.on('canvas:redraw:polygons', () => this.drawCompletedAreas());
        
        // Listen for edit mode changes
        AppState.on('mode:editToggled', (e) => this.handleEditModeToggle(e));

        // *** NEW: Create area labels for existing polygons that don't have them ***
        this.ensureAreaLabelsExist();

        // Add listeners for area dragging
        const viewport = document.getElementById('canvasViewport');
        const boundTouchStart = this.handleCanvasTouchStart.bind(this);
        const boundTouchMove = this.handleCanvasTouchMove.bind(this);
        const boundTouchEnd = this.handleCanvasTouchEnd.bind(this);

        // Listen for touch events (for iPhone)
        viewport.addEventListener('touchstart', boundTouchStart, { passive: false });
        viewport.addEventListener('touchmove', boundTouchMove, { passive: false });
        viewport.addEventListener('touchend', boundTouchEnd, { passive: false });
        
        // Add mouse equivalents for desktop testing
        viewport.addEventListener('mousedown', (e) => boundTouchStart(this.createTouchEvent(e)));
        viewport.addEventListener('mousemove', (e) => boundTouchMove(this.createTouchEvent(e)));
        viewport.addEventListener('mouseup', (e) => boundTouchEnd(this.createTouchEvent(e)));
    }

    // *** NEW: Ensure all existing polygons have draggable labels ***
    ensureAreaLabelsExist() {
        if (!AppState.drawnPolygons) return;
        
        AppState.drawnPolygons.forEach(polygon => {
            // Check if this polygon already has a label element
            const existingLabel = AppState.placedElements.find(el => 
                el.type === 'area_label' && el.linkedPolygonId === polygon.id
            );
            
            if (!existingLabel) {
                console.log('Creating missing area label for polygon:', polygon.label);
                this.createAreaLabelElement(polygon);
            }
        });
    }

    // Handle edit mode toggle
    handleEditModeToggle(event) {
        this.isEditModeActive = event.detail.isEditMode;
        console.log('AreaManager: Edit mode', this.isEditModeActive ? 'ENABLED' : 'DISABLED');
        
        // If exiting edit mode while dragging, end the drag
        if (!this.isEditModeActive && this.isDraggingArea) {
            this.endAreaDrag();
        }
        
        // Update mode indicator if in area drag mode
        if (this.isDraggingArea && !this.isEditModeActive) {
            this.endAreaDrag();
        }
    }

    // Helper to create a consistent touch-like event from mouse events
    createTouchEvent(mouseEvent) {
        return {
            touches: [{
                clientX: mouseEvent.clientX,
                clientY: mouseEvent.clientY
            }],
            preventDefault: () => mouseEvent.preventDefault(),
            stopPropagation: () => mouseEvent.stopPropagation(),
            stopImmediatePropagation: () => {
                if (mouseEvent.stopImmediatePropagation) {
                    mouseEvent.stopImmediatePropagation();
                }
            }
        };
    }

    // --- Area Dragging Logic ---

    handleCanvasTouchStart(e) {
        // Only allow area dragging in edit mode and placement mode
        if (!this.isEditModeActive || AppState.currentMode !== 'placement') return;
        if (e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        const pos = CanvasManager.screenToCanvas(touch.clientX, touch.clientY);
        this.dragStartPoint = pos;

        // *** IMMEDIATE DRAG: Check if clicking on an area (no long press) ***
        let areaAtPoint = null;
        for (const poly of AppState.drawnPolygons) {
            if (AreaHelpers.isPointInPolygon(pos, poly.path)) {
                areaAtPoint = poly;
                break;
            }
        }
        
        if (areaAtPoint) {
            console.log("Edit mode: Starting area drag IMMEDIATELY (no long press)");
            this.prepareDragGroup(areaAtPoint, pos);
            this.isDraggingArea = true;
            
            // Prevent other systems from handling this event
            try {
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            } catch (error) {
                console.warn('Event method not available:', error.message);
            }
            
            // Return true to indicate we handled this event
            return true;
        }
        
        // Return false to let other systems handle the event
        return false;
    }

    handleCanvasTouchMove(e) {
        const touch = e.touches[0];
        if (!touch) return;
        const pos = CanvasManager.screenToCanvas(touch.clientX, touch.clientY);

        // Only handle dragging if we're in edit mode and actively dragging an area
        if (this.isEditModeActive && this.isDraggingArea && this.draggedGroup) {
            // Prevent other event handlers from interfering
            try {
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            } catch (error) {
                console.warn('Event method not available:', error.message);
            }

            const dx = pos.x - this.dragStartPoint.x;
            const dy = pos.y - this.dragStartPoint.y;

            this.moveDragGroup(dx, dy);
            this.dragStartPoint = pos; // Update position for the next movement delta
        }
    }

    handleCanvasTouchEnd(e) {
        if (this.isDraggingArea) {
            // Stop the event to prevent any unwanted final actions from other listeners
            try {
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            } catch (error) {
                console.warn('Event method not available:', error.message);
            }
            this.endAreaDrag();
        }
    }

    prepareDragGroup(polygon, clickPosition) {
        const elementsToDrag = AppState.placedElements.filter(el => {
            const elementCenter = { x: el.x + (el.width / 2), y: el.y + (el.height / 2) };
            return AreaHelpers.isPointInPolygon(elementCenter, polygon.path);
        });

        this.draggedGroup = {
            polygon: polygon,
            elements: elementsToDrag
        };
        this.dragStartPoint = clickPosition;
        
        // Visual feedback for drag mode
        const modeIndicator = document.getElementById('modeIndicator');
        if (modeIndicator) {
            modeIndicator.textContent = 'MOVING AREA';
            modeIndicator.style.background = '#f39c12';
        }
        
        console.log('Prepared drag group with', elementsToDrag.length, 'elements');
    }

    moveDragGroup(dx, dy) {
        if (!this.draggedGroup) return;

        // Move polygon vertices
        this.draggedGroup.polygon.path.forEach(p => {
            p.x += dx;
            p.y += dy;
        });
        
        // Move polygon centroid
        if (this.draggedGroup.polygon.centroid) {
            this.draggedGroup.polygon.centroid.x += dx;
            this.draggedGroup.polygon.centroid.y += dy;
        }
        
        // Move contained elements
        this.draggedGroup.elements.forEach(el => {
            el.x += dx;
            el.y += dy;
        });

        CanvasManager.redraw();
    }

    endAreaDrag() {
        if (this.draggedGroup) {
            CanvasManager.saveAction();
            console.log('Area drag completed, action saved');
        }
        
        this.draggedGroup = null;
        this.isDraggingArea = false;
        
        // Restore mode indicator to edit mode
        const modeIndicator = document.getElementById('modeIndicator');
        if (modeIndicator && this.isEditModeActive) {
            modeIndicator.textContent = 'EDITING';
            modeIndicator.style.background = '#8E44AD';
        }
    }

    // --- Standard Area Logic ---

    handleCycleClosed(event) {
        const path = event.detail.path;
        if (!path || path.length < 3) return;
        this.activePathForModal = path;
        this.showAreaModal();
    }

generateAreaLabel(areaType) {
    const typeSelect = document.getElementById('polygonType');
    if (!typeSelect) return `Area ${AppState.drawnPolygons.length + 1}`;

    const targetOption = typeSelect.querySelector(`option[value="${areaType}"]`);
    if (!targetOption) return `Area ${AppState.drawnPolygons.length + 1}`;

    // Get the base name (e.g., "Floor", "Garage") from the dropdown text
    const baseName = targetOption.textContent.trim().replace(/\s*\([^)]*\)/g, '').trim();

    // Count how many polygons of this type already exist
    const existingCount = AppState.drawnPolygons.filter(p => p.type === areaType).length;

    // --- THIS IS THE CHANGED LOGIC ---
    // If the base name is "Floor", always add a number, starting with 1.
    if (baseName === 'Floor') {
        return `${baseName} ${existingCount + 1}`;
    }

    // For all other types, keep the original behavior (numbering starts on the second instance).
    return existingCount > 0 ? `${baseName} ${existingCount + 1}` : baseName;
}

    showAreaModal() {
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');

        const defaultType = typeSelect.options[0]?.value || 'living';
        nameInput.value = this.generateAreaLabel(defaultType);
        typeSelect.value = defaultType;
        
        typeSelect.onchange = () => {
            nameInput.value = this.generateAreaLabel(typeSelect.value);
        };
        
        saveBtn.onclick = () => this.saveNewArea();
        cancelBtn.onclick = () => this.hideAreaModal();
        modal.classList.remove('hidden');
        nameInput.focus();
        setTimeout(() => nameInput.select(), 100);
    }

    hideAreaModal() {
        document.getElementById('polygonModal').classList.add('hidden');
        this.activePathForModal = null;
    }

    saveNewArea() {
        if (!this.activePathForModal) return;

        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        const areaSqPixels = AreaHelpers.calculatePolygonArea(this.activePathForModal);
        const areaSqFeet = areaSqPixels / (this.PIXELS_PER_FOOT * this.PIXELS_PER_FOOT);

        const newPolygon = {
            id: Date.now(),
            path: this.activePathForModal,
            label: nameInput.value,
            type: typeSelect.value,
            glaType: parseInt(selectedOption.getAttribute('data-gla'), 10),
            area: areaSqFeet,
            centroid: AreaHelpers.calculateCentroid(this.activePathForModal)
        };

        AppState.drawnPolygons.push(newPolygon);
        
        // *** NEW: Create draggable area label element ***
        this.createAreaLabelElement(newPolygon);
        
        this.hideAreaModal();
        this.updateLegendCalculations();
        CanvasManager.saveAction();
        CanvasManager.redraw();
        AppState.emit('app:exitDrawingMode');
    }

    // *** NEW: Create a draggable element for the area label ***
    createAreaLabelElement(polygon) {
        const areaLabelElement = {
            id: `area_label_${polygon.id}`,
            type: 'area_label',
            content: polygon.label,
            areaData: {
                areaText: polygon.label,
                sqftText: `${polygon.area.toFixed(1)} sq ft`,
                polygonId: polygon.id
            },
            styling: {
                backgroundColor: 'transparent',
                color: '#000',
                textAlign: 'center'
            },
            x: polygon.centroid.x,
            y: polygon.centroid.y,
            width: Math.max(80, polygon.label.length * 8 + 16),
            height: 32, // Tall enough for both lines of text
            draggable: true,
            linkedPolygonId: polygon.id
        };

        // Add to placed elements so it can be dragged like other elements
        AppState.placedElements.push(areaLabelElement);
        
        console.log('Created draggable area label:', areaLabelElement);
    }

    updateLegendCalculations() {
        // This function can remain as it was
    }
    
    updateLegendDisplay(/*...*/) {
        // This function can remain as it was
    }

    drawCompletedAreas() {
        const { ctx } = AppState;
        if (!ctx || AppState.drawnPolygons.length === 0) return;

        // First, identify all shared edges so we don't draw labels on them
        const sharedEdges = this.findAllSharedEdges();

        AppState.drawnPolygons.forEach((poly) => {
            ctx.save();
            
            // Always use solid borders for areas
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]); // Ensure solid line
            
            // Fill colors based on area type
            if (poly.glaType === 1) ctx.fillStyle = 'rgba(144, 238, 144, 0.4)';
            else if (poly.glaType === 0) ctx.fillStyle = 'rgba(180, 180, 180, 0.6)';
            else ctx.fillStyle = 'rgba(220, 220, 220, 0.3)';
            
            ctx.beginPath();
            ctx.moveTo(poly.path[0].x, poly.path[0].y);
            for (let i = 1; i < poly.path.length; i++) {
                ctx.lineTo(poly.path[i].x, poly.path[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // *** RESTORED: Draw edge length labels, skip shared edges, minimum 3 feet ***
            for (let i = 0; i < poly.path.length; i++) {
                const p1 = poly.path[i];
                const p2 = poly.path[(i + 1) % poly.path.length];
                
                // Calculate edge key for shared edge detection
                const edgeKey = this.getEdgeKey(poly.id, i, (i + 1) % poly.path.length);
                const isSharedEdge = sharedEdges && sharedEdges.has(edgeKey);
                
                if (!isSharedEdge) {
                    this.drawExternalLabel(ctx, p1, p2, poly.centroid);
                }
            }

            // *** REMOVED: Built-in area labels and edit hints - now using draggable elements ***
            // The area labels are now created as separate draggable elements
            // so users can position them anywhere they want
            
            ctx.restore();
        });
    }

    // *** HELPER FUNCTIONS FOR EDGE LABELS ***

    findAllSharedEdges() {
        const sharedEdges = new Set();
        
        if (!AppState.drawnPolygons || AppState.drawnPolygons.length < 2) {
            return sharedEdges;
        }
        
        // Compare all polygon pairs to find shared edges
        for (let i = 0; i < AppState.drawnPolygons.length; i++) {
            for (let j = i + 1; j < AppState.drawnPolygons.length; j++) {
                const poly1 = AppState.drawnPolygons[i];
                const poly2 = AppState.drawnPolygons[j];
                
                // Check each edge of poly1 against each edge of poly2
                for (let e1 = 0; e1 < poly1.path.length; e1++) {
                    const p1_start = poly1.path[e1];
                    const p1_end = poly1.path[(e1 + 1) % poly1.path.length];
                    
                    for (let e2 = 0; e2 < poly2.path.length; e2++) {
                        const p2_start = poly2.path[e2];
                        const p2_end = poly2.path[(e2 + 1) % poly2.path.length];
                        
                        // Check if edges are the same (in either direction)
                        const isShared = (
                            (this.pointsEqual(p1_start, p2_start) && this.pointsEqual(p1_end, p2_end)) ||
                            (this.pointsEqual(p1_start, p2_end) && this.pointsEqual(p1_end, p2_start))
                        );
                        
                        if (isShared) {
                            const key1 = this.getEdgeKey(poly1.id, e1, (e1 + 1) % poly1.path.length);
                            const key2 = this.getEdgeKey(poly2.id, e2, (e2 + 1) % poly2.path.length);
                            sharedEdges.add(key1);
                            sharedEdges.add(key2);
                        }
                    }
                }
            }
        }
        
        return sharedEdges;
    }

    getEdgeKey(polyId, startIndex, endIndex) {
        return `${polyId}_${startIndex}_${endIndex}`;
    }

    pointsEqual(p1, p2, tolerance = 2) {
        return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
    }

    drawExternalLabel(ctx, p1, p2, centroid) {
        const PIXELS_PER_FOOT = 8;
        
        // Calculate edge length
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lengthInPixels = Math.sqrt(dx * dx + dy * dy);
        const lengthInFeet = lengthInPixels / PIXELS_PER_FOOT;
        
        // *** REQUIREMENT: Only show labels for edges 3+ feet long ***
        if (lengthInFeet < 3) return;
        
        // Calculate midpoint of edge
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        
        // Calculate perpendicular direction for label offset
        const edgeLength = Math.sqrt(dx * dx + dy * dy);
        if (edgeLength === 0) return;
        
        const perpX = -dy / edgeLength; // Perpendicular X
        const perpY = dx / edgeLength;  // Perpendicular Y
        
        // Determine which side of the edge to place the label
        // Place label on the side opposite to the centroid
        const toCentroidX = centroid.x - midX;
        const toCentroidY = centroid.y - midY;
        
        // Dot product to determine which side
        const dotProduct = toCentroidX * perpX + toCentroidY * perpY;
        const offset = 18; // Distance from edge
        
        // Place label on opposite side from centroid
        const labelX = midX + (dotProduct > 0 ? -perpX : perpX) * offset;
        const labelY = midY + (dotProduct > 0 ? -perpY : perpY) * offset;
        
        // *** PLAIN STYLING: No border, simple white background ***
        const text = `${lengthInFeet.toFixed(1)}'`;
        ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textMetrics = ctx.measureText(text);
        const padding = 3;
        
        // Simple white background - no border
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        
        const backgroundRect = {
            x: labelX - textMetrics.width / 2 - padding,
            y: labelY - 6 - padding,
            width: textMetrics.width + padding * 2,
            height: 12 + padding * 2
        };
        
        ctx.fillRect(backgroundRect.x, backgroundRect.y, backgroundRect.width, backgroundRect.height);
        
        // Draw text
        ctx.fillStyle = '#2c3e50';
        ctx.fillText(text, labelX, labelY);
    }
}