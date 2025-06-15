// src/modules/PathDrawing/HelperPointSystem.js - Purple helper vertices
export class HelperPointSystem {
    constructor(eventBus, renderer) {
        console.log('HelperPointSystem: Initializing');
        
        // Dependencies injected, not imported
        this.eventBus = eventBus;
        this.renderer = renderer;
        
        // State
        this.temporaryHelpers = []; // Purple helpers from current drawing
        this.permanentHelpers = []; // Blue helpers from completed paths
        this.currentPath = [];
        
        console.log('HelperPointSystem: Initialized');
    }

    // Update helper points based on current drawing path
    updateHelperPoints(currentPath) {
        this.currentPath = [...currentPath];
        this.temporaryHelpers = [];
        
        if (!currentPath || currentPath.length < 1) {
            this.eventBus?.emit?.('helpers:updated', { 
                temporary: [],
                permanent: this.permanentHelpers 
            });
            return;
        }

        const lastPoint = currentPath[currentPath.length - 1];
        const uniqueHelpers = new Map();

        // Generate helpers from current drawing path
        this.generatePathHelpers(currentPath, lastPoint, uniqueHelpers);
        
        // Generate helpers from relevant completed polygons
        this.generateRelevantPolygonHelpers(lastPoint, uniqueHelpers);
        
        // Generate helpers from permanent snap points
        this.generatePermanentHelpers(lastPoint, uniqueHelpers);

        // Convert to array
        this.temporaryHelpers = Array.from(uniqueHelpers.values());
        
        console.log('HelperPointSystem: Generated', this.temporaryHelpers.length, 'helper points');
        
        // Notify systems of update
        this.eventBus?.emit?.('helpers:updated', { 
            temporary: this.temporaryHelpers,
            permanent: this.permanentHelpers 
        });
    }

    // Generate helpers from the current drawing path
    generatePathHelpers(currentPath, lastPoint, uniqueHelpers) {
        // Horizontal and vertical projections from existing vertices
        for (const point of currentPath.slice(0, -1)) { // Exclude last point
            const horizontalKey = `${point.x},${lastPoint.y}`;
            const verticalKey = `${lastPoint.x},${point.y}`;
            
            uniqueHelpers.set(horizontalKey, { 
                x: point.x, 
                y: lastPoint.y,
                type: 'projection',
                source: 'current_path'
            });
            
            uniqueHelpers.set(verticalKey, { 
                x: lastPoint.x, 
                y: point.y,
                type: 'projection',
                source: 'current_path'
            });
        }
        
        // Special case for p0-p1 relationship
        if (currentPath.length >= 2) {
            const p0 = currentPath[0];
            const p1 = currentPath[1];
            const specialKey = `${p0.x},${p1.y}`;
            
            uniqueHelpers.set(specialKey, {
                x: p0.x,
                y: p1.y,
                type: 'special_projection',
                source: 'p0_p1'
            });
        }
    }

    // Generate helpers from relevant completed polygons
    generateRelevantPolygonHelpers(lastPoint, uniqueHelpers) {
        const relevantPolygons = this.getRelevantPolygons(lastPoint);
        
        relevantPolygons.forEach(polygon => {
            if (polygon.path) {
                polygon.path.forEach(vertex => {
                    const horizontalKey = `${vertex.x},${lastPoint.y}`;
                    const verticalKey = `${lastPoint.x},${vertex.y}`;
                    
                    uniqueHelpers.set(horizontalKey, {
                        x: vertex.x,
                        y: lastPoint.y,
                        type: 'polygon_projection',
                        source: 'completed_polygon',
                        polygonId: polygon.id
                    });
                    
                    uniqueHelpers.set(verticalKey, {
                        x: lastPoint.x,
                        y: vertex.y,
                        type: 'polygon_projection',
                        source: 'completed_polygon',
                        polygonId: polygon.id
                    });
                });
            }
        });
    }

    // Generate helpers from permanent snap points
    generatePermanentHelpers(lastPoint, uniqueHelpers) {
        if (!this.permanentHelpers || this.permanentHelpers.length === 0) return;
        
        this.permanentHelpers.forEach(permanentPoint => {
            const horizontalKey = `${permanentPoint.x},${lastPoint.y}`;
            const verticalKey = `${lastPoint.x},${permanentPoint.y}`;
            
            uniqueHelpers.set(horizontalKey, {
                x: permanentPoint.x,
                y: lastPoint.y,
                type: 'permanent_projection',
                source: 'permanent_point',
                fromPermanent: true
            });
            
            uniqueHelpers.set(verticalKey, {
                x: lastPoint.x,
                y: permanentPoint.y,
                type: 'permanent_projection',
                source: 'permanent_point',
                fromPermanent: true
            });
        });
    }

    // Get polygons relevant to current drawing (nearby or attached)
    getRelevantPolygons(lastPoint) {
        // This would need to be provided by the external system
        // For now, return empty array
        return [];
    }

    // Find nearest helper point within radius
    findNearestHelper(x, y, radius = 20) {
        let closestHelper = null;
        let closestDistance = Infinity;
        
        // Check temporary helpers first (higher priority)
        for (const helper of this.temporaryHelpers) {
            const dx = x - helper.x;
            const dy = y - helper.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= radius && distance < closestDistance) {
                closestHelper = helper;
                closestDistance = distance;
            }
        }
        
        // Check permanent helpers if no temporary helper found
        if (!closestHelper) {
            for (const helper of this.permanentHelpers) {
                const dx = x - helper.x;
                const dy = y - helper.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= radius && distance < closestDistance) {
                    closestHelper = helper;
                    closestDistance = distance;
                }
            }
        }
        
        if (closestHelper) {
            console.log('HelperPointSystem: Found helper at distance', closestDistance.toFixed(1));
        }
        
        return closestHelper;
    }

    // Add permanent helper points from completed paths
    addPermanentHelpers(pathVertices, sourceId = null) {
        console.log('HelperPointSystem: Adding', pathVertices.length, 'permanent helpers');
        
        pathVertices.forEach((vertex, index) => {
            const helperPoint = {
                x: vertex.x,
                y: vertex.y,
                source: 'completed_path',
                sourceId: sourceId || Date.now(),
                originalName: vertex.name,
                index: index
            };
            
            // Check for duplicates
            const existingPoint = this.permanentHelpers.find(p => 
                Math.abs(p.x - helperPoint.x) < 2 && Math.abs(p.y - helperPoint.y) < 2
            );
            
            if (!existingPoint) {
                this.permanentHelpers.push(helperPoint);
                console.log('HelperPointSystem: Added permanent helper at', vertex.name);
            }
        });
        
        console.log('HelperPointSystem: Total permanent helpers:', this.permanentHelpers.length);
    }

    // Remove permanent helpers from a specific source
    removePermanentHelpers(sourceId) {
        const initialCount = this.permanentHelpers.length;
        this.permanentHelpers = this.permanentHelpers.filter(
            point => point.sourceId !== sourceId
        );
        const removedCount = initialCount - this.permanentHelpers.length;
        
        console.log('HelperPointSystem: Removed', removedCount, 'permanent helpers');
        
        // Update current helpers
        this.updateHelperPoints(this.currentPath);
    }

    // Clear all permanent helpers
    clearPermanentHelpers() {
        console.log('HelperPointSystem: Clearing all permanent helpers');
        this.permanentHelpers = [];
        this.updateHelperPoints(this.currentPath);
    }

    // Draw helper points on canvas
    drawHelpers(ctx, currentMode = 'drawing') {
        if (currentMode !== 'drawing') return;
        
        ctx.save();
        
        // Draw permanent helpers first (lower z-index)
        this.drawPermanentHelpers(ctx);
        
        // Draw temporary helpers on top (higher z-index)
        this.drawTemporaryHelpers(ctx);
        
        ctx.restore();
    }

    // Draw permanent helper points (blue)
    drawPermanentHelpers(ctx) {
        this.permanentHelpers.forEach(point => {
            ctx.save();
            
            // Shadow for depth
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            // Blue color for permanent helpers
            ctx.fillStyle = '#3498db';
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Small white center dot
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        });
    }

    // Draw temporary helper points (purple)
    drawTemporaryHelpers(ctx) {
        this.temporaryHelpers.forEach(point => {
            ctx.save();
            
            // Enhanced shadow for maximum visibility
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            
            // Vibrant purple for temporary helpers
            ctx.fillStyle = '#9b59b6';
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            
            // Larger radius for better visibility
            ctx.beginPath();
            ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Inner highlight for distinction
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        });
    }

    // Check if a point is near grid intersection
    isNearGridIntersection(x, y, gridSize = 40, tolerance = 10) {
        const nearestGridX = Math.round(x / gridSize) * gridSize;
        const nearestGridY = Math.round(y / gridSize) * gridSize;
        
        const dx = x - nearestGridX;
        const dy = y - nearestGridY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance <= tolerance ? { x: nearestGridX, y: nearestGridY } : null;
    }

    // Add grid-based helper if near intersection
    addGridHelper(x, y, uniqueHelpers, gridSize = 40) {
        const gridPoint = this.isNearGridIntersection(x, y, gridSize);
        if (gridPoint) {
            const gridKey = `${gridPoint.x},${gridPoint.y}`;
            uniqueHelpers.set(gridKey, {
                x: gridPoint.x,
                y: gridPoint.y,
                type: 'grid_intersection',
                source: 'grid'
            });
        }
    }

    // Get statistics about helper points
    getStats() {
        return {
            temporary: this.temporaryHelpers.length,
            permanent: this.permanentHelpers.length,
            total: this.temporaryHelpers.length + this.permanentHelpers.length,
            currentPathLength: this.currentPath.length
        };
    }

    // Public API
    getTemporaryHelpers() {
        return [...this.temporaryHelpers];
    }

    getPermanentHelpers() {
        return [...this.permanentHelpers];
    }

    getAllHelpers() {
        return {
            temporary: [...this.temporaryHelpers],
            permanent: [...this.permanentHelpers]
        };
    }

    // Set external polygon data provider
    setPolygonProvider(provider) {
        this.polygonProvider = provider;
    }

    // Set relevant polygons from external source
    setRelevantPolygons(polygons) {
        this.relevantPolygons = polygons || [];
        // Regenerate helpers with new polygon data
        this.updateHelperPoints(this.currentPath);
    }
}