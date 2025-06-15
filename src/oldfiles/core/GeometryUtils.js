// src/core/GeometryUtils.js - NEW MODULAR VERSION

/**
 * Geometry utility functions for floor plan calculations
 * Static class with pure math functions
 */
export class GeometryUtils {
    static PIXELS_PER_FOOT = 8;
    static FEET_PER_GRID_SQUARE = 5;
    static GRID_SIZE_PIXELS = 40;

    /**
     * Calculate distance between two points
     */
    static distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculate distance in feet
     */
    static distanceInFeet(p1, p2) {
        return this.distance(p1, p2) / this.PIXELS_PER_FOOT;
    }

    /**
     * Calculate angle between two points in radians
     */
    static angle(p1, p2) {
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
    }

    /**
     * Calculate angle between two points in degrees
     */
    static angleDegrees(p1, p2) {
        return this.angle(p1, p2) * 180 / Math.PI;
    }

    /**
     * Normalize angle to 0-360 degrees
     */
    static normalizeAngle(degrees) {
        return ((degrees % 360) + 360) % 360;
    }

    /**
     * Convert degrees to radians
     */
    static degreesToRadians(degrees) {
        return degrees * Math.PI / 180;
    }

    /**
     * Convert radians to degrees
     */
    static radiansToDegrees(radians) {
        return radians * 180 / Math.PI;
    }

    /**
     * Calculate midpoint between two points
     */
    static midpoint(p1, p2) {
        return {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };
    }

    /**
     * Calculate perpendicular vector to a line
     */
    static perpendicular(p1, p2, normalize = true) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        
        let perpX = -dy;
        let perpY = dx;
        
        if (normalize) {
            const length = Math.sqrt(perpX * perpX + perpY * perpY);
            if (length > 0) {
                perpX /= length;
                perpY /= length;
            }
        }
        
        return { x: perpX, y: perpY };
    }

    /**
     * Check if point is within radius of another point
     */
    static isWithinRadius(point, center, radius) {
        return this.distance(point, center) <= radius;
    }

    /**
     * Calculate polygon area using shoelace formula
     */
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

    /**
     * Calculate polygon area in square feet
     */
    static calculatePolygonAreaSqFt(path) {
        const areaInPixels = this.calculatePolygonArea(path);
        return areaInPixels / (this.PIXELS_PER_FOOT * this.PIXELS_PER_FOOT);
    }

    /**
     * Calculate polygon centroid
     */
    static calculateCentroid(path) {
        if (!path || path.length === 0) return { x: 0, y: 0 };
        
        let sumX = 0;
        let sumY = 0;
        
        path.forEach(point => {
            sumX += point.x;
            sumY += point.y;
        });
        
        return {
            x: sumX / path.length,
            y: sumY / path.length
        };
    }

    /**
     * Check if point is inside polygon using ray casting
     */
    static isPointInPolygon(point, polygonPath) {
        if (!polygonPath || polygonPath.length < 3) return false;
        
        let inside = false;
        const x = point.x;
        const y = point.y;
        
        for (let i = 0, j = polygonPath.length - 1; i < polygonPath.length; j = i++) {
            const xi = polygonPath[i].x;
            const yi = polygonPath[i].y;
            const xj = polygonPath[j].x;
            const yj = polygonPath[j].y;

            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        
        return inside;
    }

    /**
     * Calculate distance from point to line segment
     */
    static distanceFromPointToLineSegment(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        if (lenSq === 0) {
            // Line segment is actually a point
            return Math.sqrt(A * A + B * B);
        }

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
     * Check if two line segments intersect
     */
    static doLinesIntersect(line1Start, line1End, line2Start, line2End) {
        const intersection = this.getLineIntersection(line1Start, line1End, line2Start, line2End);
        return intersection !== null;
    }

    /**
     * Get intersection point of two line segments
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
     * Project point onto line segment
     */
    static projectPointOntoLine(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        if (lenSq === 0) {
            return { x: lineStart.x, y: lineStart.y };
        }

        let param = dot / lenSq;
        param = Math.max(0, Math.min(1, param)); // Clamp to line segment

        return {
            x: lineStart.x + param * C,
            y: lineStart.y + param * D
        };
    }

    /**
     * Check if two points are approximately equal
     */
    static pointsEqual(p1, p2, tolerance = 2) {
        return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
    }

    /**
     * Rotate point around center
     */
    static rotatePoint(point, center, angleRadians) {
        const cos = Math.cos(angleRadians);
        const sin = Math.sin(angleRadians);
        
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        
        return {
            x: center.x + dx * cos - dy * sin,
            y: center.y + dx * sin + dy * cos
        };
    }

    /**
     * Scale point from center
     */
    static scalePoint(point, center, scaleX, scaleY = null) {
        if (scaleY === null) scaleY = scaleX;
        
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        
        return {
            x: center.x + dx * scaleX,
            y: center.y + dy * scaleY
        };
    }

    /**
     * Get bounding box of points
     */
    static getBoundingBox(points) {
        if (!points || points.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
        }
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        points.forEach(point => {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        });
        
        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Check if polygon is clockwise
     */
    static isPolygonClockwise(points) {
        let sum = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            sum += (points[j].x - points[i].x) * (points[j].y + points[i].y);
        }
        return sum > 0;
    }

    /**
     * Simplify polygon by removing collinear points
     */
    static simplifyPolygon(points, tolerance = 1) {
        if (points.length <= 3) return points;
        
        const simplified = [];
        
        for (let i = 0; i < points.length; i++) {
            const prev = points[(i - 1 + points.length) % points.length];
            const curr = points[i];
            const next = points[(i + 1) % points.length];
            
            // Check if points are collinear
            const crossProduct = (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x);
            
            if (Math.abs(crossProduct) > tolerance) {
                simplified.push(curr);
            }
        }
        
        return simplified.length >= 3 ? simplified : points;
    }

    /**
     * Convert pixels to feet
     */
    static pixelsToFeet(pixels) {
        return pixels / this.PIXELS_PER_FOOT;
    }

    /**
     * Convert feet to pixels
     */
    static feetToPixels(feet) {
        return feet * this.PIXELS_PER_FOOT;
    }

    /**
     * Snap value to grid
     */
    static snapToGrid(value, gridSize = this.GRID_SIZE_PIXELS) {
        return Math.round(value / gridSize) * gridSize;
    }

    /**
     * Snap point to grid
     */
    static snapPointToGrid(point, gridSize = this.GRID_SIZE_PIXELS) {
        return {
            x: this.snapToGrid(point.x, gridSize),
            y: this.snapToGrid(point.y, gridSize)
        };
    }
}