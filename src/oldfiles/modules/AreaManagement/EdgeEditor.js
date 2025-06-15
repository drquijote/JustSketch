// src/modules/AreaManagement/EdgeEditor.js
// Edge deletion system - completely independent module

import { AppState } from '../../core/AppState.js';
import { eventBus } from '../../core/EventBus.js';
import { GeometryUtils } from '../../core/GeometryUtils.js';

export class EdgeEditor {
    constructor(deviceDetection) {
        this.deviceDetection = deviceDetection;
        this.isActive = false;
        this.hoveredEdge = null;
        this.clickRadius = this.deviceDetection.isMobile ? 25 : 15;
        this.previewEdges = new Map(); // For visual feedback
        
        console.log('EdgeEditor: Initialized with modular architecture');
    }

    init() {
        // Listen for mode changes
        eventBus.on('mode:changed', (e) => this.handleModeChange(e.detail));
        
        // Listen for edit mode toggles
        eventBus.on('edit:modeToggled', (e) => this.handleEditModeToggle(e.detail));
        
        // Listen for render requests
        eventBus.on('render:edgeHighlights', () => this.renderEdgeHighlights());
        
        console.log('EdgeEditor: Event listeners initialized');
    }

    /**
     * Handle mode changes
     */
    handleModeChange(data) {
        const { mode, subMode } = data;
        
        if (mode === 'edit' && subMode === 'areas') {
            this.activate();
        } else {
            this.deactivate();
        }
    }

    /**
     * Handle edit mode toggle
     */
    handleEditModeToggle(data) {
        const { isEditMode, subMode } = data;
        
        if (isEditMode && subMode === 'areas') {
            this.activate();
        } else {
            this.deactivate();
        }
    }

    /**
     * Activate edge editing
     */
    activate() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.setupEventListeners();
        
        console.log('EdgeEditor: Activated - edges can now be deleted');
        eventBus.emit('ui:showMessage', { message: 'Click on edges to delete them' });
    }

    /**
     * Deactivate edge editing
     */
    deactivate() {
        if (!this.isActive) return;
        
        this.isActive = false;
        this.hoveredEdge = null;
        this.previewEdges.clear();
        this.removeEventListeners();
        
        console.log('EdgeEditor: Deactivated');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const viewport = document.getElementById('canvasViewport');
        if (!viewport) return;

        // Unified event handlers
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);

        // Mouse events
        viewport.addEventListener('mousedown', this.boundPointerDown);
        viewport.addEventListener('mousemove', this.boundPointerMove);

        // Touch events  
        viewport.addEventListener('touchstart', this.boundPointerDown, { passive: false });
        viewport.addEventListener('touchmove', this.boundPointerMove, { passive: false });
    }

    /**
     * Remove event listeners
     */
    removeEventListeners() {
        const viewport = document.getElementById('canvasViewport');
        if (!viewport || !this.boundPointerDown) return;

        viewport.removeEventListener('mousedown', this.boundPointerDown);
        viewport.removeEventListener('mousemove', this.boundPointerMove);
        viewport.removeEventListener('touchstart', this.boundPointerDown);
        viewport.removeEventListener('touchmove', this.boundPointerMove);
    }

    /**
     * Handle pointer down (edge click)
     */
    handlePointerDown(e) {
        if (!this.isActive) return;

        // Prevent multiple touches
        if (e.touches && e.touches.length > 1) return;

        const pos = this.getEventPosition(e);
        const edgeInfo = this.findEdgeAtPosition(pos.x, pos.y);

        if (edgeInfo) {
            this.deleteEdge(edgeInfo);
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /**
     * Handle pointer move (edge hover)
     */
    handlePointerMove(e) {
        if (!this.isActive) return;

        const pos = this.getEventPosition(e);
        const edgeInfo = this.findEdgeAtPosition(pos.x, pos.y);

        if (edgeInfo !== this.hoveredEdge) {
            this.hoveredEdge = edgeInfo;
            eventBus.emit('render:requestRedraw');
        }
    }

    /**
     * Get position from mouse or touch event
     */
    getEventPosition(e) {
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        let clientX, clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) - AppState.viewportTransform.x,
            y: (clientY - rect.top) - AppState.viewportTransform.y
        };
    }

    /**
     * Find edge at position
     */
    findEdgeAtPosition(x, y) {
        let closestEdge = null;
        let closestDistance = this.clickRadius;

        for (const area of AppState.drawnPolygons) {
            for (let i = 0; i < area.path.length; i++) {
                const startVertex = area.path[i];
                const endVertex = area.path[(i + 1) % area.path.length];
                
                const distance = this.distanceFromPointToLineSegment(
                    { x, y }, 
                    startVertex, 
                    endVertex
                );

                if (distance <= this.clickRadius && distance < closestDistance) {
                    closestEdge = {
                        area: area,
                        startVertex: startVertex,
                        endVertex: endVertex,
                        startIndex: i,
                        endIndex: (i + 1) % area.path.length,
                        distance: distance
                    };
                    closestDistance = distance;
                }
            }
        }

        return closestEdge;
    }

    /**
     * Calculate distance from point to line segment
     */
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

    /**
     * Delete an edge
     */
    deleteEdge(edgeInfo) {
        const { area, startIndex, endIndex } = edgeInfo;
        
        console.log(`EdgeEditor: Deleting edge from vertex ${startIndex} to vertex ${endIndex} of area "${area.label}"`);

        // Confirm deletion for important areas
        if (area.glaType === 1 && area.area > 100) {
            const confirmDelete = confirm(`Delete edge from "${area.label}"? This will convert it back to a drawing path.`);
            if (!confirmDelete) return;
        }

        // Create new path by removing the edge
        const newPath = this.createPathWithoutEdge(area, startIndex, endIndex);

        // Remove area label elements
        this.removeAreaLabelElements(area.id);

        // Remove the area from state
        const areaIndex = AppState.drawnPolygons.indexOf(area);
        if (areaIndex > -1) {
            AppState.drawnPolygons.splice(areaIndex, 1);
        }

        // Set up drawing mode with the new path
        this.setupDrawingModeWithPath(newPath);

        // Add vertices as permanent helpers for snapping
        this.addVerticesAsPermanentHelpers(newPath);

        // Notify systems
        eventBus.emit('area:edgeDeleted', { 
            originalArea: area, 
            newPath: newPath 
        });
        eventBus.emit('drawing:modeRequested', { path: newPath });
        eventBus.emit('legend:updateRequested');
        eventBus.emit('history:saveAction');

        console.log('EdgeEditor: Edge deletion completed, switched to drawing mode');
    }

    /**
     * Create path without the specified edge
     */
    createPathWithoutEdge(area, startIndex, endIndex) {
        const newPath = [];
        
        // Add vertices from endVertex around to startVertex (excluding the deleted edge)
        let currentIndex = endIndex;
        while (currentIndex !== startIndex) {
            const vertex = area.path[currentIndex];
            newPath.push({
                x: vertex.x,
                y: vertex.y,
                name: `p${newPath.length}`
            });
            currentIndex = (currentIndex + 1) % area.path.length;
        }
        
        // Add the start vertex
        const startVertex = area.path[startIndex];
        newPath.push({
            x: startVertex.x,
            y: startVertex.y,
            name: `p${newPath.length}`
        });

        console.log(`EdgeEditor: Created new path with ${newPath.length} vertices`);
        return newPath;
    }

    /**
     * Remove area label elements
     */
    removeAreaLabelElements(areaId) {
        const elementsToRemove = [];
        
        AppState.placedElements.forEach((element, index) => {
            if (element.type === 'area_label' && element.linkedPolygonId === areaId) {
                elementsToRemove.push(index);
            }
        });

        // Remove in reverse order to maintain indices
        elementsToRemove.reverse().forEach(index => {
            AppState.placedElements.splice(index, 1);
        });

        console.log(`EdgeEditor: Removed ${elementsToRemove.length} area label elements`);
    }

    /**
     * Setup drawing mode with path
     */
    setupDrawingModeWithPath(path) {
        // Set drawing state
        AppState.currentPolygonPoints = path;
        AppState.currentPolygonCounter = path.length;

        // Switch to drawing mode
        eventBus.emit('mode:setDrawing');
        
        console.log('EdgeEditor: Set up drawing mode with path');
    }

    /**
     * Add vertices as permanent helpers for snapping
     */
    addVerticesAsPermanentHelpers(path) {
        if (!AppState.permanentHelperPoints) {
            AppState.permanentHelperPoints = [];
        }

        path.forEach((vertex, index) => {
            const helperPoint = {
                x: vertex.x,
                y: vertex.y,
                source: 'edge_deletion',
                originalName: vertex.name,
                pathId: Date.now()
            };

            // Check for duplicates
            const existingPoint = AppState.permanentHelperPoints.find(p => 
                Math.abs(p.x - helperPoint.x) < 2 && Math.abs(p.y - helperPoint.y) < 2
            );

            if (!existingPoint) {
                AppState.permanentHelperPoints.push(helperPoint);
                console.log(`EdgeEditor: Added permanent helper at ${vertex.name}`);
            }
        });

        console.log(`EdgeEditor: Total permanent helpers: ${AppState.permanentHelperPoints.length}`);
    }

    /**
     * Render edge highlights
     */
    renderEdgeHighlights() {
        if (!this.isActive) return;
        
        const { ctx } = AppState;
        if (!ctx) return;

        ctx.save();

        // Render all deletable edges with red dashed lines
        AppState.drawnPolygons.forEach(area => {
            for (let i = 0; i < area.path.length; i++) {
                const startVertex = area.path[i];
                const endVertex = area.path[(i + 1) % area.path.length];

                ctx.strokeStyle = 'rgba(231, 76, 60, 0.7)';
                ctx.lineWidth = 4;
                ctx.setLineDash([8, 4]);
                ctx.beginPath();
                ctx.moveTo(startVertex.x, startVertex.y);
                ctx.lineTo(endVertex.x, endVertex.y);
                ctx.stroke();
            }
        });

        // Highlight hovered edge
        if (this.hoveredEdge) {
            ctx.strokeStyle = 'rgba(231, 76, 60, 1.0)';
            ctx.lineWidth = 6;
            ctx.setLineDash([12, 6]);
            ctx.beginPath();
            ctx.moveTo(this.hoveredEdge.startVertex.x, this.hoveredEdge.startVertex.y);
            ctx.lineTo(this.hoveredEdge.endVertex.x, this.hoveredEdge.endVertex.y);
            ctx.stroke();

            // Draw edge length
            this.drawEdgeLength(ctx, this.hoveredEdge);
        }

        ctx.restore();
    }

    /**
     * Draw edge length label
     */
    drawEdgeLength(ctx, edgeInfo) {
        const { startVertex, endVertex } = edgeInfo;
        const PIXELS_PER_FOOT = 8;

        const dx = endVertex.x - startVertex.x;
        const dy = endVertex.y - startVertex.y;
        const lengthInPixels = Math.sqrt(dx * dx + dy * dy);
        const lengthInFeet = lengthInPixels / PIXELS_PER_FOOT;

        if (lengthInFeet < 1) return; // Don't show very short edges

        const midX = (startVertex.x + endVertex.x) / 2;
        const midY = (startVertex.y + endVertex.y) / 2;

        // Calculate perpendicular offset
        const edgeLength = Math.sqrt(dx * dx + dy * dy);
        if (edgeLength === 0) return;

        const perpX = -dy / edgeLength;
        const perpY = dx / edgeLength;
        const offset = 25;

        const labelX = midX + perpX * offset;
        const labelY = midY + perpY * offset;

        // Draw label background
        const text = `${lengthInFeet.toFixed(1)}' (delete)`;
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textMetrics = ctx.measureText(text);
        const padding = 4;

        ctx.fillStyle = 'rgba(231, 76, 60, 0.9)';
        ctx.fillRect(
            labelX - textMetrics.width / 2 - padding,
            labelY - 6 - padding,
            textMetrics.width + padding * 2,
            12 + padding * 2
        );

        // Draw text
        ctx.fillStyle = 'white';
        ctx.fillText(text, labelX, labelY);
    }

    /**
     * Check if edge can be deleted
     */
    canDeleteEdge(edgeInfo) {
        if (!edgeInfo || !edgeInfo.area) return false;

        // Can't delete if area would have less than 3 vertices
        return edgeInfo.area.path.length > 3;
    }

    /**
     * Get all deletable edges
     */
    getDeletableEdges() {
        const deletableEdges = [];

        AppState.drawnPolygons.forEach(area => {
            if (area.path.length > 3) { // Only if area would still be valid after deletion
                for (let i = 0; i < area.path.length; i++) {
                    deletableEdges.push({
                        area: area,
                        startIndex: i,
                        endIndex: (i + 1) % area.path.length,
                        startVertex: area.path[i],
                        endVertex: area.path[(i + 1) % area.path.length]
                    });
                }
            }
        });

        return deletableEdges;
    }

    /**
     * Get edge length in feet
     */
    getEdgeLength(startVertex, endVertex) {
        const PIXELS_PER_FOOT = 8;
        const dx = endVertex.x - startVertex.x;
        const dy = endVertex.y - startVertex.y;
        const lengthInPixels = Math.sqrt(dx * dx + dy * dy);
        return lengthInPixels / PIXELS_PER_FOOT;
    }

    /**
     * Validate edge deletion
     */
    validateEdgeDeletion(edgeInfo) {
        if (!this.canDeleteEdge(edgeInfo)) {
            eventBus.emit('ui:showError', { 
                message: 'Cannot delete edge: area would become invalid' 
            });
            return false;
        }

        return true;
    }

    /**
     * Get edge statistics
     */
    getEdgeStatistics() {
        const stats = {
            totalEdges: 0,
            deletableEdges: 0,
            shortEdges: 0, // < 1 foot
            longEdges: 0   // > 20 feet
        };

        AppState.drawnPolygons.forEach(area => {
            for (let i = 0; i < area.path.length; i++) {
                const startVertex = area.path[i];
                const endVertex = area.path[(i + 1) % area.path.length];
                const length = this.getEdgeLength(startVertex, endVertex);

                stats.totalEdges++;
                
                if (area.path.length > 3) {
                    stats.deletableEdges++;
                }
                
                if (length < 1) {
                    stats.shortEdges++;
                } else if (length > 20) {
                    stats.longEdges++;
                }
            }
        });

        return stats;
    }

    /**
     * Set click radius for edge detection
     */
    setClickRadius(radius) {
        this.clickRadius = Math.max(5, Math.min(50, radius));
        console.log(`EdgeEditor: Click radius set to ${this.clickRadius}px`);
    }

    /**
     * Get current hover edge
     */
    getHoveredEdge() {
        return this.hoveredEdge;
    }

    /**
     * Clear hover state
     */
    clearHover() {
        if (this.hoveredEdge) {
            this.hoveredEdge = null;
            eventBus.emit('render:requestRedraw');
        }
    }
}
