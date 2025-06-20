import { AppState } from './state.js';

export class HelperPointManager {
    /**
     * Main function to update helper points - generates simple helpers for current drawing
     */
    static updateHelperPoints() {
        // Clear existing helper points
        AppState.helperPoints = [];
        
        // Only generate helpers if we're actively drawing
        if (!AppState.currentPolygonPoints || AppState.currentPolygonPoints.length === 0) {
            return;
        }
        
        const points = AppState.currentPolygonPoints;
        const lastPoint = points[points.length - 1];
        const uniqueHelpers = new Map();
        
        // --- Existing Helper Logic (for drawing new shapes) ---
        if (points.length > 1) {
            // Generate horizontal and vertical alignment helpers from each previous point
            for (let i = 0; i < points.length - 1; i++) {
                const point = points[i];
                
                // Horizontal alignment (same Y as existing point, X of last point)
                const horizontalKey = `${lastPoint.x},${point.y}`;
                uniqueHelpers.set(horizontalKey, {
                    x: lastPoint.x,
                    y: point.y,
                    type: 'horizontal',
                    alignedWith: point.name
                });
                
                // Vertical alignment (same X as existing point, Y of last point)
                const verticalKey = `${point.x},${lastPoint.y}`;
                uniqueHelpers.set(verticalKey, {
                    x: point.x,
                    y: lastPoint.y,
                    type: 'vertical',
                    alignedWith: point.name
                });
            }
        }
        
        // --- NEW: Intersection helpers with existing polygons (for splitting) ---
        // Find which completed polygon this point is inside
        const parentPolygon = AppState.drawnPolygons.find(poly =>
            AreaHelpers.isPointInsidePolygon(lastPoint, poly.path)
        );

        if (parentPolygon) {
            console.log(`HELPER POINTS: Drawing inside polygon "${parentPolygon.label}". Generating split helpers.`);

            const edges = [];
            for (let i = 0; i < parentPolygon.path.length; i++) {
                edges.push({
                    start: parentPolygon.path[i],
                    end: parentPolygon.path[(i + 1) % parentPolygon.path.length]
                });
            }

            // Define "infinite" horizontal and vertical lines through the last drawn point
            const horizontalLine = { start: { x: -10000, y: lastPoint.y }, end: { x: 10000, y: lastPoint.y } };
            const verticalLine = { start: { x: lastPoint.x, y: -10000 }, end: { x: lastPoint.x, y: 10000 } };

            edges.forEach((edge, index) => {
                // Check for horizontal intersection
                const hIntersection = this.getLineIntersection(horizontalLine.start, horizontalLine.end, edge.start, edge.end);
                if (hIntersection && this.isPointOnSegment(hIntersection, edge.start, edge.end) && this.distance(hIntersection, lastPoint) > 1) {
                    const key = `ph_intersect_${hIntersection.x.toFixed(1)},${hIntersection.y.toFixed(1)}`;
                    uniqueHelpers.set(key, {
                        x: hIntersection.x,
                        y: hIntersection.y,
                        type: 'split-horizontal',
                        alignedWith: `parent-edge-${index}`
                    });
                }

                // Check for vertical intersection
                const vIntersection = this.getLineIntersection(verticalLine.start, verticalLine.end, edge.start, edge.end);
                if (vIntersection && this.isPointOnSegment(vIntersection, edge.start, edge.end) && this.distance(vIntersection, lastPoint) > 1) {
                    const key = `pv_intersect_${vIntersection.x.toFixed(1)},${vIntersection.y.toFixed(1)}`;
                    uniqueHelpers.set(key, {
                        x: vIntersection.x,
                        y: vIntersection.y,
                        type: 'split-vertical',
                        alignedWith: `parent-edge-${index}`
                    });
                }
            });
        }
        
        // Convert Map to array
        AppState.helperPoints = Array.from(uniqueHelpers.values());
        
        console.log(`HELPER POINTS: Generated ${AppState.helperPoints.length} total helpers.`);
    }

    /**
     * Calculate distance between two points
     */
    static distance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    /**
     * Calculate intersection point of two lines
     */
    static getLineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;
        
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 0.0001) return null; // Lines are parallel
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1)
            };
        }
        
        return null;
    }
    
    /**
     * Check if a point is on a line segment (within bounds)
     */
    static isPointOnSegment(point, segStart, segEnd) {
        const minX = Math.min(segStart.x, segEnd.x);
        const maxX = Math.max(segStart.x, segEnd.x);
        const minY = Math.min(segStart.y, segEnd.y);
        const maxY = Math.max(segStart.y, segEnd.y);
        
        const tolerance = 0.1;
        return point.x >= minX - tolerance && point.x <= maxX + tolerance &&
               point.y >= minY - tolerance && point.y <= maxY + tolerance;
    }

    // Other static methods remain unchanged
    static clearPermanentHelpers() {
        AppState.permanentHelperPoints = [];
    }

    static removePermanentHelpersFromPath(pathId) {
        if (!AppState.permanentHelperPoints) return;
        AppState.permanentHelperPoints = AppState.permanentHelperPoints.filter(
            point => point.pathId !== pathId
        );
    }

    static getHelperPointStats() {
        const tempCount = AppState.helperPoints ? AppState.helperPoints.length : 0;
        const permCount = AppState.permanentHelperPoints ? AppState.permanentHelperPoints.length : 0;
        return { temporary: tempCount, permanent: permCount, total: tempCount + permCount };
    }
}

// The AreaHelpers class remains unchanged
export class AreaHelpers {
    static calculateArea(points) {
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return Math.abs(area / 2);
    }

    static getPolygonCenter(points) {
        let cx = 0, cy = 0;
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const a = points[i].x * points[j].y - points[j].x * points[i].y;
            area += a;
            cx += (points[i].x + points[j].x) * a;
            cy += (points[i].y + points[j].y) * a;
        }
        area *= 0.5;
        if (Math.abs(area) < 1e-6) {
             let sumX = 0, sumY = 0;
             points.forEach(p => { sumX += p.x; sumY += p.y; });
             return { x: sumX / n, y: sumY / n };
        }
        cx /= (6 * area);
        cy /= (6 * area);
        return { x: cx, y: cy };
    }

    static isPointInsidePolygon(point, polygonPath) {
        let inside = false;
        const n = polygonPath.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygonPath[i].x, yi = polygonPath[i].y;
            const xj = polygonPath[j].x, yj = polygonPath[j].y;
            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    static calculatePolygonArea(points) {
        return this.calculateArea(points);
    }

    static calculateCentroid(points) {
        return this.getPolygonCenter(points);
    }
}