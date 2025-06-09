// src/helpers.js
import { AppState } from './state.js';

export class HelperPointManager {
    static updateHelperPoints() {
        const points = AppState.currentPolygonPoints;
        // Ensure AppState.helperPoints is an array
        AppState.helperPoints = []; 

        if (!points || points.length < 1) {
            return;
        }

        const uniqueHelpers = new Map();
        const lastPoint = points[points.length - 1];

        // Generate helper points by projecting the last point onto the axes of all previous points
        for (const p of points.slice(0, -1)) { // Exclude the last point itself
            // Projection of lastPoint.y onto p.x
            uniqueHelpers.set(`${p.x},${lastPoint.y}`, { x: p.x, y: lastPoint.y });
            // Projection of lastPoint.x onto p.y
            uniqueHelpers.set(`${lastPoint.x},${p.y}`, { x: lastPoint.x, y: p.y });
        }
        
        // As per your example, for the segment p0-p1, you wanted a point at (p0.x, p1.y)
        if (points.length >= 2) {
            const p0 = points[0];
            const p1 = points[1];
            uniqueHelpers.set(`${p0.x},${p1.y}`, { x: p0.x, y: p1.y });
        }

        AppState.helperPoints = Array.from(uniqueHelpers.values());
        console.log(`Generated ${AppState.helperPoints.length} helper points.`);
    }
}