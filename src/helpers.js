// src/helpers.js - CORRECTED VERSION

import { AppState } from './state.js';

export class HelperPointManager {
    static updateHelperPoints() {
        const points = AppState.currentPolygonPoints;
        // Ensure AppState.helperPoints is an array
        AppState.helperPoints = []; 

        if (!points || points.length < 1) {
            console.log('HELPER DEBUG: No current points, only permanent helpers available');
            return;
        }

        const uniqueHelpers = new Map();
        const lastPoint = points[points.length - 1];

        // RESTORED: This block generates the "normal" helper points from your current drawing.
        for (const p of points.slice(0, -1)) { // Exclude the last point itself
            // Projection of lastPoint.y onto p.x
            uniqueHelpers.set(`${p.x},${lastPoint.y}`, { x: p.x, y: lastPoint.y });
            // Projection of lastPoint.x onto p.y
            uniqueHelpers.set(`${lastPoint.x},${p.y}`, { x: lastPoint.x, y: p.y });
        }
        
        // ADDED: This block adds the NEW helper points from completed rooms.
        if (AppState.drawnPolygons && AppState.drawnPolygons.length > 0) {
            AppState.drawnPolygons.forEach(polygon => {
                polygon.path.forEach(vertex => {
                    // Projection of lastPoint.y onto the completed vertex's x-axis
                    uniqueHelpers.set(`${vertex.x},${lastPoint.y}`, { x: vertex.x, y: lastPoint.y });
                    // Projection of lastPoint.x onto the completed vertex's y-axis
                    uniqueHelpers.set(`${lastPoint.x},${vertex.y}`, { x: lastPoint.x, y: vertex.y });
                });
            });
        }
        
        // This block generates helper points from permanent points (part of the original logic).
        if (AppState.permanentHelperPoints && AppState.permanentHelperPoints.length > 0) {
            console.log('HELPER DEBUG: Adding projections from', AppState.permanentHelperPoints.length, 'permanent helpers');
            
            AppState.permanentHelperPoints.forEach(permanentPoint => {
                // Project last point onto permanent point axes
                uniqueHelpers.set(`${permanentPoint.x},${lastPoint.y}`, { 
                    x: permanentPoint.x, 
                    y: lastPoint.y,
                    fromPermanent: true 
                });
                uniqueHelpers.set(`${lastPoint.x},${permanentPoint.y}`, { 
                    x: lastPoint.x, 
                    y: permanentPoint.y,
                    fromPermanent: true 
                });
                
                // Also add projections from current points to permanent points
                points.slice(0, -1).forEach(currentPoint => {
                    uniqueHelpers.set(`${permanentPoint.x},${currentPoint.y}`, { 
                        x: permanentPoint.x, 
                        y: currentPoint.y,
                        fromPermanent: true 
                    });
                    uniqueHelpers.set(`${currentPoint.x},${permanentPoint.y}`, { 
                        x: currentPoint.x, 
                        y: permanentPoint.y,
                        fromPermanent: true 
                    });
                });
            });
        }
        
        // This special case for the p0-p1 segment is also part of the original logic.
        if (points.length >= 2) {
            const p0 = points[0];
            const p1 = points[1];
            uniqueHelpers.set(`${p0.x},${p1.y}`, { x: p0.x, y: p1.y });
        }

        AppState.helperPoints = Array.from(uniqueHelpers.values());
        console.log(`HELPER DEBUG: Generated ${AppState.helperPoints.length} temporary helper points (including projections from permanent)`);
    }

    static clearPermanentHelpers() {
        console.log('HELPER DEBUG: Clearing all permanent helper points');
        AppState.permanentHelperPoints = [];
    }

    static removePermanentHelpersFromPath(pathId) {
        if (!AppState.permanentHelperPoints) return;
        
        const initialCount = AppState.permanentHelperPoints.length;
        AppState.permanentHelperPoints = AppState.permanentHelperPoints.filter(
            point => point.pathId !== pathId
        );
        const removedCount = initialCount - AppState.permanentHelperPoints.length;
        
        console.log(`HELPER DEBUG: Removed ${removedCount} permanent helpers from path ${pathId}`);
    }

    static getHelperPointStats() {
        const tempCount = AppState.helperPoints ? AppState.helperPoints.length : 0;
        const permCount = AppState.permanentHelperPoints ? AppState.permanentHelperPoints.length : 0;
        
        return {
            temporary: tempCount,
            permanent: permCount,
            total: tempCount + permCount
        };
    }
}

export class AreaHelpers {
    static isPointInPolygon(point, polygonPath) {
        if (!polygonPath || polygonPath.length < 3) {
            return false;
        }
        let isInside = false;
        const x = point.x;
        const y = point.y;
        for (let i = 0, j = polygonPath.length - 1; i < polygonPath.length; j = i++) {
            const xi = polygonPath[i].x, yi = polygonPath[i].y;
            const xj = polygonPath[j].x, yj = polygonPath[j].y;

            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) {
                isInside = !isInside;
            }
        }
        return isInside;
    }

    static calculatePolygonArea(path) {
        if (!path || path.length < 3) return 0;
        let area = 0;
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            area += (p1.x * p2.y - p2.x * p1.y);
        }
        return Math.abs(area / 2);
    }

    static calculateCentroid(path) {
        if (!path || path.length === 0) return { x: 0, y: 0 };
        let sumX = 0;
        let sumY = 0;
        path.forEach(p => {
            sumX += p.x;
            sumY += p.y;
        });
        return { 
            x: sumX / path.length, 
            y: sumY / path.length 
        };
    }
}