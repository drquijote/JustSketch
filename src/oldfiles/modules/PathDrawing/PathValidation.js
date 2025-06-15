// src/modules/PathDrawing/PathValidation.js - Path validation
export class PathValidation {
    constructor(eventBus, geometry) {
        console.log('PathValidation: Initializing');
        
        // Dependencies injected, not imported
        this.eventBus = eventBus;
        this.geometry = geometry;
        
        // Configuration
        this.minVertices = 3;
        this.maxVertices = 100;
        this.minEdgeLength = 0.1; // feet
        this.maxEdgeLength = 1000; // feet
        this.pixelsPerFoot = 8;
        this.tolerance = 0.01;
        
        console.log('PathValidation: Initialized');
    }

    // Validate a complete cycle before completion
    validateCycle(path) {
        console.log('PathValidation: Validating cycle with', path.length, 'vertices');
        
        const validations = [
            () => this.validateVertexCount(path),
            () => this.validateEdgeLengths(path),
            () => this.validateClosure(path),
            () => this.validateSelfIntersections(path),
            () => this.validateMinimumArea(path),
            () => this.validateGeometricProperties(path)
        ];
        
        for (const validation of validations) {
            const result = validation();
            if (!result.valid) {
                console.log('PathValidation: Validation failed -', result.reason);
                this.eventBus?.emit?.('validation:failed', result);
                return false;
            }
        }
        
        console.log('PathValidation: Cycle validation passed');
        this.eventBus?.emit?.('validation:passed', { path });
        return true;
    }

    // Validate vertex count
    validateVertexCount(path) {
        if (!path || path.length < this.minVertices) {
            return {
                valid: false,
                reason: `Path must have at least ${this.minVertices} vertices, found ${path?.length || 0}`,
                code: 'INSUFFICIENT_VERTICES'
            };
        }
        
        if (path.length > this.maxVertices) {
            return {
                valid: false,
                reason: `Path has too many vertices (${path.length}), maximum is ${this.maxVertices}`,
                code: 'TOO_MANY_VERTICES'
            };
        }
        
        return { valid: true };
    }

    // Validate edge lengths are reasonable
    validateEdgeLengths(path) {
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            
            const lengthPixels = this.calculateDistance(p1, p2);
            const lengthFeet = lengthPixels / this.pixelsPerFoot;
            
            if (lengthFeet < this.minEdgeLength) {
                return {
                    valid: false,
                    reason: `Edge ${i} is too short (${lengthFeet.toFixed(2)} ft), minimum is ${this.minEdgeLength} ft`,
                    code: 'EDGE_TOO_SHORT',
                    edgeIndex: i
                };
            }
            
            if (lengthFeet > this.maxEdgeLength) {
                return {
                    valid: false,
                    reason: `Edge ${i} is too long (${lengthFeet.toFixed(2)} ft), maximum is ${this.maxEdgeLength} ft`,
                    code: 'EDGE_TOO_LONG',
                    edgeIndex: i
                };
            }
        }
        
        return { valid: true };
    }

    // Validate path closure (first and last points are close)
    validateClosure(path) {
        if (path.length < 3) return { valid: true };
        
        const firstPoint = path[0];
        const lastPoint = path[path.length - 1];
        const distance = this.calculateDistance(firstPoint, lastPoint);
        
        // For validation, we assume the path will be closed automatically
        // so we just check if it's reasonable to close it
        const maxClosureDistance = 200; // pixels
        
        if (distance > maxClosureDistance) {
            return {
                valid: false,
                reason: `Path closure distance is too large (${distance.toFixed(1)} pixels)`,
                code: 'CLOSURE_TOO_LARGE',
                distance: distance
            };
        }
        
        return { valid: true };
    }

    // Check for self-intersections in the path
    validateSelfIntersections(path) {
        const intersections = this.findSelfIntersections(path);
        
        if (intersections.length > 0) {
            return {
                valid: false,
                reason: `Path has ${intersections.length} self-intersection(s)`,
                code: 'SELF_INTERSECTIONS',
                intersections: intersections
            };
        }
        
        return { valid: true };
    }

    // Validate minimum area requirement
    validateMinimumArea(path) {
        const areaPixels = this.calculatePolygonArea(path);
        const areaFeet = areaPixels / (this.pixelsPerFoot * this.pixelsPerFoot);
        const minAreaFeet = 1.0; // 1 square foot minimum
        
        if (areaFeet < minAreaFeet) {
            return {
                valid: false,
                reason: `Area is too small (${areaFeet.toFixed(2)} sq ft), minimum is ${minAreaFeet} sq ft`,
                code: 'AREA_TOO_SMALL',
                area: areaFeet
            };
        }
        
        return { valid: true };
    }

    // Validate geometric properties
    validateGeometricProperties(path) {
        // Check for degenerate triangles or collinear points
        if (path.length === 3) {
            const area = this.calculatePolygonArea(path);
            if (Math.abs(area) < this.tolerance) {
                return {
                    valid: false,
                    reason: 'Triangle is degenerate (collinear points)',
                    code: 'DEGENERATE_TRIANGLE'
                };
            }
        }
        
        // Check for duplicate consecutive vertices
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            
            if (this.pointsAreEqual(p1, p2, 1)) {
                return {
                    valid: false,
                    reason: `Duplicate consecutive vertices at index ${i}`,
                    code: 'DUPLICATE_VERTICES',
                    vertexIndex: i
                };
            }
        }
        
        return { valid: true };
    }

    // Find all self-intersections in the path
    findSelfIntersections(path) {
        const intersections = [];
        
        if (path.length < 4) return intersections;
        
        // Check each pair of non-adjacent edges
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            
            for (let j = i + 2; j < path.length; j++) {
                // Skip adjacent segments and wrap-around case
                if (i === 0 && j === path.length - 1) continue;
                
                const p3 = path[j];
                const p4 = path[(j + 1) % path.length];
                
                const intersection = this.findLineIntersection(p1, p2, p3, p4);
                if (intersection) {
                    intersections.push({
                        point: intersection,
                        edge1: { start: i, end: (i + 1) % path.length },
                        edge2: { start: j, end: (j + 1) % path.length }
                    });
                }
            }
        }
        
        return intersections;
    }

    // Attempt to fix common path issues
    fixPath(path, issues = null) {
        console.log('PathValidation: Attempting to fix path issues');
        
        let fixedPath = [...path];
        let wasFixed = false;
        
        // Fix 1: Remove duplicate consecutive vertices
        fixedPath = this.removeDuplicateVertices(fixedPath);
        if (fixedPath.length !== path.length) {
            console.log('PathValidation: Removed duplicate vertices');
            wasFixed = true;
        }
        
        // Fix 2: Fix self-intersections using simple reordering
        const intersections = this.findSelfIntersections(fixedPath);
        if (intersections.length > 0) {
            const reorderedPath = this.fixSimpleIntersections(fixedPath, intersections);
            if (reorderedPath) {
                fixedPath = reorderedPath;
                console.log('PathValidation: Fixed self-intersections');
                wasFixed = true;
            }
        }
        
        // Fix 3: Ensure proper vertex naming
        fixedPath = this.renameVertices(fixedPath);
        
        return {
            path: fixedPath,
            wasFixed: wasFixed,
            originalLength: path.length,
            fixedLength: fixedPath.length
        };
    }

    // Remove duplicate consecutive vertices
    removeDuplicateVertices(path) {
        const cleaned = [];
        const tolerance = 1; // pixel tolerance
        
        for (let i = 0; i < path.length; i++) {
            const current = path[i];
            const next = path[(i + 1) % path.length];
            
            // Only add if not duplicate of next vertex
            if (!this.pointsAreEqual(current, next, tolerance)) {
                cleaned.push({ ...current });
            }
        }
        
        return cleaned;
    }

    // Fix simple self-intersections by reordering vertices
    fixSimpleIntersections(path, intersections) {
        // For now, just try reversing segments between intersection points
        // This is a simple fix that works for some "figure-8" patterns
        
        if (intersections.length === 1) {
            const intersection = intersections[0];
            const edge1End = intersection.edge1.end;
            const edge2Start = intersection.edge2.start;
            
            // Try reversing the segment between these edges
            if (edge1End < edge2Start) {
                const newPath = [...path];
                const segment = newPath.slice(edge1End, edge2Start + 1);
                segment.reverse();
                newPath.splice(edge1End, segment.length, ...segment);
                
                // Check if this fixed the intersection
                if (this.findSelfIntersections(newPath).length === 0) {
                    return newPath;
                }
            }
        }
        
        return null; // Couldn't fix automatically
    }

    // Rename vertices to have consistent naming
    renameVertices(path) {
        return path.map((vertex, index) => ({
            ...vertex,
            name: `p${index}`
        }));
    }

    // Validate individual vertex placement
    validateVertexPlacement(vertex, currentPath) {
        const validations = [
            () => this.validateVertexPosition(vertex),
            () => this.validateVertexUniqueness(vertex, currentPath),
            () => this.validateVertexEdgeLength(vertex, currentPath)
        ];
        
        for (const validation of validations) {
            const result = validation();
            if (!result.valid) {
                return result;
            }
        }
        
        return { valid: true };
    }

    // Validate vertex position is reasonable
    validateVertexPosition(vertex) {
        const maxCoordinate = 50000; // pixels
        
        if (!vertex || typeof vertex.x !== 'number' || typeof vertex.y !== 'number') {
            return {
                valid: false,
                reason: 'Vertex has invalid coordinates',
                code: 'INVALID_COORDINATES'
            };
        }
        
        if (Math.abs(vertex.x) > maxCoordinate || Math.abs(vertex.y) > maxCoordinate) {
            return {
                valid: false,
                reason: 'Vertex coordinates are too large',
                code: 'COORDINATES_TOO_LARGE'
            };
        }
        
        return { valid: true };
    }

    // Validate vertex is not too close to existing vertices
    validateVertexUniqueness(vertex, currentPath) {
        const minDistance = 2; // pixels
        
        for (let i = 0; i < currentPath.length; i++) {
            const existing = currentPath[i];
            const distance = this.calculateDistance(vertex, existing);
            
            if (distance < minDistance) {
                return {
                    valid: false,
                    reason: `Vertex is too close to existing vertex ${existing.name} (${distance.toFixed(1)} pixels)`,
                    code: 'VERTEX_TOO_CLOSE',
                    existingVertex: existing,
                    distance: distance
                };
            }
        }
        
        return { valid: true };
    }

    // Validate edge length from last vertex to new vertex
    validateVertexEdgeLength(vertex, currentPath) {
        if (currentPath.length === 0) return { valid: true };
        
        const lastVertex = currentPath[currentPath.length - 1];
        const lengthPixels = this.calculateDistance(lastVertex, vertex);
        const lengthFeet = lengthPixels / this.pixelsPerFoot;
        
        if (lengthFeet < this.minEdgeLength) {
            return {
                valid: false,
                reason: `Edge would be too short (${lengthFeet.toFixed(2)} ft)`,
                code: 'EDGE_TOO_SHORT',
                length: lengthFeet
            };
        }
        
        if (lengthFeet > this.maxEdgeLength) {
            return {
                valid: false,
                reason: `Edge would be too long (${lengthFeet.toFixed(2)} ft)`,
                code: 'EDGE_TOO_LONG',
                length: lengthFeet
            };
        }
        
        return { valid: true };
    }

    // Validate path during drawing (incremental validation)
    validateIncrementalPath(currentPath) {
        if (!currentPath || currentPath.length === 0) {
            return { valid: true };
        }
        
        // Check the last edge if we have at least 2 vertices
        if (currentPath.length >= 2) {
            const lastEdgeValidation = this.validateVertexEdgeLength(
                currentPath[currentPath.length - 1],
                currentPath.slice(0, -1)
            );
            
            if (!lastEdgeValidation.valid) {
                return lastEdgeValidation;
            }
        }
        
        // Check for potential closure issues if we have 3+ vertices
        if (currentPath.length >= 3) {
            const closureValidation = this.validatePotentialClosure(currentPath);
            if (!closureValidation.valid) {
                return closureValidation;
            }
        }
        
        return { valid: true };
    }

    // Validate potential closure of current path
    validatePotentialClosure(currentPath) {
        if (currentPath.length < 3) return { valid: true };
        
        const firstVertex = currentPath[0];
        const lastVertex = currentPath[currentPath.length - 1];
        const closureDistance = this.calculateDistance(firstVertex, lastVertex);
        const closureFeet = closureDistance / this.pixelsPerFoot;
        
        // Warn if closure edge would be very long
        if (closureFeet > 50) { // 50 feet
            return {
                valid: false,
                reason: `Closure edge would be very long (${closureFeet.toFixed(1)} ft)`,
                code: 'CLOSURE_EDGE_LONG',
                distance: closureFeet,
                severity: 'warning'
            };
        }
        
        return { valid: true };
    }

    // Check if path is oriented correctly (counterclockwise)
    validateOrientation(path) {
        const area = this.calculateSignedPolygonArea(path);
        const isCounterClockwise = area > 0;
        
        return {
            valid: true, // Orientation is not a validation failure
            isCounterClockwise: isCounterClockwise,
            signedArea: area,
            suggestion: isCounterClockwise ? null : 'Consider reversing path for counterclockwise orientation'
        };
    }

    // Utility functions
    calculateDistance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    calculatePolygonArea(path) {
        if (path.length < 3) return 0;
        
        let area = 0;
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            area += (p1.x * p2.y - p2.x * p1.y);
        }
        
        return Math.abs(area / 2);
    }

    calculateSignedPolygonArea(path) {
        if (path.length < 3) return 0;
        
        let area = 0;
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            area += (p1.x * p2.y - p2.x * p1.y);
        }
        
        return area / 2;
    }

    pointsAreEqual(p1, p2, tolerance = 1) {
        return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
    }

    findLineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;
        
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 0.0001) return null;
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        // Check if intersection is within both line segments (excluding endpoints)
        if (t > 0 && t < 1 && u > 0 && u < 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1),
                t: t,
                u: u
            };
        }
        
        return null;
    }

    // Configuration methods
    setMinVertices(count) {
        this.minVertices = Math.max(3, count);
        console.log('PathValidation: Set minimum vertices to', this.minVertices);
    }

    setMaxVertices(count) {
        this.maxVertices = Math.max(this.minVertices, count);
        console.log('PathValidation: Set maximum vertices to', this.maxVertices);
    }

    setEdgeLengthLimits(minFeet, maxFeet) {
        this.minEdgeLength = Math.max(0.1, minFeet);
        this.maxEdgeLength = Math.max(this.minEdgeLength, maxFeet);
        console.log('PathValidation: Set edge length limits to', this.minEdgeLength, '-', this.maxEdgeLength, 'feet');
    }

    setPixelsPerFoot(pixels) {
        this.pixelsPerFoot = Math.max(1, pixels);
        console.log('PathValidation: Set pixels per foot to', this.pixelsPerFoot);
    }

    // Get current configuration
    getConfiguration() {
        return {
            minVertices: this.minVertices,
            maxVertices: this.maxVertices,
            minEdgeLength: this.minEdgeLength,
            maxEdgeLength: this.maxEdgeLength,
            pixelsPerFoot: this.pixelsPerFoot,
            tolerance: this.tolerance
        };
    }

    // Get validation statistics for a path
    getPathStatistics(path) {
        if (!path || path.length === 0) {
            return {
                vertexCount: 0,
                totalLength: 0,
                area: 0,
                averageEdgeLength: 0,
                selfIntersections: 0
            };
        }
        
        let totalLengthPixels = 0;
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            totalLengthPixels += this.calculateDistance(p1, p2);
        }
        
        const area = this.calculatePolygonArea(path);
        const intersections = this.findSelfIntersections(path);
        
        return {
            vertexCount: path.length,
            totalLength: totalLengthPixels / this.pixelsPerFoot,
            area: area / (this.pixelsPerFoot * this.pixelsPerFoot),
            averageEdgeLength: (totalLengthPixels / path.length) / this.pixelsPerFoot,
            selfIntersections: intersections.length
        };
    }
}