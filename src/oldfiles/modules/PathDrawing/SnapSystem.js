// src/modules/PathDrawing/SnapSystem.js - Vertex/edge snapping
export class SnapSystem {
    constructor(eventBus, geometry) {
        console.log('SnapSystem: Initializing');
        
        // Dependencies injected, not imported
        this.eventBus = eventBus;
        this.geometry = geometry;
        
        // Configuration
        this.vertexSnapRadius = 25;
        this.edgeSnapRadius = 20;
        this.gridSize = 40;
        this.gridSnapRadius = 15;
        
        // State
        this.existingPolygons = [];
        this.permanentPoints = [];
        this.lastPreviewPoint = null;
        
        console.log('SnapSystem: Initialized');
    }

    // Find the best snap point for given coordinates
    findSnapPoint(x, y, customRadius = null) {
        const vertexRadius = customRadius || this.vertexSnapRadius;
        const edgeRadius = customRadius || this.edgeSnapRadius;
        
        // Priority 1: Vertex snapping (highest priority)
        const vertexSnap = this.findVertexSnap(x, y, vertexRadius);
        if (vertexSnap) {
            console.log('SnapSystem: Vertex snap found');
            return {
                x: vertexSnap.x,
                y: vertexSnap.y,
                type: 'vertex',
                target: vertexSnap,
                confidence: 1.0
            };
        }
        
        // Priority 2: Edge snapping
        const edgeSnap = this.findEdgeSnap(x, y, edgeRadius);
        if (edgeSnap) {
            console.log('SnapSystem: Edge snap found');
            return {
                x: edgeSnap.snapPoint.x,
                y: edgeSnap.snapPoint.y,
                type: 'edge',
                target: edgeSnap,
                confidence: 0.8
            };
        }
        
        // Priority 3: Grid snapping (lowest priority)
        const gridSnap = this.findGridSnap(x, y);
        if (gridSnap) {
            console.log('SnapSystem: Grid snap found');
            return {
                x: gridSnap.x,
                y: gridSnap.y,
                type: 'grid',
                target: gridSnap,
                confidence: 0.5
            };
        }
        
        return null;
    }

    // Find nearest vertex to snap to
    findVertexSnap(x, y, radius) {
        let closestVertex = null;
        let closestDistance = Infinity;
        
        // Check permanent points first
        for (const point of this.permanentPoints) {
            const distance = this.calculateDistance(x, y, point.x, point.y);
            if (distance <= radius && distance < closestDistance) {
                closestVertex = {
                    x: point.x,
                    y: point.y,
                    source: 'permanent',
                    originalPoint: point
                };
                closestDistance = distance;
            }
        }
        
        // Check existing polygon vertices
        for (const polygon of this.existingPolygons) {
            if (!polygon.path) continue;
            
            for (const vertex of polygon.path) {
                const distance = this.calculateDistance(x, y, vertex.x, vertex.y);
                if (distance <= radius && distance < closestDistance) {
                    closestVertex = {
                        x: vertex.x,
                        y: vertex.y,
                        source: 'polygon',
                        polygon: polygon,
                        vertex: vertex
                    };
                    closestDistance = distance;
                }
            }
        }
        
        return closestVertex;
    }

    // Find nearest edge to snap to
    findEdgeSnap(x, y, radius) {
        let closestEdge = null;
        let closestDistance = Infinity;
        let closestSnapPoint = null;
        
        // Check all polygon edges
        for (const polygon of this.existingPolygons) {
            if (!polygon.path || polygon.path.length < 2) continue;
            
            for (let i = 0; i < polygon.path.length; i++) {
                const p1 = polygon.path[i];
                const p2 = polygon.path[(i + 1) % polygon.path.length];
                
                const snapResult = this.snapToLineSegment(x, y, p1, p2);
                if (snapResult.distance <= radius && snapResult.distance < closestDistance) {
                    closestEdge = {
                        polygon: polygon,
                        startPoint: p1,
                        endPoint: p2,
                        edgeIndex: i
                    };
                    closestDistance = snapResult.distance;
                    closestSnapPoint = snapResult.snapPoint;
                }
            }
        }
        
        if (closestEdge && closestSnapPoint) {
            return {
                edge: closestEdge,
                snapPoint: closestSnapPoint,
                distance: closestDistance
            };
        }
        
        return null;
    }

    // Find grid intersection to snap to
    findGridSnap(x, y) {
        const nearestGridX = Math.round(x / this.gridSize) * this.gridSize;
        const nearestGridY = Math.round(y / this.gridSize) * this.gridSize;
        
        const distance = this.calculateDistance(x, y, nearestGridX, nearestGridY);
        
        if (distance <= this.gridSnapRadius) {
            return {
                x: nearestGridX,
                y: nearestGridY,
                distance: distance
            };
        }
        
        return null;
    }

    // Snap point to line segment
    snapToLineSegment(x, y, lineStart, lineEnd) {
        const A = x - lineStart.x;
        const B = y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) {
            // Line has zero length, snap to start point
            return {
                snapPoint: { x: lineStart.x, y: lineStart.y },
                distance: Math.sqrt(A * A + B * B)
            };
        }
        
        let param = dot / lenSq;
        
        // Clamp parameter to stay within line segment
        param = Math.max(0, Math.min(1, param));
        
        const snapPoint = {
            x: lineStart.x + param * C,
            y: lineStart.y + param * D
        };
        
        const distance = this.calculateDistance(x, y, snapPoint.x, snapPoint.y);
        
        return {
            snapPoint: snapPoint,
            distance: distance,
            parameter: param
        };
    }

    // Draw snap preview
    drawSnapPreview(ctx, mouseX, mouseY) {
        const snapResult = this.findSnapPoint(mouseX, mouseY);
        if (!snapResult) return;
        
        ctx.save();
        
        // Draw preview based on snap type
        switch (snapResult.type) {
            case 'vertex':
                this.drawVertexSnapPreview(ctx, snapResult);
                break;
            case 'edge':
                this.drawEdgeSnapPreview(ctx, snapResult);
                break;
            case 'grid':
                this.drawGridSnapPreview(ctx, snapResult);
                break;
        }
        
        ctx.restore();
        
        // Store for other systems to use
        this.lastPreviewPoint = snapResult;
    }

    // Draw vertex snap preview
    drawVertexSnapPreview(ctx, snapResult) {
        ctx.fillStyle = '#2ecc71'; // Bright green for vertex snap
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        
        // Large circle for vertex snap point
        ctx.beginPath();
        ctx.arc(snapResult.x, snapResult.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Small center dot
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(snapResult.x, snapResult.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw edge snap preview
    drawEdgeSnapPreview(ctx, snapResult) {
        const edge = snapResult.target.edge;
        
        // Highlight the edge
        ctx.strokeStyle = 'rgba(46, 204, 113, 0.8)'; // Green highlight
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(edge.startPoint.x, edge.startPoint.y);
        ctx.lineTo(edge.endPoint.x, edge.endPoint.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw snap point
        ctx.fillStyle = '#2ecc71';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.arc(snapResult.x, snapResult.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Small center dot
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(snapResult.x, snapResult.y, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw grid snap preview
    drawGridSnapPreview(ctx, snapResult) {
        ctx.fillStyle = 'rgba(52, 152, 219, 0.8)'; // Blue for grid snap
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        
        // Medium circle for grid snap
        ctx.beginPath();
        ctx.arc(snapResult.x, snapResult.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Draw cross to indicate grid
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(snapResult.x - 4, snapResult.y);
        ctx.lineTo(snapResult.x + 4, snapResult.y);
        ctx.moveTo(snapResult.x, snapResult.y - 4);
        ctx.lineTo(snapResult.x, snapResult.y + 4);
        ctx.stroke();
    }

    // Add snap point as permanent reference
    addPermanentSnapPoint(snapPoint) {
        if (!snapPoint) return;
        
        // Check for duplicates
        const existingPoint = this.permanentPoints.find(p => 
            Math.abs(p.x - snapPoint.x) < 2 && Math.abs(p.y - snapPoint.y) < 2
        );
        
        if (!existingPoint) {
            const permanentPoint = {
                x: snapPoint.x,
                y: snapPoint.y,
                source: 'snap_point',
                timestamp: Date.now()
            };
            
            this.permanentPoints.push(permanentPoint);
            console.log('SnapSystem: Added permanent snap point at', snapPoint.x.toFixed(1), snapPoint.y.toFixed(1));
        }
    }

    // Check if two points are considered the same
    pointsAreEqual(p1, p2, tolerance = 2) {
        return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
    }

    // Calculate distance between two points
    calculateDistance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Find intersection points between current path and existing geometry
    findIntersectionPoints(currentPath) {
        const intersections = [];
        
        if (!currentPath || currentPath.length < 2) return intersections;
        
        // Check intersections with existing polygon edges
        for (let i = 0; i < currentPath.length - 1; i++) {
            const p1 = currentPath[i];
            const p2 = currentPath[i + 1];
            
            for (const polygon of this.existingPolygons) {
                if (!polygon.path) continue;
                
                for (let j = 0; j < polygon.path.length; j++) {
                    const p3 = polygon.path[j];
                    const p4 = polygon.path[(j + 1) % polygon.path.length];
                    
                    const intersection = this.findLineIntersection(p1, p2, p3, p4);
                    if (intersection) {
                        intersections.push({
                            point: intersection,
                            pathSegment: { start: p1, end: p2, index: i },
                            polygonEdge: { start: p3, end: p4, polygon: polygon, index: j }
                        });
                    }
                }
            }
        }
        
        return intersections;
    }

    // Find intersection between two line segments
    findLineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;
        
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 0.0001) return null; // Parallel lines
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        // Check if intersection is within both line segments
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1),
                t: t,
                u: u
            };
        }
        
        return null;
    }

    // Validate that a snap point is appropriate
    validateSnapPoint(snapPoint, currentPath) {
        if (!snapPoint || !currentPath) return false;
        
        // Don't snap to a point that's already in the current path
        for (const point of currentPath) {
            if (this.pointsAreEqual(snapPoint, point, 5)) {
                return false;
            }
        }
        
        // Additional validation can be added here
        return true;
    }

    // Set existing polygons for snapping
    setExistingPolygons(polygons) {
        this.existingPolygons = polygons || [];
        console.log('SnapSystem: Updated with', this.existingPolygons.length, 'polygons');
    }

    // Set permanent points for snapping
    setPermanentPoints(points) {
        this.permanentPoints = points || [];
        console.log('SnapSystem: Updated with', this.permanentPoints.length, 'permanent points');
    }

    // Configure snap radii
    setSnapRadii(vertex = 25, edge = 20, grid = 15) {
        this.vertexSnapRadius = vertex;
        this.edgeSnapRadius = edge;
        this.gridSnapRadius = grid;
        console.log('SnapSystem: Updated snap radii');
    }

    // Configure grid settings
    setGridSettings(size = 40, snapRadius = 15) {
        this.gridSize = size;
        this.gridSnapRadius = snapRadius;
        console.log('SnapSystem: Updated grid settings');
    }

    // Get current snap configuration
    getConfiguration() {
        return {
            vertexSnapRadius: this.vertexSnapRadius,
            edgeSnapRadius: this.edgeSnapRadius,
            gridSnapRadius: this.gridSnapRadius,
            gridSize: this.gridSize
        };
    }

    // Get snapping statistics
    getStats() {
        return {
            existingPolygons: this.existingPolygons.length,
            permanentPoints: this.permanentPoints.length,
            lastPreviewType: this.lastPreviewPoint?.type || 'none'
        };
    }

    // Clear all snap data
    clear() {
        this.existingPolygons = [];
        this.permanentPoints = [];
        this.lastPreviewPoint = null;
        console.log('SnapSystem: Cleared all data');
    }

    // Get the last preview point for other systems to use
    getLastPreviewPoint() {
        return this.lastPreviewPoint;
    }
}