// src/helpers.js - UPDATED with smarter, context-aware helper points.

import { AppState } from './state.js';

export class HelperPointManager {

    /**
     * [NEW] Finds polygons that are relevant to the current drawing path.
     * A polygon is relevant if it's attached to the path or is within a certain
     * distance of the last point being drawn.
     * @returns {Array<Object>} An array of the relevant polygon objects.
     */
    static getRelevantPolygons() {
        const relevantPolygonIds = new Set();
        const currentPoints = AppState.currentPolygonPoints;

        // If there's no active drawing, there are no relevant polygons.
        if (!currentPoints || currentPoints.length === 0) {
            return [];
        }

        const lastPoint = currentPoints[currentPoints.length - 1];
        // Define a "nearby" radius in pixels.
        const proximityThreshold = 400;

        // Method 1: Find polygons that are physically ATTACHED to the current drawing.
        // We check if any point in our current drawing was snapped to an existing polygon.
        currentPoints.forEach(point => {
            if (point.snapInfo && point.snapInfo.polygon) {
                relevantPolygonIds.add(point.snapInfo.polygon.id);
            }
        });

        // Method 2: Find polygons that are NEARBY.
        if (AppState.drawnPolygons) {
            AppState.drawnPolygons.forEach(polygon => {
                // Check if any vertex of the polygon is close to where we are drawing.
                const isNearby = polygon.path.some(vertex => {
                    const dx = vertex.x - lastPoint.x;
                    const dy = vertex.y - lastPoint.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    return distance < proximityThreshold;
                });

                if (isNearby) {
                    relevantPolygonIds.add(polygon.id);
                }
            });
        }
        
        // Return the full polygon objects for the relevant IDs.
        if (AppState.drawnPolygons) {
            return AppState.drawnPolygons.filter(p => relevantPolygonIds.has(p.id));
        }
        
        return [];
    }

    /**
     * [REPLACED] This is the core updated function.
     * It now uses getRelevantPolygons() to generate a much smaller, more useful
     * set of helper points, preventing screen clutter.
     */
    static updateHelperPoints() {
        const points = AppState.currentPolygonPoints;
        AppState.helperPoints = [];

        if (!points || points.length < 1) {
            return; // No drawing in progress, so no temporary helpers needed.
        }

        const uniqueHelpers = new Map();
        const lastPoint = points[points.length - 1];

        // --- STEP 1: Generate helpers from the current drawing path ---
        // This is essential for aligning the current shape.
        for (const p of points.slice(0, -1)) { // Exclude the last point itself
            uniqueHelpers.set(`${p.x},${lastPoint.y}`, { x: p.x, y: lastPoint.y });
            uniqueHelpers.set(`${lastPoint.x},${p.y}`, { x: lastPoint.x, y: p.y });
        }
        
        // This special case for the p0-p1 segment is also important.
        if (points.length >= 2) {
            const p0 = points[0];
            const p1 = points[1];
            uniqueHelpers.set(`${p0.x},${p1.y}`, { x: p0.x, y: p1.y });
        }

        // --- STEP 2: Get only RELEVANT polygons (nearby or attached) ---
        const relevantPolygons = this.getRelevantPolygons();
        console.log(`HELPER DEBUG: Found ${relevantPolygons.length} relevant polygons for helper points.`);

        // --- STEP 3: Generate helpers ONLY from the relevant polygons ---
        relevantPolygons.forEach(polygon => {
            polygon.path.forEach(vertex => {
                // Projection of lastPoint.y onto the completed vertex's x-axis
                uniqueHelpers.set(`${vertex.x},${lastPoint.y}`, { x: vertex.x, y: lastPoint.y });
                // Projection of lastPoint.x onto the completed vertex's y-axis
                uniqueHelpers.set(`${lastPoint.x},${vertex.y}`, { x: lastPoint.x, y: vertex.y });
            });
        });

        // --- STEP 4: Generate helpers from permanent snap points ---
        // These are always important and should be included.
        if (AppState.permanentHelperPoints && AppState.permanentHelperPoints.length > 0) {
            AppState.permanentHelperPoints.forEach(permanentPoint => {
                // Project last point onto permanent point axes
                uniqueHelpers.set(`${permanentPoint.x},${lastPoint.y}`, { x: permanentPoint.x, y: lastPoint.y, fromPermanent: true });
                uniqueHelpers.set(`${lastPoint.x},${permanentPoint.y}`, { x: lastPoint.x, y: permanentPoint.y, fromPermanent: true });
            });
        }

        // --- STEP 5: Finalize the list ---
        AppState.helperPoints = Array.from(uniqueHelpers.values());
        console.log(`HELPER DEBUG: Generated ${AppState.helperPoints.length} smart helper points.`);
    }

    // --- The rest of the functions in this class are unchanged ---

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

// The AreaHelpers class is unchanged.
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
