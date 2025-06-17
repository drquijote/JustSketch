import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { AreaHelpers } from './helpers.js';

export class AreaManager {
    // REPLACE the constructor
    constructor() {
        this.activePathForModal = null;
        this.PIXELS_PER_FOOT = 8;
        
        // Properties for area dragging
        this.dragStartPoint = { x: 0, y: 0 };
        this.draggedGroup = null;
        this.isDraggingArea = false;
        this.isEditModeActive = false;
        
        // Properties for polygon property editing
        this.pencilClickAreas = new Map();
        this.editingPolygon = null;

        // --- NEW PROPERTIES FOR LINE EDITING ---
        this.activeLineEdit = null; // Stores info on the line selected for movement
        this.lineIconClickAreas = new Map(); // Stores locations of edit/delete icons on lines
        this.boundHandleLineMove = this.handleLineMove.bind(this); // Pre-bind the listener function
    }

    // Replace the entire init function in areaManager.js with this:

    // in areaManager.js

    // Add these two new functions inside the AreaManager class
 
 

 
    init() {
        console.log('AreaManager: Initialized and listening for events.');
        AppState.on('app:cycleClosed', (e) => this.handleCycleClosed(e));
        AppState.on('canvas:redraw:polygons', () => this.drawCompletedAreas());
        AppState.on('app:requestLegendUpdate', () => this.updateLegendCalculations());

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
 
    // *** NEW: Find clicked edge ***
    findClickedEdge(pos) {
        const clickRadius = 15; // Distance from edge to register a click
        
        for (const polygon of AppState.drawnPolygons) {
            for (let i = 0; i < polygon.path.length; i++) {
                const p1 = polygon.path[i];
                const p2 = polygon.path[(i + 1) % polygon.path.length];
                
                const distanceToEdge = this.distanceFromPointToLineSegment(pos, p1, p2);
                
                if (distanceToEdge <= clickRadius) {
                    console.log(`Edge found: polygon ${polygon.id}, edge ${i}-${(i + 1) % polygon.path.length}`);
                    return {
                        polygon: polygon,
                        edgeStartIndex: i,
                        edgeEndIndex: (i + 1) % polygon.path.length,
                        startPoint: p1,
                        endPoint: p2
                    };
                }
            }
        }
        
        return null;
    }

    // *** NEW: Calculate distance from point to line segment ***
    distanceFromPointToLineSegment(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) return Math.sqrt(A * A + B * B);
        
        let param = dot / lenSq;
        
        let xx, yy;
        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }
        
        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // *** NEW: Delete edge and start drawing from the gap ***
    deleteEdgeAndStartDrawing(edgeInfo) {
        console.log('🔥 EDGE DELETE: Starting edge deletion process');
        
        const polygon = edgeInfo.polygon;
        const startIdx = edgeInfo.edgeStartIndex;
        const endIdx = edgeInfo.edgeEndIndex;
        
        console.log(`Deleting edge from vertex ${startIdx} to vertex ${endIdx} of polygon "${polygon.label}"`);
        
        // Create the new path by removing the edge (keeping vertices but removing the connection)
        // We'll create a path that goes from endVertex around to startVertex (excluding the deleted edge)
        const newPath = [];
        
        // Start from the end vertex of the deleted edge and go around to the start vertex
        let currentIdx = endIdx;
        while (currentIdx !== startIdx) {
            const vertex = polygon.path[currentIdx];
            newPath.push({
                x: vertex.x,
                y: vertex.y,
                name: `p${newPath.length}`
            });
            currentIdx = (currentIdx + 1) % polygon.path.length;
        }
        
        // Add the start vertex of the deleted edge
        const startVertex = polygon.path[startIdx];
        newPath.push({
            x: startVertex.x,
            y: startVertex.y,
            name: `p${newPath.length}`
        });
        
        console.log(`Created new path with ${newPath.length} vertices`);
        
        // Remove any associated area label elements
        const associatedElements = AppState.placedElements.filter(el => 
            el.type === 'area_label' && el.linkedPolygonId === polygon.id
        );
        
        associatedElements.forEach(element => {
            const index = AppState.placedElements.indexOf(element);
            if (index > -1) {
                AppState.placedElements.splice(index, 1);
                console.log('Removed associated area label element');
            }
        });
        
        // Remove the polygon from drawnPolygons
        const polygonIndex = AppState.drawnPolygons.indexOf(polygon);
        if (polygonIndex > -1) {
            AppState.drawnPolygons.splice(polygonIndex, 1);
            console.log('Removed polygon from drawnPolygons');
        }
        
        // Set up the drawing state with the new path
        AppState.currentPolygonPoints = newPath;
        AppState.currentPolygonCounter = newPath.length;
        
        // Add vertices as permanent helpers for snapping
        this.addVerticesAsPermanentHelpers(newPath);
        
        // Update legend calculations
        this.updateLegendCalculations();
        
        // Save the action
        CanvasManager.saveAction();
        
        // Switch to drawing mode
        console.log('🎨 EDGE DELETE: Switching to drawing mode');
        AppState.emit('app:switchToDrawingMode');
        
        // Redraw everything
        CanvasManager.redraw();
        
        console.log('🔥 EDGE DELETE: Edge deletion complete - now in drawing mode');
    }

    // *** NEW: Add vertices as permanent helpers (copied from DrawingManager for convenience) ***
    addVerticesAsPermanentHelpers(completedPath) {
        console.log('🔗 HELPER DEBUG: Adding', completedPath.length, 'vertices as permanent helper points');
        
        // Initialize permanent helper points array if it doesn't exist
        if (!AppState.permanentHelperPoints) {
            AppState.permanentHelperPoints = [];
        }
        
        // Add each vertex from the path as a permanent helper point
        completedPath.forEach((vertex, index) => {
            const helperPoint = {
                x: vertex.x,
                y: vertex.y,
                source: 'edge_deletion', // Mark the source
                originalName: vertex.name, // Keep reference to original vertex name
                pathId: Date.now() // Unique ID for this path
            };
            
            // Check if this point already exists (avoid duplicates)
            const existingPoint = AppState.permanentHelperPoints.find(p => 
                Math.abs(p.x - helperPoint.x) < 2 && Math.abs(p.y - helperPoint.y) < 2
            );
            
            if (!existingPoint) {
                AppState.permanentHelperPoints.push(helperPoint);
                console.log('🔗 HELPER DEBUG: Added permanent helper at', vertex.name, `(${vertex.x.toFixed(1)}, ${vertex.y.toFixed(1)})`);
            } else {
                console.log('🔗 HELPER DEBUG: Skipped duplicate helper at', vertex.name);
            }
        });
        
        console.log('🔗 HELPER DEBUG: Total permanent helper points:', AppState.permanentHelperPoints.length);
    }

 


 
    handleCanvasTouchStart(e) {
        // Check if we're in edit mode
        if (AppState.currentMode !== 'edit') return false;

        const touch = e.touches ? e.touches[0] : e;
        if (!touch) return;

        const pos = CanvasManager.screenToCanvas(touch.clientX, touch.clientY);
        
        // Priority 1: Check for a click on a line's edit/delete icon (ONLY in lines submode)
        if (AppState.editSubMode === 'lines') {
            const iconClick = this.findClickedLineIcon(pos);
            if (iconClick) {
                if (iconClick.action === 'delete') {
                    this.deleteEdgeAndStartDrawing(iconClick.edgeInfo);
                } else if (iconClick.action === 'edit') {
                    this.toggleActiveLineEdit(iconClick.edgeInfo);
                }
                try { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } catch (err) {}
                return true;
            }
        }

        // Priority 2: Check for actions specific to areas submode
        if (AppState.editSubMode === 'areas') {
            // Check for a click on an Area Edit icon (for properties)
            const pencilHandled = this.handlePencilClick(pos.x, pos.y);
            if (pencilHandled) {
                try { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } catch (err) {}
                return true;
            }
            
            // Check if clicking on an area to start dragging (normal drag, no long press)
            let areaAtPoint = null;
            for (const poly of AppState.drawnPolygons) {
                if (AreaHelpers.isPointInPolygon(pos, poly.path)) {
                    areaAtPoint = poly;
                    break;
                }
            }

            if (areaAtPoint) {
                this.prepareDragGroup(areaAtPoint, pos);
                this.isDraggingArea = true;
                try { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } catch (err) {}
                return true;
            }
        }

        return false;
    }


    // In areaManager.js, replace the existing handleCanvasTouchMove function
    handleCanvasTouchMove(e) {
        const touch = e.touches ? e.touches[0] : e;
        if (!touch) return;
        const pos = CanvasManager.screenToCanvas(touch.clientX, touch.clientY);

        // Only handle dragging if we're in edit areas mode and actively dragging an area
        if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas' && this.isDraggingArea && this.draggedGroup) {
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


    // REPLACE this function in areaManager.js
    handleEditModeToggle(event) {
        const wasEditingLines = this.isEditModeActive && AppState.editSubMode === 'lines';
        
        this.isEditModeActive = event.detail.isEditMode;
        console.log('AreaManager: Edit mode is now', this.isEditModeActive ? 'ACTIVE' : 'INACTIVE', 'Submode:', event.detail.subMode);
        
        // Setup directional pad listener only in lines mode
        if (event.detail.isEditMode && event.detail.subMode === 'lines') {
            this.setupDirectionalPadListener();
        } else if (wasEditingLines) {
            this.removeDirectionalPadListener();
            this.activeLineEdit = null; // Clear active line when leaving lines mode
        }

        if (!event.detail.isEditMode && this.isDraggingArea) {
            this.endAreaDrag();
        }
    }

    // REPLACE this function in areaManager.js
    toggleActiveLineEdit(edgeInfo) {
        // If the clicked line is already active, deactivate it
        if (this.activeLineEdit && this.activeLineEdit.polygon.id === edgeInfo.polygon.id && this.activeLineEdit.edgeStartIndex === edgeInfo.edgeStartIndex) {
            this.activeLineEdit = null;
            console.log('Deactivated line editing.');
        } else {
            // Otherwise, make this line the active one
            this.activeLineEdit = edgeInfo;
            console.log('Activated line for editing:', edgeInfo);
            // Ensure directional pad is set up when a line is selected
            this.setupDirectionalPadListener();
        }
        CanvasManager.redraw();
    }

    // REPLACE this function in areaManager.js
    handleLineMove(e) {
        if (!this.activeLineEdit) {
            console.log('No active line to move');
            return; // Only act if a line is selected
        }

        e.preventDefault();
        e.stopPropagation();

        const button = e.currentTarget; // Use currentTarget instead of target
        const moveAmount = 0.5 * this.PIXELS_PER_FOOT; // Move by 1/2 foot
        let dx = 0, dy = 0;

        // Check for direction classes
        if (button.classList.contains('right')) { 
            dx = moveAmount; 
        } else if (button.classList.contains('left')) { 
            dx = -moveAmount; 
        } else if (button.classList.contains('up')) { 
            dy = -moveAmount; 
        } else if (button.classList.contains('down')) { 
            dy = moveAmount; 
        } else if (button.classList.contains('up-right')) { 
            dx = moveAmount; 
            dy = -moveAmount; 
        } else if (button.classList.contains('up-left')) { 
            dx = -moveAmount; 
            dy = -moveAmount; 
        } else if (button.classList.contains('down-right')) { 
            dx = moveAmount; 
            dy = moveAmount; 
        } else if (button.classList.contains('down-left')) { 
            dx = -moveAmount; 
            dy = moveAmount; 
        } else { 
            console.log('Not a direction button');
            return; // Not a direction button
        }

        // Get the vertices of the active line
        const poly = this.activeLineEdit.polygon;
        const v1_index = this.activeLineEdit.edgeStartIndex;
        const v2_index = this.activeLineEdit.edgeEndIndex;
        const vertex1 = poly.path[v1_index];
        const vertex2 = poly.path[v2_index];
        
        console.log(`Moving line ${vertex1.name}-${vertex2.name} by (${dx}, ${dy})`);

        // Find and move all vertices that share the same coordinates
        // This ensures connected polygons are updated together
        AppState.drawnPolygons.forEach(p => {
            p.path.forEach(v => {
                if ((Math.abs(v.x - vertex1.x) < 0.1 && Math.abs(v.y - vertex1.y) < 0.1) || 
                    (Math.abs(v.x - vertex2.x) < 0.1 && Math.abs(v.y - vertex2.y) < 0.1)) {
                    v.x += dx;
                    v.y += dy;
                }
            });
            // Recalculate metrics for every affected polygon
            this.recalculatePolygonMetrics(p);
        });

        this.updateLegendCalculations();
        CanvasManager.saveAction();
        CanvasManager.redraw();
    }

    // REPLACE this function in areaManager.js
    setupDirectionalPadListener() {
        console.log('AreaManager: Setting up directional pad listeners.');
        const directionButtons = document.querySelectorAll('.dir-btn');
        
        // Remove existing listeners first to avoid duplicates
        directionButtons.forEach(button => {
            button.removeEventListener('click', this.boundHandleLineMove);
        });
        
        // Add fresh listeners
        directionButtons.forEach(button => {
            button.addEventListener('click', this.boundHandleLineMove);
        });
    }
 

    /**
     * Removes listeners from the directional pad.
     */
    removeDirectionalPadListener() {
        console.log('AreaManager: Removing directional pad listeners.');
        const directionButtons = document.querySelectorAll('.dir-btn');
        directionButtons.forEach(button => {
            button.removeEventListener('click', this.boundHandleLineMove);
        });
    }

 

    /**
     * Recalculates the area and centroid of a given polygon.
     * @param {object} polygon - The polygon to update.
     */
    recalculatePolygonMetrics(polygon) {
        const areaSqPixels = AreaHelpers.calculatePolygonArea(polygon.path);
        polygon.area = areaSqPixels / (this.PIXELS_PER_FOOT * this.PIXELS_PER_FOOT);
        polygon.centroid = AreaHelpers.calculateCentroid(polygon.path);
    }


 

    /**
     * Finds which line icon (edit/delete) was clicked.
     * @param {object} pos - The {x, y} click position.
     * @returns {object|null} Info about the icon and its action, or null.
     */
    findClickedLineIcon(pos) {
        if (!this.lineIconClickAreas) return null;

        for (const clickArea of this.lineIconClickAreas.values()) {
            if (pos.x >= clickArea.x && pos.x <= clickArea.x + clickArea.width &&
                pos.y >= clickArea.y && pos.y <= clickArea.y + clickArea.height) {
                return clickArea;
            }
        }
        return null;
    }



    // In areaManager.js, replace the existing handleCanvasTouchEnd function
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

    // --- Pencil Editing Logic ---

 

    // *** NEW: Handle pencil clicks ***
    handlePencilClick(clickX, clickY) {
        if (!this.isEditModeActive || AppState.editSubMode !== 'areas' || !this.pencilClickAreas) return false;
        
        // Check if click is within any pencil area
        for (const [polygonId, clickArea] of this.pencilClickAreas) {
            if (clickX >= clickArea.x && 
                clickX <= clickArea.x + clickArea.width &&
                clickY >= clickArea.y && 
                clickY <= clickArea.y + clickArea.height) {
                
                console.log('✏️ PENCIL: Clicked on pencil for polygon:', clickArea.polygon.label);
                this.editPolygonProperties(clickArea.polygon);
                return true; // Click was handled
            }
        }
        return false; // Click was not on a pencil
    }

 
    /**
     * [NEW] UNIFIED DELETE FUNCTION
     * This single function correctly handles deleting both new (unsaved) and existing polygons.
     * It determines what to delete based on the current state of the application.
     */
    handleDeleteArea() {
        console.log('🗑️ Handling delete request...');
        
        const modal = document.getElementById('polygonModal');
        modal.classList.add('hidden');

        if (this.editingPolygon) {
            // --- CASE 1: Deleting an EXISTING, saved polygon ---
            console.log('🗑️ Deleting existing polygon:', this.editingPolygon.label);

            // Find and remove the polygon from the main array of drawn polygons
            const polyIndex = AppState.drawnPolygons.findIndex(p => p.id === this.editingPolygon.id);
            if (polyIndex > -1) {
                AppState.drawnPolygons.splice(polyIndex, 1);
                console.log('🗑️ Removed polygon from drawnPolygons.');
            } else {
                console.warn('🗑️ Could not find polygon in drawnPolygons to delete.');
            }

            // Find and remove the associated area label from the placed elements
            const labelIndex = AppState.placedElements.findIndex(el => el.type === 'area_label' && el.linkedPolygonId === this.editingPolygon.id);
            if (labelIndex > -1) {
                AppState.placedElements.splice(labelIndex, 1);
                console.log('🗑️ Removed associated area label element.');
            }

        } else if (this.activePathForModal) {
            // --- CASE 2: Deleting a NEWLY DRAWN, unsaved polygon ---
            console.log('🗑️ Canceling the creation of a new polygon.');

            // For a new polygon, we just need to clear the current drawing path.
            AppState.currentPolygonPoints = [];
            AppState.currentPolygonCounter = 0;
            
            // This ensures the drawing manager is reset properly.
            if (window.drawingManager) {
                window.drawingManager.waitingForFirstVertex = true;
            }
            AppState.emit('app:exitDrawingMode');
            
        } else {
            console.warn('🗑️ Delete called, but no active polygon or new path was found.');
            return; // Nothing to do.
        }

        // --- COMMON CLEANUP ---
        // Reset state variables
        this.activePathForModal = null;
        this.editingPolygon = null;
        
        // Update the legend, save the state for undo/redo, and redraw the canvas
        this.updateLegendCalculations();
        CanvasManager.saveAction();
        CanvasManager.redraw();
        
        console.log('✅ Deletion process complete.');
    }

 

    /**
     * [NEW] UNIFIED DELETE FUNCTION
     * This single function correctly handles deleting both new (unsaved) and existing polygons.
     * It determines what to delete based on the current state of the application.
     */
    handleDeleteArea() {
        console.log('🗑️ Handling delete request...');
        
        const modal = document.getElementById('polygonModal');
        modal.classList.add('hidden');

        if (this.editingPolygon) {
            // --- CASE 1: Deleting an EXISTING, saved polygon ---
            console.log('🗑️ Deleting existing polygon:', this.editingPolygon.label);

            // [MODIFIED] Find and remove all elements (icons, room labels) inside the polygon
            const polygonPath = this.editingPolygon.path;
            const elementsToRemoveIndices = [];
            AppState.placedElements.forEach((element, index) => {
                // Don't check the area label of the polygon itself, as we handle that separately.
                if (element.type === 'area_label' && element.linkedPolygonId === this.editingPolygon.id) {
                    return;
                }
                
                // Get the center of the element to check for containment.
                const elementCenter = {
                    x: element.x + (element.width / 2),
                    y: element.y + (element.height / 2)
                };
                
                // Use AreaHelpers to check if the element's center is inside the polygon's path.
                if (AreaHelpers.isPointInPolygon(elementCenter, polygonPath)) {
                    console.log(`🗑️ Found interior element to delete: "${element.content || element.alt}"`);
                    elementsToRemoveIndices.push(index);
                }
            });

            // Remove the identified elements in reverse order to avoid index shifting issues.
            for (let i = elementsToRemoveIndices.length - 1; i >= 0; i--) {
                AppState.placedElements.splice(elementsToRemoveIndices[i], 1);
            }
            console.log(`🗑️ Deleted ${elementsToRemoveIndices.length} interior elements.`);
            // [END MODIFICATION]

            // Find and remove the polygon from the main array of drawn polygons
            const polyIndex = AppState.drawnPolygons.findIndex(p => p.id === this.editingPolygon.id);
            if (polyIndex > -1) {
                AppState.drawnPolygons.splice(polyIndex, 1);
                console.log('🗑️ Removed polygon from drawnPolygons.');
            } else {
                console.warn('🗑️ Could not find polygon in drawnPolygons to delete.');
            }

            // Find and remove the associated area label from the placed elements
            const labelIndex = AppState.placedElements.findIndex(el => el.type === 'area_label' && el.linkedPolygonId === this.editingPolygon.id);
            if (labelIndex > -1) {
                AppState.placedElements.splice(labelIndex, 1);
                console.log('🗑️ Removed associated area label element.');
            }

        } else if (this.activePathForModal) {
            // --- CASE 2: Deleting a NEWLY DRAWN, unsaved polygon ---
            console.log('🗑️ Canceling the creation of a new polygon.');

            // For a new polygon, we just need to clear the current drawing path.
            AppState.currentPolygonPoints = [];
            AppState.currentPolygonCounter = 0;
            
            // This ensures the drawing manager is reset properly.
            if (window.drawingManager) {
                window.drawingManager.waitingForFirstVertex = true;
            }
            AppState.emit('app:exitDrawingMode');
            
        } else {
            console.warn('🗑️ Delete called, but no active polygon or new path was found.');
            return; // Nothing to do.
        }

        // --- COMMON CLEANUP ---
        // Reset state variables
        this.activePathForModal = null;
        this.editingPolygon = null;
        
        // Update the legend, save the state for undo/redo, and redraw the canvas
        this.updateLegendCalculations();
        CanvasManager.saveAction();
        CanvasManager.redraw();
        
        console.log('✅ Deletion process complete.');
    }

    /**
     * [REPLACE] UPDATED function to show the modal for a NEW polygon.
     * It now directly sets the correct delete handler.
     */
    showAreaModal() {
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');
        const deleteBtn = document.getElementById('deleteCycle'); // Get the delete button

        // Generate a default name for the new area
        const defaultType = typeSelect.options[0]?.value || 'living';
        nameInput.value = AreaManager.generateAreaLabel(defaultType);
        typeSelect.value = defaultType;
        
        // Update the name when the type changes
        typeSelect.onchange = () => {
            nameInput.value = AreaManager.generateAreaLabel(typeSelect.value);
        };
        
        // Set button handlers for creating a new area
        saveBtn.onclick = () => this.saveNewArea();
        cancelBtn.onclick = () => this.hideAreaModal();
        if (deleteBtn) {
            // Set the handler to our new unified delete function
            deleteBtn.onclick = () => this.handleDeleteArea();
        }
        
        modal.classList.remove('hidden');
        nameInput.focus();
        setTimeout(() => nameInput.select(), 100);
    }

    /**
     * [REPLACE] UPDATED function to edit an EXISTING polygon's properties.
     * It now correctly sets the delete handler when the modal is shown.
     */
    editPolygonProperties(polygon) {
        console.log('✏️ PENCIL: Opening edit dialog for polygon:', polygon.label);
        
        // Set the polygon being edited so our functions know the context
        this.activePathForModal = polygon.path;
        this.editingPolygon = polygon; // This is key for the delete function
        
        // Get modal elements
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const includeInGLACheckbox = document.getElementById('includeInGLA');
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');
        const deleteBtn = document.getElementById('deleteCycle'); // Get the delete button

        // Pre-populate the modal with the polygon's current values
        nameInput.value = polygon.label;
        typeSelect.value = polygon.type || 'living';
        if (includeInGLACheckbox) {
            includeInGLACheckbox.checked = polygon.glaType === 1;
        }
        
        // Update button handlers for editing mode
        saveBtn.onclick = () => this.saveEditedArea();
        cancelBtn.onclick = () => this.cancelAreaEdit();
        if (deleteBtn) {
            // Set the handler to our new unified delete function
            deleteBtn.onclick = () => this.handleDeleteArea();
        }
        
        // Show the modal
        modal.classList.remove('hidden');
        nameInput.focus();
        setTimeout(() => nameInput.select(), 100);
        
        console.log('✏️ PENCIL: Edit dialog opened for:', polygon.label);
    }
    // *** NEW: Save edited area properties ***
    saveEditedArea() {
        if (!this.editingPolygon) return;
        
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const includeInGLACheckbox = document.getElementById('includeInGLA');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        
        // Get the new values
        const newLabel = nameInput.value.trim();
        const newType = typeSelect.value;
        const newGlaType = parseInt(selectedOption.getAttribute('data-gla'), 10);
        
        // Update the polygon
        const oldLabel = this.editingPolygon.label;
        this.editingPolygon.label = newLabel;
        this.editingPolygon.type = newType;
        this.editingPolygon.glaType = newGlaType;
        
        console.log('✏️ PENCIL: Updated polygon:', oldLabel, '→', newLabel, 'GLA type:', newGlaType);
        
        // Update any associated area label elements
        const associatedElements = AppState.placedElements.filter(el => 
            el.type === 'area_label' && el.linkedPolygonId === this.editingPolygon.id
        );
        
        associatedElements.forEach(element => {
            element.areaData.areaText = newLabel;
            element.content = newLabel;
            console.log('✏️ PENCIL: Updated area label element');
        });
        
        // Hide modal and clean up
        this.hideAreaModal();
        this.editingPolygon = null;
        
        // Update legend and redraw
        this.updateLegendCalculations();
        CanvasManager.saveAction();
        CanvasManager.redraw();
        
        console.log('✏️ PENCIL: Area edit completed successfully');
    }

    // *** NEW: Cancel area editing ***
    cancelAreaEdit() {
        console.log('✏️ PENCIL: Area edit cancelled');
        this.hideAreaModal();
        this.editingPolygon = null;
    }

    // --- Standard Area Logic ---

    handleCycleClosed(event) {
        const path = event.detail.path;
        if (!path || path.length < 3) return;
        this.activePathForModal = path;
        this.showAreaModal();
    }

    static generateAreaLabel(areaType) {
        const typeSelect = document.getElementById('polygonType');
        if (!typeSelect) return `Area ${AppState.drawnPolygons.length + 1}`;

        const targetOption = typeSelect.querySelector(`option[value="${areaType}"]`);
        if (!targetOption) return `Area ${AppState.drawnPolygons.length + 1}`;

        // Get the clean base name, e.g., "Garage (non-GLA)" becomes "Garage"
        const baseName = targetOption.textContent.trim().replace(/\s*\([^)]*\)/g, '').trim();

        // Count how many polygons of this type already exist
        const existingCount = AppState.drawnPolygons.filter(p => p.type === areaType).length;

        // Per your instruction, ALWAYS append the number
        return `${baseName} ${existingCount + 1}`;
    }


 

 

    // *** NEW: Delete function (same as before) ***
    deleteCurrentCycle() {
        if (!this.activePathForModal) {
            console.warn('No active path to delete');
            this.hideAreaModal();
            return;
        }

        console.log('🗑️ DELETE: Deleting current cycle and contained elements');
        
        // Find all elements inside the polygon area
        const elementsToDelete = [];
        
        AppState.placedElements.forEach((element, index) => {
            // Calculate element center point
            const elementCenter = {
                x: element.x + (element.width / 2),
                y: element.y + (element.height / 2)
            };
            
            // Check if element center is inside the polygon
            if (AreaHelpers.isPointInPolygon(elementCenter, this.activePathForModal)) {
                console.log(`🗑️ DELETE: Found element "${element.content}" inside polygon`);
                elementsToDelete.push(index);
            }
        });
        
        // Remove elements in reverse order to maintain correct indices
        elementsToDelete.reverse().forEach(index => {
            const deletedElement = AppState.placedElements.splice(index, 1)[0];
            console.log(`🗑️ DELETE: Removed element "${deletedElement.content}"`);
        });
        
        // *** CRITICAL: Clear the current drawing path properly ***
        AppState.currentPolygonPoints = [];
        AppState.currentPolygonCounter = 0;
        
        // *** CRITICAL: Clear the active path for modal to prevent confusion ***
        this.activePathForModal = null;
        
        // *** CRITICAL: Reset helper points properly ***
        HelperPointManager.updateHelperPoints();
        
        console.log(`🗑️ DELETE: Deleted cycle and ${elementsToDelete.length} contained elements`);
        
        // Hide modal
        this.hideAreaModal();
        
        // *** CRITICAL: Save action BEFORE redrawing ***
        CanvasManager.saveAction();
        
        // Redraw canvas
        CanvasManager.redraw();
        
        // *** CRITICAL: Exit drawing mode properly ***
        AppState.emit('app:exitDrawingMode');
    }

    // *** ENSURE: hideAreaModal is exactly as it was ***
    hideAreaModal() {
        document.getElementById('polygonModal').classList.add('hidden');
        this.activePathForModal = null;
    }

    // *** ENSURE: saveNewArea is exactly as it was ***
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

    // *** NEW: Add this function to areaManager.js ***
    deleteCurrentCycle() {
        if (!this.activePathForModal) {
            console.warn('No active path to delete');
            this.hideAreaModal();
            return;
        }

        console.log('🗑️ DELETE: Deleting current cycle and contained elements');
        
        // Find all elements inside the polygon area
        const elementsToDelete = [];
        
        AppState.placedElements.forEach((element, index) => {
            // Calculate element center point
            const elementCenter = {
                x: element.x + (element.width / 2),
                y: element.y + (element.height / 2)
            };
            
            // Check if element center is inside the polygon
            if (AreaHelpers.isPointInPolygon(elementCenter, this.activePathForModal)) {
                console.log(`🗑️ DELETE: Found element "${element.content}" inside polygon`);
                elementsToDelete.push(index);
            }
        });
        
        // Remove elements in reverse order to maintain correct indices
        elementsToDelete.reverse().forEach(index => {
            const deletedElement = AppState.placedElements.splice(index, 1)[0];
            console.log(`🗑️ DELETE: Removed element "${deletedElement.content}"`);
        });
        
        // Clear the current drawing path
        AppState.currentPolygonPoints = [];
        AppState.currentPolygonCounter = 0;
        
        // Reset drawing manager state
        if (window.drawingManager) {
            window.drawingManager.waitingForFirstVertex = true;
        }
        
        // Update helper points
        HelperPointManager.updateHelperPoints();
        
        console.log(`🗑️ DELETE: Deleted cycle and ${elementsToDelete.length} contained elements`);
        
        // Hide modal
        this.hideAreaModal();
        
        // Save action for undo capability
        CanvasManager.saveAction();
        
        // Redraw canvas
        CanvasManager.redraw();
        
        // Exit drawing mode
        AppState.emit('app:exitDrawingMode');
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

    // Enhanced updateLegendCalculations function
    updateLegendCalculations() {
        console.log('AreaManager: Updating legend calculations');
        
        let totalGLA = 0;
        let totalNonLiving = 0;
        let bedrooms = 0;
        let bathrooms = 0;
        
        const glaBreakdown = {};
        const nonGlaBreakdown = {};
        
        // Calculate area totals and breakdowns
        AppState.drawnPolygons.forEach(polygon => {
            if (polygon.glaType === 1) {
                // Include in GLA
                totalGLA += polygon.area;
                // Combine areas for polygons with the same name
                if (glaBreakdown[polygon.label]) {
                    glaBreakdown[polygon.label] += polygon.area;
                } else {
                    glaBreakdown[polygon.label] = polygon.area;
                }
            } else if (polygon.glaType === 0) {
                // Non-GLA areas (but counted)
                totalNonLiving += polygon.area;
                // Combine areas for polygons with the same name
                if (nonGlaBreakdown[polygon.label]) {
                    nonGlaBreakdown[polygon.label] += polygon.area;
                } else {
                    nonGlaBreakdown[polygon.label] = polygon.area;
                }
            }
            // glaType === 2 areas are excluded from both calculations
        });
        
        // Count bedrooms and bathrooms from placed room elements
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
        
        // Update legend display
        this.updateLegendDisplay(totalGLA, totalNonLiving, bedrooms, bathrooms, glaBreakdown, nonGlaBreakdown);
    }

    // *** NEW: Enhanced updateLegendDisplay function ***
    updateLegendDisplay(totalGLA, totalNonLiving, bedrooms, bathrooms, glaBreakdown, nonGlaBreakdown) {
        // Update main totals
        const legendGLA = document.getElementById('legendGLA');
        const legendNonLiving = document.getElementById('legendNonLiving');
        const legendBedrooms = document.getElementById('legendBedrooms');
        const legendBathrooms = document.getElementById('legendBathrooms');
        
        if (legendGLA) legendGLA.textContent = totalGLA.toFixed(1);
        if (legendNonLiving) legendNonLiving.textContent = totalNonLiving.toFixed(1);
        if (legendBedrooms) legendBedrooms.textContent = bedrooms;
        if (legendBathrooms) legendBathrooms.textContent = bathrooms;
        
        // Update GLA breakdown
        const legendGLABreakdown = document.getElementById('legendGLABreakdown');
        if (legendGLABreakdown) {
            legendGLABreakdown.innerHTML = '';
            
            // Sort entries by area (largest first) for better readability
            const sortedGLAEntries = Object.entries(glaBreakdown).sort((a, b) => b[1] - a[1]);
            
            sortedGLAEntries.forEach(([label, area]) => {
                const div = document.createElement('div');
                div.textContent = `${label}: ${area.toFixed(1)} sq ft`;
                div.style.fontSize = '11px';
                div.style.color = '#666';
                div.style.marginLeft = '10px';
                div.style.paddingTop = '1px';
                legendGLABreakdown.appendChild(div);
            });
        }
        
        // Update Non-GLA breakdown
        const legendNonGLABreakdown = document.getElementById('legendNonGLABreakdown');
        if (legendNonGLABreakdown) {
            legendNonGLABreakdown.innerHTML = '';
            
            // Sort entries by area (largest first) for better readability
            const sortedNonGLAEntries = Object.entries(nonGlaBreakdown).sort((a, b) => b[1] - a[1]);
            
            sortedNonGLAEntries.forEach(([label, area]) => {
                const div = document.createElement('div');
                div.textContent = `${label}: ${area.toFixed(1)} sq ft`;
                div.style.fontSize = '11px';
                div.style.color = '#666';
                div.style.marginLeft = '10px';
                div.style.paddingTop = '1px';
                legendNonGLABreakdown.appendChild(div);
            });
        }
        
        console.log('Legend updated - Total GLA:', totalGLA.toFixed(1), 'sq ft, Non-GLA:', totalNonLiving.toFixed(1), 'sq ft');
        console.log('Bedrooms:', bedrooms, 'Bathrooms:', bathrooms);
    }

 

    // In areaManager.js, replace the entire handleCanvasTouchStart function with this one.
    drawAreaEditIcon(ctx, polygon) {
        const iconSize = 24;
        
        // Position the icon at the polygon's centroid (dead center)
        const iconCenterX = polygon.centroid.x;
        const iconCenterY = polygon.centroid.y;
        
        const iconX = iconCenterX - iconSize / 2;
        const iconY = iconCenterY - iconSize / 2;

        this.pencilClickAreas.set(polygon.id, {
            x: iconX, y: iconY,
            width: iconSize, height: iconSize,
            polygon: polygon
        });
        
        const editIcon = AppState.imageCache['public/edit.svg'];
        if (editIcon) {
            ctx.drawImage(editIcon, iconX, iconY, iconSize, iconSize);
        } else {
            // Fallback drawing
            ctx.save();
            ctx.fillStyle = 'rgba(52, 152, 219, 0.8)';
            ctx.beginPath();
            ctx.arc(iconCenterX, iconCenterY, iconSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

 drawCompletedAreas() {
    const { ctx } = AppState;
    if (!ctx || AppState.drawnPolygons.length === 0) return;

    const sharedEdges = this.findAllSharedEdges();
    this.lineIconClickAreas.clear(); // Clear old icon positions

    AppState.drawnPolygons.forEach((poly) => {
        ctx.save();
        
        // Unchanged polygon fill and stroke logic...
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        
        let fillOpacity = 0.4;
        let fillColor;
        
        // Check if we're in photo mode - make fills very subdued
        if (AppState.currentMode === 'photos') {
            // Very light gray with high transparency for all areas in photo mode
            fillColor = 'rgba(200, 200, 200, 0.15)'; // Light gray, 15% opacity
        } else {
            // Normal mode colors
            if (AppState.currentMode === 'edit' && AppState.editSubMode === 'labels') {
                fillOpacity = 0.1;
            }
            
            if (poly.glaType === 1) { 
                fillColor = `rgba(144, 238, 144, ${fillOpacity})`; // Green
            } else if (poly.type === 'ADU') { 
                fillColor = `rgba(173, 255, 173, ${fillOpacity + 0.1})`; // Light green
            } else if (poly.glaType === 0) { 
                fillColor = `rgba(180, 180, 180, ${fillOpacity + 0.2})`; // Gray
            } else { 
                fillColor = `rgba(220, 220, 220, ${fillOpacity - 0.1})`; // Light gray
            }
        }
        
        ctx.fillStyle = fillColor;
        
        ctx.beginPath();
        ctx.moveTo(poly.path[0].x, poly.path[0].y);
        for (let i = 1; i < poly.path.length; i++) { 
            ctx.lineTo(poly.path[i].x, poly.path[i].y); 
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Show area edit icon ONLY in edit areas mode
        if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
            this.drawAreaEditIcon(ctx, poly);
        }

        // Show line icons ONLY in edit lines mode
        if (AppState.currentMode === 'edit' && AppState.editSubMode === 'lines') {
            const editIcon = AppState.imageCache['public/edit.svg'];
            const deleteIcon = AppState.imageCache['public/delete.svg'];
            const iconSize = 20;

            for (let i = 0; i < poly.path.length; i++) {
                const p1 = poly.path[i];
                const p2 = poly.path[(i + 1) % poly.path.length];
                
                // --- Highlight the active line ---
                if (this.activeLineEdit && this.activeLineEdit.polygon.id === poly.id && this.activeLineEdit.edgeStartIndex === i) {
                    ctx.save();
                    ctx.strokeStyle = 'rgba(52, 152, 219, 0.9)'; // Bright blue for active
                    ctx.lineWidth = 6;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                    ctx.restore();
                }

                // Calculate 1/3 and 2/3 points on the line
                const editPointX = p1.x + (p2.x - p1.x) / 3;
                const editPointY = p1.y + (p2.y - p1.y) / 3;
                const deletePointX = p1.x + (p2.x - p1.x) * 2 / 3;
                const deletePointY = p1.y + (p2.y - p1.y) * 2 / 3;

                // Draw Edit Icon at 1/3 point
                if (editIcon) {
                    ctx.drawImage(editIcon, editPointX - iconSize/2, editPointY - iconSize/2, iconSize, iconSize);
                }
                
                // Draw Delete Icon at 2/3 point
                if (deleteIcon) {
                    ctx.drawImage(deleteIcon, deletePointX - iconSize/2, deletePointY - iconSize/2, iconSize, iconSize);
                }
                
                // Store click areas for both icons
                const editKey = `edit-${poly.id}-${i}`;
                const deleteKey = `delete-${poly.id}-${i}`;
                const edgeInfo = { polygon: poly, edgeStartIndex: i, edgeEndIndex: (i + 1) % poly.path.length };
                
                this.lineIconClickAreas.set(editKey, {
                    x: editPointX - iconSize / 2, y: editPointY - iconSize / 2,
                    width: iconSize, height: iconSize, action: 'edit', edgeInfo: edgeInfo
                });
                this.lineIconClickAreas.set(deleteKey, {
                    x: deletePointX - iconSize / 2, y: deletePointY - iconSize / 2,
                    width: iconSize, height: iconSize, action: 'delete', edgeInfo: edgeInfo
                });
            }
        }
        
        // Draw external wall length labels (unchanged)
        for (let i = 0; i < poly.path.length; i++) {
            const p1 = poly.path[i];
            const p2 = poly.path[(i + 1) % poly.path.length];
            const edgeKey = this.getEdgeKey(poly.id, i, (i + 1) % poly.path.length);
            if (!sharedEdges.has(edgeKey)) {
                this.drawExternalLabel(ctx, p1, p2, poly.centroid);
            }
        }

        // Note: Area labels are now separate draggable elements, not drawn here

        ctx.restore();
    });

    this.updateLegendCalculations();
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