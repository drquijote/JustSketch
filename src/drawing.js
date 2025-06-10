import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { HelperPointManager } from './helpers.js';

export class DrawingManager {
constructor() {
    console.log('DrawingManager: Initializing minimal version');
    this.PIXELS_PER_FOOT = 8;
    this.FEET_PER_GRID_SQUARE = 5;
    this.GRID_SIZE_PIXELS = 40;
    this.isActive = false;
    this.waitingForFirstVertex = false;
    this.activeInput = 'distance';
    this.distanceInputSequence = [];
    this.angleInputSequence = [];

    // Store preset angles for easy checking
    this.directionAngles = {
      'right': 0,
      'up-right': 45,
      'up': 90,
      'up-left': 135,
      'left': 180,
      'down-left': 225,
      'down': 270,
      'down-right': 315
    };
    
    // Bind all event handlers once in constructor
    this.boundHandleCanvasClick = this.handleCanvasClick.bind(this);
    this.boundHandleCanvasTouch = this.handleCanvasTouch.bind(this);
    this.boundHandleAngleButtonClick = this.handleAngleButtonClick.bind(this);
    this.boundHandleKeypadClick = this.handleKeypadClick.bind(this);
    this.boundHandleDirectionClick = this.handleDirectionClick.bind(this);
    this.boundHandleArrowKey = this.handleArrowKey.bind(this);
    this.boundHandleDistanceKeydown = (e) => this.handleDecimalInput(e, 'distance');
    this.boundHandleAngleKeydown = (e) => this.handleDecimalInput(e, 'angle');
    this.boundHandleDistanceClick = () => {
      this.activeInput = 'distance';
      console.log('Active input: distance');
    };
    this.boundHandleAngleInputClick = () => {
      this.activeInput = 'angle';
      console.log('Active input: angle');
    };
    this.boundHandleDistanceFocus = () => {
      this.activeInput = 'distance';
      console.log('Active input: distance');
    };
    this.boundHandleAngleFocus = () => {
      this.activeInput = 'angle';
      const angleDisplay = document.getElementById('angleDisplay');
      if (angleDisplay) angleDisplay.select();
      console.log('Active input: angle');
    };
    
    this.setupEventListeners();
    console.log('DrawingManager: Initialized');
  }

findClickedHelperPoint(x, y) {
    const clickRadius = this.isMobileDevice() ? 30 : 20;
    let closestHelper = null;
    let closestDistance = Infinity;
    
    // Check temporary helper points first (from current drawing)
    if (AppState.helperPoints) {
        for (const point of AppState.helperPoints) {
            const dx = x - point.x;
            const dy = y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= clickRadius && distance < closestDistance) {
                closestHelper = point;
                closestDistance = distance;
            }
        }
    }
    
    // *** ENHANCED: Check permanent helper points (from completed paths) ***
    if (AppState.permanentHelperPoints) {
        for (const point of AppState.permanentHelperPoints) {
            const dx = x - point.x;
            const dy = y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= clickRadius && distance < closestDistance) {
                closestHelper = point;
                closestDistance = distance;
            }
        }
    }
    
    if (closestHelper) {
        console.log('🟣 HELPER DEBUG: Found closest helper point at:', closestHelper, 'distance:', closestDistance.toFixed(1));
        return closestHelper;
    }
    
    return null;
}



// *** SIMPLIFIED: Find if permanent helper is part of existing area and get next logical point ***
findSharedEdgePath(permanentHelper, currentLastPoint) {
    if (!AppState.drawnPolygons || !permanentHelper) return null;
    
    console.log('🔍 SHARED EDGE DEBUG: Looking for shared edge path to permanent helper');
    
    // Find which area this permanent helper belongs to
    for (const area of AppState.drawnPolygons) {
        const vertexIndex = area.path.findIndex(vertex => 
            Math.abs(vertex.x - permanentHelper.x) < 2 && 
            Math.abs(vertex.y - permanentHelper.y) < 2
        );
        
        if (vertexIndex !== -1) {
            console.log('🔍 SHARED EDGE DEBUG: Found permanent helper at vertex', vertexIndex, 'of area:', area.label);
            
            // Check if there's a clear shared edge from current position to this vertex
            const sharedPath = this.findDirectSharedPath(currentLastPoint, area, vertexIndex);
            
            if (sharedPath && sharedPath.length > 1) {
                console.log('✅ SHARED EDGE DEBUG: Found shared edge path with', sharedPath.length, 'points');
                return sharedPath;
            }
        }
    }
    
    console.log('❌ SHARED EDGE DEBUG: No shared edge path found');
    return null;
}

// *** NEW: Find direct shared path along existing area boundary ***
findDirectSharedPath(fromPoint, area, targetVertexIndex) {
    console.log('🔍 PATH DEBUG: Finding direct shared path to vertex', targetVertexIndex);
    
    // Check if fromPoint is close to any edge of the area
    for (let i = 0; i < area.path.length; i++) {
        const edgeStart = area.path[i];
        const edgeEnd = area.path[(i + 1) % area.path.length];
        
        // Check if fromPoint is on or very close to this edge
        const distanceToEdge = this.distanceFromPointToLineSegment(fromPoint, edgeStart, edgeEnd);
        
        if (distanceToEdge < 10) { // Within 10 pixels of the edge
            console.log('🔍 PATH DEBUG: Current point is near edge', i, 'to', (i + 1) % area.path.length);
            
            // Find path along the area perimeter from this edge to target vertex
            return this.getPathAlongPerimeter(area, i, targetVertexIndex, fromPoint);
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

// *** NEW: Get path along area perimeter from edge to target vertex ***
getPathAlongPerimeter(area, edgeIndex, targetVertexIndex, fromPoint) {
    const path = [];
    const areaPath = area.path;
    
    // Determine which end of the edge is closer to target
    const edgeStart = areaPath[edgeIndex];
    const edgeEnd = areaPath[(edgeIndex + 1) % areaPath.length];
    
    // Calculate distances to determine best direction
    const distToStart = Math.abs(edgeIndex - targetVertexIndex);
    const distToEnd = Math.abs(((edgeIndex + 1) % areaPath.length) - targetVertexIndex);
    
    console.log('🔍 PATH DEBUG: Distance to edge start:', distToStart, 'to edge end:', distToEnd);
    
    // Choose the shorter path
    if (distToStart <= distToEnd) {
        // Go via edge start
        console.log('🔍 PATH DEBUG: Taking path via edge start');
        
        // Add edge start if it's not too close to fromPoint
        if (this.getDistance(fromPoint, edgeStart) > 5) {
            path.push({
                x: edgeStart.x,
                y: edgeStart.y,
                name: `shared_${edgeIndex}`,
                sharedEdge: true
            });
        }
        
        // Add vertices from edge start to target
        let current = edgeIndex;
        while (current !== targetVertexIndex) {
            current = (current + areaPath.length - 1) % areaPath.length; // Go backwards
            if (current !== targetVertexIndex) {
                path.push({
                    x: areaPath[current].x,
                    y: areaPath[current].y,
                    name: `shared_${current}`,
                    sharedEdge: true
                });
            }
        }
    } else {
        // Go via edge end
        console.log('🔍 PATH DEBUG: Taking path via edge end');
        
        // Add edge end if it's not too close to fromPoint
        if (this.getDistance(fromPoint, edgeEnd) > 5) {
            path.push({
                x: edgeEnd.x,
                y: edgeEnd.y,
                name: `shared_${(edgeIndex + 1) % areaPath.length}`,
                sharedEdge: true
            });
        }
        
        // Add vertices from edge end to target
        let current = (edgeIndex + 1) % areaPath.length;
        while (current !== targetVertexIndex) {
            current = (current + 1) % areaPath.length; // Go forwards
            if (current !== targetVertexIndex) {
                path.push({
                    x: areaPath[current].x,
                    y: areaPath[current].y,
                    name: `shared_${current}`,
                    sharedEdge: true
                });
            }
        }
    }
    
    // Always add the target vertex
    path.push({
        x: areaPath[targetVertexIndex].x,
        y: areaPath[targetVertexIndex].y,
        name: `target_${targetVertexIndex}`,
        sharedEdge: true
    });
    
    console.log('🔍 PATH DEBUG: Generated shared path with', path.length, 'points');
    return path;
}

// *** HELPER: Get distance between two points ***
getDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Find which existing cycle contains this point
findCycleContainingPoint(point) {
    if (!AppState.drawnPolygons) return null;
    
    for (const area of AppState.drawnPolygons) {
        const vertexIndex = area.path.findIndex(vertex => 
            Math.abs(vertex.x - point.x) < 5 && Math.abs(vertex.y - point.y) < 5
        );
        
        if (vertexIndex !== -1) {
            return {
                area: area,
                vertexIndex: vertexIndex
            };
        }
    }
    return null;
}

// Find connection point to existing cycle
// Replace the findConnectionToExistingCycle function in drawing.js with this corrected version.
findConnectionToExistingCycle(point, polygon) {
    // Correctly access the .path property directly from the polygon object
    const vertexIndex = polygon.path.findIndex(vertex => 
        Math.abs(vertex.x - point.x) < 5 && Math.abs(vertex.y - point.y) < 5
    );
    
    if (vertexIndex !== -1) {
        return {
            point: polygon.path[vertexIndex],
            index: vertexIndex
        };
    }
    return null;
}

// Get the shorter arc between two indices in a cycle
// Get the shorter arc between two indices in a cycle
// Replace the entire getShorterArc function in drawing.js with this one.
getShorterArc(cyclePath, startIndex, endIndex) {
    const pathLength = cyclePath.length;
    
    if (startIndex === endIndex) {
        return []; // Same point, no arc needed
    }
    
    // Calculate both possible paths by collecting vertices
    const forwardPath = [];
    const backwardPath = [];
    
    // Forward path (incrementing indices)
    let currentIndex = (startIndex + 1) % pathLength;
    while (currentIndex !== endIndex) {
        forwardPath.push({ ...cyclePath[currentIndex] });
        currentIndex = (currentIndex + 1) % pathLength;
    }
    // Add the end point itself to the forward path
    forwardPath.push({ ...cyclePath[endIndex] });


    // Backward path (decrementing indices)
    currentIndex = (startIndex - 1 + pathLength) % pathLength;
    while (currentIndex !== endIndex) {
        backwardPath.push({ ...cyclePath[currentIndex] });
        currentIndex = (currentIndex - 1 + pathLength) % pathLength;
    }
    // Add the end point itself to the backward path
    backwardPath.push({ ...cyclePath[endIndex] });

    // Helper function to calculate the geometric distance of a path of points
    const calculatePathDistance = (path, startPoint) => {
        let totalDistance = 0;
        let lastPoint = startPoint;
        for (const point of path) {
            const dx = point.x - lastPoint.x;
            const dy = point.y - lastPoint.y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
            lastPoint = point;
        }
        return totalDistance;
    };
    
    const startPoint = cyclePath[startIndex];
    const forwardDistance = calculatePathDistance(forwardPath, startPoint);
    const backwardDistance = calculatePathDistance(backwardPath, startPoint);
    
    console.log(`🔄 ARC CALCULATION: Start: ${startIndex}, End: ${endIndex}`);
    console.log(`  - Forward path distance: ${forwardDistance.toFixed(1)}px`);
    console.log(`  - Backward path distance: ${backwardDistance.toFixed(1)}px`);
    
    // Return the path with the shorter GEOMETRIC distance
    return forwardDistance <= backwardDistance ? forwardPath : backwardPath;
}

// Check if two line segments intersect
// Replace the entire drawCompletedAreas function in areaManager.js with this one.
drawCompletedAreas() {
    const { ctx } = AppState;
    if (!ctx || AppState.drawnPolygons.length === 0) return;

    // First, identify all shared edges so we don't draw labels on them
    const sharedEdges = this.findAllSharedEdges();

    AppState.drawnPolygons.forEach((poly) => {
        ctx.save();

        // Set fill color based on area type
        if (poly.glaType === 1) {
            ctx.fillStyle = 'rgba(144, 238, 144, 0.4)'; // Light Green for GLA
        } else if (poly.glaType === 0) {
            ctx.fillStyle = 'rgba(180, 180, 180, 0.6)'; // Darker Gray for non-GLA
        } else if (poly.glaType === 2) {
            ctx.fillStyle = 'rgba(220, 220, 220, 0.3)'; // Very Light Gray for excluded areas
        }

        // Draw the filled polygon shape
        ctx.beginPath();
        ctx.moveTo(poly.path[0].x, poly.path[0].y);
        for (let i = 1; i < poly.path.length; i++) {
            ctx.lineTo(poly.path[i].x, poly.path[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // Draw the polygon outline
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // --- The block for drawing red vertex labels has been removed from here ---

        // Draw edge length labels, but skip shared edges
        for (let i = 0; i < poly.path.length; i++) {
            const p1 = poly.path[i];
            const p2 = poly.path[(i + 1) % poly.path.length];
            
            const edgeKey = this.getEdgeKey(poly.id, i, (i + 1) % poly.path.length);
            if (!sharedEdges.has(edgeKey)) {
                this.drawExternalLabel(ctx, p1, p2, poly.centroid);
            }
        }

        // Draw the main area label (e.g., "Garage") and its square footage
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(poly.label, poly.centroid.x, poly.centroid.y - 8);
        ctx.font = '10px Arial';
        ctx.fillText(`${poly.area.toFixed(1)} sq ft`, poly.centroid.x, poly.centroid.y + 8);

        if (poly.glaType === 2) {
            ctx.font = '8px Arial';
            ctx.fillStyle = '#666';
            ctx.fillText('(excluded)', poly.centroid.x, poly.centroid.y + 20);
        }

        ctx.restore();
    });

    this.updateLegendCalculations();
}

 

// Find a valid ordering of vertices that creates a simple polygon
findValidPolygonOrder(vertices) {
    const n = vertices.length;
    
    // Try starting from each vertex
    for (let start = 0; start < n; start++) {
        // Try both directions
        for (const reverse of [false, true]) {
            const testPath = [];
            
            for (let i = 0; i < n; i++) {
                const idx = reverse ? (start - i + n) % n : (start + i) % n;
                testPath.push(vertices[idx]);
            }
            
            if (!this.hasPolygonCrossings(testPath)) {
                console.log('✅ Found valid order starting at', start, 'reverse:', reverse);
                return testPath;
            }
        }
    }
    
    console.warn('⚠️ Could not find simple polygon ordering');
    return vertices;
}
// Check if a polygon has self-intersections
// Add these three new functions anywhere inside the DrawingManager class in drawing.js.

/**
 * Checks if a polygon has self-intersections by testing all non-adjacent edges.
 * @param {Array<Object>} path An array of points {x, y}.
 * @returns {Array|false} An array of crossing segment pairs, or false if none.
 */
hasPolygonCrossings(path) {
    if (path.length < 4) return false;
    
    const crossings = [];
    // Check each pair of non-adjacent edges for intersection.
    for (let i = 0; i < path.length; i++) {
        const p1 = path[i];
        const p2 = path[(i + 1) % path.length];
        
        for (let j = i + 2; j < path.length; j++) {
            // Skip checking adjacent segments
            if (i === 0 && j === path.length - 1) continue;
            
            const p3 = path[j];
            const p4 = path[(j + 1) % path.length];
            
            if (this.doSegmentsIntersect(p1, p2, p3, p4)) {
                crossings.push({ edge1: [i, (i + 1) % path.length], edge2: [j, (j + 1) % path.length] });
            }
        }
    }
    
    return crossings.length > 0 ? crossings : false;
}

/**
 * Determines if two line segments intersect using vector cross-products.
 * @returns {boolean} True if the segments intersect without just touching at an endpoint.
 */
doSegmentsIntersect(p1, p2, p3, p4) {
    const det = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (det === 0) return false; // Parallel lines
    
    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / det;
    const u = -((p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)) / det;

    // Intersection occurs if t and u are both between 0 and 1 (exclusive)
    return t > 0 && t < 1 && u > 0 && u < 1;
}


/**
 * Attempts to fix a simple polygon crossing (bowtie) by reordering vertices.
 * @param {Array<Object>} path The path with crossing edges.
 * @returns {Array<Object>} The reordered, non-crossing path.
 */
fixPolygonCrossings(path) {
    const crossings = this.hasPolygonCrossings(path);
    if (!crossings) {
        return path; // No fix needed
    }

    console.log(`🔧 Found ${crossings.length} crossing(s). Attempting to fix.`);

    // This simple fix handles the most common "bowtie" case.
    if (crossings.length === 1) {
        const crossing = crossings[0];
        const [i1, i2] = crossing.edge1;
        const [j1, j2] = crossing.edge2;

        const newPath = [...path];
        // The segment to reverse is the one between the end of the first crossing edge
        // and the end of the second crossing edge.
        const segmentToReverse = newPath.slice(i2, j2);
        segmentToReverse.reverse();

        // Replace the original segment with the now-reversed one.
        newPath.splice(i2, segmentToReverse.length, ...segmentToReverse);

        // Verify that the fix worked.
        if (!this.hasPolygonCrossings(newPath)) {
            console.log("✅ Crossing fixed successfully!");
            return newPath;
        }
    }
    
    console.warn("⚠️ Could not automatically fix all crossings.");
    return path; // Return original path if fix fails
}


 

isPolygonClockwise(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        sum += (points[j].x - points[i].x) * (points[j].y + points[i].y);
    }
    return sum > 0;
}

// Helper method to determine if we should reverse the path
shouldReversePath(startIdx, endIdx, isForward, cyclePath) {
    // This is a simplified check - in practice, we'd want to consider
    // the winding order of the current drawing path as well
    const n = cyclePath.length;
    
    // If we're going "backwards" through the indices but took the forward path,
    // or vice versa, we might need to reverse
    const indexDiff = (endIdx - startIdx + n) % n;
    const expectForward = indexDiff <= n / 2;
    
    return expectForward !== isForward;
}

// *** REPLACE: Updated completeCycleWithPermanentHelper ***
// Replace the completeCycleWithPermanentHelper function in drawing.js with this one.
completeCycleWithPermanentHelper(permanentHelper, tryOnly = false) {
    const currentPath = AppState.currentPolygonPoints;
    if (!currentPath || currentPath.length === 0) return false;

    for (const existingCycle of AppState.drawnPolygons) {
        const startConnection = this.findConnectionToExistingCycle(currentPath[0], existingCycle);
        const endConnection = this.findConnectionToExistingCycle(permanentHelper, existingCycle);

        if (startConnection && endConnection && startConnection.index !== endConnection.index) {
            const arcPath = this.getShorterArc(existingCycle.path, endConnection.index, startConnection.index);

            if (arcPath.length > 0 && arcPath.length <= 2) {
                if (tryOnly) return true; // In "try-only" mode, just confirm it's possible.

                console.log(`✅ Path is short (${arcPath.length} edge(s)). Autocompleting.`);
                const completePath = [...currentPath, permanentHelper, ...arcPath];
                if (completePath.length > 1) {
                    const lastPoint = completePath[completePath.length - 1];
                    const firstPoint = completePath[0];
                    if (lastPoint.x === firstPoint.x && lastPoint.y === firstPoint.y) {
                        completePath.pop();
                    }
                }
                this.completeCycle(completePath);
                return true; // Autocompleted successfully
            }
        }
    }

    // If we get here, no short connection was found.
    if (tryOnly) return false; // In "try-only" mode, report failure.
    
    // Original fallback logic removed.
    console.log("🚫 No valid short connection found.");
    return false;
}
 

// *** NEW METHOD: Add helper point as regular vertex (not closing cycle) ***
 

// *** ENHANCED: Update your existing drawPolygons method to include cycle preview ***
// In drawing.js, replace the drawPolygons function with this enhanced version that includes edge labels
// In drawing.js, replace the drawPolygons function with this enhanced version that includes edge labels

drawPolygons() {
    const { ctx } = AppState;
    if (!ctx) return;

    // Save the current drawing state
    ctx.save();

    if (AppState.currentPolygonPoints.length > 0) {
        // Draw the main path lines
        if (AppState.currentPolygonPoints.length > 1) {
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(AppState.currentPolygonPoints[0].x, AppState.currentPolygonPoints[0].y);
            for (let i = 1; i < AppState.currentPolygonPoints.length; i++) {
                ctx.lineTo(AppState.currentPolygonPoints[i].x, AppState.currentPolygonPoints[i].y);
            }
            ctx.stroke();

            // *** ENHANCED: Draw distance labels on each edge with better styling ***
            for (let i = 1; i < AppState.currentPolygonPoints.length; i++) {
                const prevPoint = AppState.currentPolygonPoints[i - 1];
                const currentPoint = AppState.currentPolygonPoints[i];
                
                const dx = currentPoint.x - prevPoint.x;
                const dy = currentPoint.y - prevPoint.y;
                const distanceInPixels = Math.sqrt(dx * dx + dy * dy);
                const distanceInFeet = distanceInPixels / this.PIXELS_PER_FOOT;
                
                // Show labels for edges 1 foot or longer
                if (distanceInFeet >= 1) {
                    const midX = (prevPoint.x + currentPoint.x) / 2;
                    const midY = (prevPoint.y + currentPoint.y) / 2;
                    
                    // Calculate perpendicular offset for label positioning
                    const lineLength = Math.sqrt(dx * dx + dy * dy);
                    if (lineLength === 0) continue;
                    
                    const perpX = -dy / lineLength;
                    const perpY = dx / lineLength;
                    const offset = 20;
                    const labelX = midX + perpX * offset;
                    const labelY = midY + perpY * offset;
                    
                    // Enhanced label styling
                    const text = `${distanceInFeet.toFixed(1)}'`;
                    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const textMetrics = ctx.measureText(text);
                    const padding = 4;
                    
                    // Blue-tinted background - no border at all
                    ctx.fillStyle = 'rgba(52, 152, 219, 0.9)';
                    
                    const backgroundRect = {
                        x: labelX - textMetrics.width / 2 - padding,
                        y: labelY - 6 - padding,
                        width: textMetrics.width + padding * 2,
                        height: 12 + padding * 2
                    };
                    
                    // Simple filled rectangle - no stroke/border
                    ctx.fillRect(backgroundRect.x, backgroundRect.y, backgroundRect.width, backgroundRect.height);
                    
                    // White text for contrast
                    ctx.fillStyle = 'white';
                    ctx.fillText(text, labelX, labelY);
                }
            }
        }

        // *** ENHANCED: Draw preview lines to potential cycle closing points ***
        if (AppState.currentPolygonPoints.length >= 2) {
            this.drawCyclePreviewLines(ctx);
        }

        // *** ENHANCED: Draw vertices with higher z-index and better visibility ***
        AppState.currentPolygonPoints.forEach((point, index) => {
            const isFirstVertex = (index === 0);
            const isLastVertex = (index === AppState.currentPolygonPoints.length - 1);
            
            // Draw outer glow/shadow for better visibility
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            // Draw the main vertex circle with larger size for better visibility
            if (isFirstVertex) {
                ctx.fillStyle = '#e74c3c'; // Red for start
            } else if (isLastVertex) {
                ctx.fillStyle = '#27ae60'; // Green for end
            } else {
                ctx.fillStyle = '#3498db'; // Blue for intermediate
            }
            
            // Larger radius for better visibility (8px instead of 5px)
            ctx.beginPath();
            ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
            ctx.fill();
            
            // Thick white border for contrast
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
            
            // Draw point labels with better contrast and positioning
            ctx.save();
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // White text shadow for better readability
            ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            // Position label higher above the vertex
            ctx.fillText(point.name, point.x, point.y - 20);
            ctx.restore();
        });
    }

    // Restore the drawing state to what it was before this function ran
    ctx.restore();
}

// *** NEW METHOD: Draw preview lines showing potential cycle closures ***
drawCyclePreviewLines(ctx) {
    const currentPoints = AppState.currentPolygonPoints;
    if (currentPoints.length < 2) return;
    
    const lastPoint = currentPoints[currentPoints.length - 1];
    
    ctx.save();
    
    // Preview line to first vertex (traditional cycle closing)
    if (currentPoints.length >= 3) {
        const firstPoint = currentPoints[0];
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(firstPoint.x, firstPoint.y);
        ctx.stroke();
        
        const dx = firstPoint.x - lastPoint.x;
        const dy = firstPoint.y - lastPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const distanceInFeet = distance / this.PIXELS_PER_FOOT;
        
        if (distanceInFeet >= 1) {
            const midX = (lastPoint.x + firstPoint.x) / 2;
            const midY = (lastPoint.y + firstPoint.y) / 2;
            
            ctx.fillStyle = 'rgba(231, 76, 60, 0.8)';
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const text = `${distanceInFeet.toFixed(1)}'`;
            ctx.fillText(text, midX, midY - 8);
        }
    }
    
    // *** ENHANCED: Preview lines to permanent helper points with perimeter following ***
    if (AppState.permanentHelperPoints && AppState.permanentHelperPoints.length > 0) {
        const maxPreviewDistance = 150;
        
        AppState.permanentHelperPoints.forEach(permanentHelper => {
            const dx = permanentHelper.x - lastPoint.x;
            const dy = permanentHelper.y - lastPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= maxPreviewDistance && distance >= 20) {
                // Check if this permanent helper belongs to an area
                const areaInfo = this.findAreaContainingPoint(permanentHelper);
                
                if (areaInfo) {
                    // *** NEW: Draw perimeter following preview ***
                    const perimeterPath = this.getPerimeterPathToPoint(lastPoint, areaInfo);
                    
                    if (perimeterPath.length > 1) {
                        ctx.strokeStyle = 'rgba(52, 152, 219, 0.8)'; // More prominent blue
                        ctx.lineWidth = 3;
                        ctx.setLineDash([8, 4]);
                        
                        // Draw the perimeter following path
                        ctx.beginPath();
                        ctx.moveTo(lastPoint.x, lastPoint.y);
                        perimeterPath.forEach(point => {
                            ctx.lineTo(point.x, point.y);
                        });
                        ctx.stroke();
                        
                        // Add small dots along the perimeter path
                        ctx.fillStyle = 'rgba(52, 152, 219, 0.6)';
                        perimeterPath.forEach(point => {
                            ctx.beginPath();
                            ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
                            ctx.fill();
                        });
                        
                        // Label it as "following perimeter"
                        const midPoint = perimeterPath[Math.floor(perimeterPath.length / 2)];
                        ctx.fillStyle = 'rgba(52, 152, 219, 0.9)';
                        ctx.font = 'bold 9px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText('follow perimeter', midPoint.x, midPoint.y - 10);
                    }
                } else {
                    // *** ORIGINAL: Direct connection preview ***
                    ctx.strokeStyle = 'rgba(52, 152, 219, 0.6)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([12, 6]);
                    ctx.beginPath();
                    ctx.moveTo(lastPoint.x, lastPoint.y);
                    ctx.lineTo(permanentHelper.x, permanentHelper.y);
                    ctx.stroke();
                    
                    const distanceInFeet = distance / this.PIXELS_PER_FOOT;
                    if (distanceInFeet >= 1) {
                        const midX = (lastPoint.x + permanentHelper.x) / 2;
                        const midY = (lastPoint.y + permanentHelper.y) / 2;
                        
                        ctx.fillStyle = 'rgba(52, 152, 219, 0.8)';
                        ctx.font = 'bold 8px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        const text = `${distanceInFeet.toFixed(1)}'`;
                        ctx.fillText(text, midX, midY + 8);
                    }
                }
                
                // Highlight the permanent helper point
                ctx.fillStyle = 'rgba(52, 152, 219, 0.8)';
                ctx.beginPath();
                ctx.arc(permanentHelper.x, permanentHelper.y, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(permanentHelper.x, permanentHelper.y, 8, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
    }
    
    ctx.restore();
}
 // Replace the entire drawHelperPoints function in drawing.js with this one.
// In drawing.js, replace the drawHelperPoints function with this enhanced version

drawHelperPoints() {
    // Only draw any helper points if we are currently in drawing mode.
    if (AppState.currentMode !== 'drawing') {
        return; // Do nothing if not in drawing mode.
    }

    const { ctx } = AppState;
    if (!ctx) return;

    ctx.save();

    // *** FIRST: Draw permanent helper points (blue - from completed paths) ***
    // These are drawn BEHIND temporary helper points
    if (AppState.permanentHelperPoints && AppState.permanentHelperPoints.length > 0) {
        AppState.permanentHelperPoints.forEach(point => {
            ctx.save();
            
            // Add subtle shadow for depth
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            ctx.fillStyle = '#3498db'; // Blue color
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

    // *** SECOND: Draw temporary helper points (purple - from current drawing) ***
    // These are drawn ON TOP of permanent helper points for highest priority
    if (AppState.helperPoints && AppState.helperPoints.length > 0) {
        AppState.helperPoints.forEach(point => {
            ctx.save();
            
            // Enhanced shadow for maximum visibility
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            
            // Larger size and vibrant purple for maximum visibility
            ctx.fillStyle = '#9b59b6'; // More vibrant purple
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3; // Thicker border
            
            // Larger radius for better visibility (8px instead of 6px)
            ctx.beginPath();
            ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Add a subtle inner highlight for extra distinction
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        });
    }

    ctx.restore();
}

// In drawing.js, replace the setupEventListeners function with this enhanced version

// In drawing.js, replace the setupEventListeners function with this enhanced version

setupEventListeners() {
    // Listen for regular polygon drawing
    AppState.on('canvas:redraw:polygons', () => {
      this.drawHelperPoints(); // Draw helper points right after polygons
      this.drawPolygons();
    });
    
    // *** NEW: Listen for top-layer drawing overlay - ensures purple points are always on top ***
    AppState.on('canvas:redraw:drawing-overlay', () => {
      // Only draw the current drawing elements (vertices and helper points) on the top layer
      if (AppState.currentMode === 'drawing' && AppState.currentPolygonPoints.length > 0) {
        console.log('🔝 Drawing overlay: Rendering current drawing elements on top layer');
        
        const { ctx } = AppState;
        if (!ctx) return;
        
        ctx.save();
        
        // Draw ONLY the current drawing vertices with original styling but maximum visibility
        AppState.currentPolygonPoints.forEach((point, index) => {
            const isFirstVertex = (index === 0);
            const isLastVertex = (index === AppState.currentPolygonPoints.length - 1);
            
            // Original styling with just a subtle shadow for depth
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            // Color selection (original)
            if (isFirstVertex) {
                ctx.fillStyle = '#e74c3c'; // Red for start
            } else if (isLastVertex) {
                ctx.fillStyle = '#27ae60'; // Green for end
            } else {
                ctx.fillStyle = '#3498db'; // Blue for intermediate
            }
            
            // Original size circles (5px radius)
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Original white border
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
            
            // Original label styling
            ctx.fillStyle = '#2c3e50';
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(point.name, point.x, point.y - 15);
        });
        
        // Also draw helper points on the top layer
        //this.drawHelperPoints();
        
        ctx.restore();
      }
    });
    
    // Listen for mode changes
    AppState.on('mode:changed', (e) => {
      if (e.detail.mode === 'drawing') {
        this.activate();
      } else {
        this.deactivate();
      }
    });
}

  activate() {
    if (this.isActive) return;
    console.log('DrawingManager: Activating drawing mode');
    this.isActive = true;
    // Only wait for first vertex if no path exists
    this.waitingForFirstVertex = !AppState.currentPolygonPoints || AppState.currentPolygonPoints.length === 0;
    
    // Always clear sequences when activating to ensure clean state
    this.distanceInputSequence.length = 0;
    this.angleInputSequence.length = 0;
    
    this.showDrawingUI();
    this.setupAngleButton();
    this.setupNumericKeypad();
    this.setupDirectionalPad();
    this.setupArrowKeyListeners();
    const canvas = AppState.canvas;
    if (canvas) {
      canvas.addEventListener('click', this.boundHandleCanvasClick);
      canvas.addEventListener('touchend', this.boundHandleCanvasTouch);
    }
    AppState.emit('ui:drawing:activated');
  }

  deactivate() {
    if (!this.isActive) return;
    console.log('DrawingManager: Deactivating drawing mode');
    this.isActive = false;
    // Don't reset waitingForFirstVertex or clear the path - preserve it
    this.hideDrawingUI();
    this.removeAngleButton();
    this.removeNumericKeypad();
    this.removeDirectionalPad();
    this.removeArrowKeyListeners();
    const canvas = AppState.canvas;
    if (canvas) {
      canvas.removeEventListener('click', this.boundHandleCanvasClick);
      canvas.removeEventListener('touchend', this.boundHandleCanvasTouch);
    }
    AppState.emit('ui:drawing:deactivated');
  }

  handleCanvasClick(e) {
    if (!this.isActive) return;
    
    // Get the canvas element's bounding rect
    const canvas = AppState.canvas;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate the scale factor between display size and actual canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Convert click coordinates to canvas space
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    
    // Create a synthetic event with canvas coordinates
    const canvasEvent = {
      clientX: canvasX / scaleX + rect.left,
      clientY: canvasY / scaleY + rect.top
    };
    
    this.handleCanvasInteraction(canvasEvent);
  }

  handleCanvasTouch(e) {
    if (!this.isActive) return;
    e.preventDefault(); // Prevent default touch behavior
    if (e.changedTouches && e.changedTouches.length > 0) {
      // Use the first touch point
      const touch = e.changedTouches[0];
      
      // Get the canvas element's bounding rect
      const canvas = AppState.canvas;
      const rect = canvas.getBoundingClientRect();
      
      // Calculate the scale factor between display size and actual canvas size
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      // Convert touch coordinates to canvas space
      const canvasX = (touch.clientX - rect.left) * scaleX;
      const canvasY = (touch.clientY - rect.top) * scaleY;
      
      // Create a synthetic event with canvas coordinates
      const canvasEvent = {
        clientX: canvasX / scaleX + rect.left,
        clientY: canvasY / scaleY + rect.top
      };
      
      this.handleCanvasInteraction(canvasEvent);
    }
  }

// FIXED VERSION: Enhanced debugging and larger click radius for cycle detection
// FIXED VERSION: Prioritize vertex clicks over helper point clicks for cycle detection

// Replace the entire handleCanvasInteraction function in drawing.js with this one.
// Replace the entire handleCanvasInteraction function in drawing.js with this one.
handleCanvasInteraction(e) {
    if (!this.isActive) return;

    const viewport = document.getElementById('canvasViewport');
    const viewportRect = viewport.getBoundingClientRect();
    const canvasX = (e.clientX - viewportRect.left) - AppState.viewportTransform.x;
    const canvasY = (e.clientY - viewportRect.top) - AppState.viewportTransform.y;

    // Rule 1: If waiting for the first point, place it.
    if (this.waitingForFirstVertex) {
        this.placeFirstVertex(canvasX, canvasY);
        return;
    }

    // Rule 2: Check if clicking on a vertex of the CURRENT path.
    const clickedVertexIndex = this.findClickedVertex(canvasX, canvasY);
    if (clickedVertexIndex !== -1) {
        // If it's the FIRST vertex (and the path is long enough), it's a manual cycle close.
        if (clickedVertexIndex === 0 && AppState.currentPolygonPoints.length >= 3) {
            this.completeCycle(AppState.currentPolygonPoints);
        } else {
            // Otherwise, the user is editing the current path from that point.
            this.continueFromVertex(clickedVertexIndex);
        }
        return;
    }
    
    // Rule 3: Check if clicking on ANY helper point (from an old shape or a temporary one).
    // If so, just add it as a new vertex to the current path.
    const clickedPermanentHelper = this.findClickedPermanentHelper(canvasX, canvasY);
    if (clickedPermanentHelper) {
        this.addPermanentHelperAsVertex(clickedPermanentHelper);
        return;
    }
    
    const clickedHelperPoint = this.findClickedHelperPoint(canvasX, canvasY);
    if (clickedHelperPoint) {
        this.addHelperAsVertex(clickedHelperPoint);
        return;
    }
}

// *** NEW METHOD: Find clicked permanent helper point specifically ***
findClickedPermanentHelper(x, y) {
    if (!AppState.permanentHelperPoints) return null;
    
    const clickRadius = this.isMobileDevice() ? 30 : 20;
    
    for (const point of AppState.permanentHelperPoints) {
        const dx = x - point.x;
        const dy = y - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= clickRadius) {
            console.log('🔗 PERMANENT DEBUG: Found permanent helper at:', point);
            return point;
        }
    }
    return null;
}

 

// Draw crossing indicators (for debugging)
drawCrossingIndicators(ctx, path) {
    const crossings = this.hasPolygonCrossings(path);
    if (!crossings) return;
    
    ctx.save();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'red';
    
    crossings.forEach(crossing => {
        // Get the edges
        const p1 = path[crossing.edge1[0]];
        const p2 = path[crossing.edge1[1]];
        const p3 = path[crossing.edge2[0]];
        const p4 = path[crossing.edge2[1]];
        
        // Calculate intersection point
        const intersection = this.getIntersectionPoint(p1, p2, p3, p4);
        if (intersection) {
            // Draw a red circle at the intersection
            ctx.beginPath();
            ctx.arc(intersection.x, intersection.y, 8, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    
    ctx.restore();
}

 
// Helper to get exact intersection point
getIntersectionPoint(p1, p2, p3, p4) {
    const d1x = p2.x - p1.x;
    const d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x;
    const d2y = p4.y - p3.y;
    
    const det = d1x * d2y - d1y * d2x;
    if (Math.abs(det) < 1e-10) return null;
    
    const t1 = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / det;
    
    return {
        x: p1.x + t1 * d1x,
        y: p1.y + t1 * d1y
    };
}
// *** NEW METHOD: Complete cycle by connecting to permanent helper ***
 // Replace the existing completeCycle function in drawing.js with this one.
// Replace the entire completeCycle function in drawing.js with this one.
completeCycle(pathToComplete) {
    console.log('🎉 Cycle closed manually with', pathToComplete.length, 'points.');

    // Add vertices as permanent helpers for future snapping.
    this.addVerticesAsPermanentHelpers(pathToComplete);
    
    // Announce that the cycle is closed so the AreaManager can create the shape.
    AppState.emit('app:cycleClosed', { path: [...pathToComplete] });
    
    // Reset the drawing state for the next shape.
    AppState.currentPolygonPoints = [];
    this.waitingForFirstVertex = true;
    AppState.currentPolygonCounter = 0;
    
    HelperPointManager.updateHelperPoints();
    CanvasManager.redraw();
}

// *** NEW METHOD: Add permanent helper as regular vertex (not closing cycle) ***
 
// *** NEW METHOD: Add vertices from completed path as permanent helper points ***
addVerticesAsPermanentHelpers(completedPath) {
    console.log('🔗 HELPER DEBUG: Adding', completedPath.length, 'vertices as permanent helper points');
    
    // Initialize permanent helper points array if it doesn't exist
    if (!AppState.permanentHelperPoints) {
        AppState.permanentHelperPoints = [];
    }
    
    // Add each vertex from the completed path as a permanent helper point
    completedPath.forEach((vertex, index) => {
        const helperPoint = {
            x: vertex.x,
            y: vertex.y,
            source: 'completed_path', // Mark the source
            originalName: vertex.name, // Keep reference to original vertex name
            pathId: Date.now() // Unique ID for this completed path
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
  findClickedVertex(x, y) {
    if (!AppState.currentPolygonPoints) return -1;
    
    // INCREASED click radius for better detection - MAIN FIX
    const clickRadius = this.isMobileDevice() ? 50 : 25; // Increased from 30/15
    console.log('🔍 VERTEX DEBUG: Checking for vertex near world coordinates:', { x: x.toFixed(1), y: y.toFixed(1) });
    console.log('🎯 VERTEX DEBUG: Using click radius:', clickRadius);
    
    for (let i = 0; i < AppState.currentPolygonPoints.length; i++) {
      const point = AppState.currentPolygonPoints[i];
      
      // The stored points are in canvas world coordinates.
      // We are comparing them with the clicked world coordinates (x, y).
      const dx = x - point.x;
      const dy = y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      console.log(`🔎 VERTEX DEBUG: ${point.name} at (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) - distance: ${distance.toFixed(1)}px`);
      
      if (distance <= clickRadius) {
        console.log(`✅ VERTEX DEBUG: Found clicked vertex: ${point.name} (index ${i})`);
        return i;
      }
    }
    console.log('❌ VERTEX DEBUG: No vertex found within click radius');
    return -1;
  }

 continueFromVertex(vertexIndex) {
    console.log(`DrawingManager: Continuing from vertex ${AppState.currentPolygonPoints[vertexIndex].name}`);
    
    const isLastVertex = vertexIndex === AppState.currentPolygonPoints.length - 1;
    
    if (isLastVertex) {
      console.log('Continuing from last vertex - no vertices removed');
      AppState.currentPolygonCounter = vertexIndex + 1;
    } else {
      const removedVertices = AppState.currentPolygonPoints.splice(vertexIndex + 1);
      if (removedVertices.length > 0) {
        console.log(`Removed vertices: ${removedVertices.map(v => v.name).join(', ')}`);
      }
      AppState.currentPolygonCounter = vertexIndex + 1;
    }
    
    this.distanceInputSequence.length = 0;
    this.angleInputSequence.length = 0;
    
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    if (distanceInput) {
      distanceInput.value = '0';
      this.activeInput = 'distance';
      setTimeout(() => {
        distanceInput.focus();
        distanceInput.select();
      }, 50);
    }
    if (angleInput) {
      angleInput.value = '0';
    }
    
    // Update helper points before redrawing
    HelperPointManager.updateHelperPoints();

    CanvasManager.saveAction();
    CanvasManager.redraw();
    
    console.log(`Ready to continue drawing from ${AppState.currentPolygonPoints[vertexIndex].name}`);
  }

 placeFirstVertex(x, y) {
    console.log('DrawingManager: Placing first vertex at:', x, y);
    const firstPoint = {
      x: x,
      y: y,
      name: 'p0'
    };
    AppState.currentPolygonPoints = [firstPoint];
    AppState.currentPolygonCounter = 1;
    this.waitingForFirstVertex = false;

    // Update helper points before redrawing
    HelperPointManager.updateHelperPoints();

    CanvasManager.saveAction();
    CanvasManager.redraw();

    console.log('DrawingManager: First vertex p0 placed');
    const distanceInput = document.getElementById('distanceDisplay');
    if (distanceInput) {
      this.activeInput = 'distance';
      setTimeout(() => {
        distanceInput.focus();
        distanceInput.select();
        console.log('Distance input focused after placing p0');
      }, 100);
    }
  }

  showDrawingUI() {
    console.log('DrawingManager: Showing drawing UI elements');
    const drawPalette = document.getElementById('drawPalette');
    if (drawPalette) {
      drawPalette.classList.remove('hidden');
    }
    const distanceDisplay = document.getElementById('distanceDisplay');
    if (distanceDisplay) {
      if (this.isMobileDevice()) {
        distanceDisplay.setAttribute('inputmode', 'none');
        distanceDisplay.setAttribute('pattern', '[0-9]*');
        distanceDisplay.style.caretColor = 'transparent';
      }
      distanceDisplay.value = '0';
      // Remove any existing listeners first
      distanceDisplay.removeEventListener('click', this.boundHandleDistanceClick);
      distanceDisplay.removeEventListener('focus', this.boundHandleDistanceFocus);
      distanceDisplay.removeEventListener('keydown', this.boundHandleDistanceKeydown);
      // Add listeners
      distanceDisplay.addEventListener('click', this.boundHandleDistanceClick);
      distanceDisplay.addEventListener('focus', this.boundHandleDistanceFocus);
      distanceDisplay.addEventListener('keydown', this.boundHandleDistanceKeydown);
    }
    const angleDisplay = document.getElementById('angleDisplay');
    if (angleDisplay) {
      angleDisplay.classList.add('hidden'); // Make sure it's hidden by default
      if (this.isMobileDevice()) {
        angleDisplay.setAttribute('inputmode', 'none');
        angleDisplay.setAttribute('pattern', '[0-9]*');
        angleDisplay.style.caretColor = 'transparent';
      }
      angleDisplay.value = '0'; // Changed from '0.0' to '0'
      // Remove any existing listeners first
      angleDisplay.removeEventListener('click', this.boundHandleAngleInputClick);
      angleDisplay.removeEventListener('focus', this.boundHandleAngleFocus);
      angleDisplay.removeEventListener('keydown', this.boundHandleAngleKeydown);
      // Add listeners
      angleDisplay.addEventListener('click', this.boundHandleAngleInputClick);
      angleDisplay.addEventListener('focus', this.boundHandleAngleFocus);
      angleDisplay.addEventListener('keydown', this.boundHandleAngleKeydown);

      this.updateAngleUIColors();
    }
    const directionalPad = document.getElementById('directionalPad');
    if (directionalPad) {
      directionalPad.style.display = 'grid';
    }
    const numericKeypad = document.querySelector('.numeric-keypad');
    if (numericKeypad) {
      numericKeypad.style.display = 'grid';
    }
    const numbersBtn = document.getElementById('numbersBtn');
    if (numbersBtn) {
      numbersBtn.classList.add('active');
    }
    const paletteButtons = document.querySelectorAll('[data-palette]');
    paletteButtons.forEach(btn => {
      if (btn.id !== 'numbersBtn') {
        btn.classList.remove('active');
      }
    });
  }

  hideDrawingUI() {
    console.log('DrawingManager: Hiding drawing UI elements');
    const numbersBtn = document.getElementById('numbersBtn');
    if (numbersBtn) {
      numbersBtn.classList.remove('active');
    }
    const angleDisplay = document.getElementById('angleDisplay');
    if (angleDisplay) {
      angleDisplay.classList.add('hidden');
      // Remove listeners when hiding
      angleDisplay.removeEventListener('click', this.boundHandleAngleInputClick);
      angleDisplay.removeEventListener('focus', this.boundHandleAngleFocus);
      angleDisplay.removeEventListener('keydown', this.boundHandleAngleKeydown);
    }
    const distanceDisplay = document.getElementById('distanceDisplay');
    if (distanceDisplay) {
      // Remove listeners when hiding
      distanceDisplay.removeEventListener('click', this.boundHandleDistanceClick);
      distanceDisplay.removeEventListener('focus', this.boundHandleDistanceFocus);
      distanceDisplay.removeEventListener('keydown', this.boundHandleDistanceKeydown);
    }
  }

 // In drawing.js, replace the drawPolygons function with this enhanced version

// In drawing.js, replace the drawPolygons function with this enhanced version that includes edge labels

// In drawing.js, replace the drawPolygons function with this enhanced version that includes edge labels

drawPolygons() {
    const { ctx } = AppState;
    if (!ctx) return;

    // Save the current drawing state
    ctx.save();

    if (AppState.currentPolygonPoints.length > 0) {
        // Draw the main path lines
        if (AppState.currentPolygonPoints.length > 1) {
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(AppState.currentPolygonPoints[0].x, AppState.currentPolygonPoints[0].y);
            for (let i = 1; i < AppState.currentPolygonPoints.length; i++) {
                ctx.lineTo(AppState.currentPolygonPoints[i].x, AppState.currentPolygonPoints[i].y);
            }
            ctx.stroke();

            // *** ENHANCED: Draw distance labels on each edge with better styling ***
            for (let i = 1; i < AppState.currentPolygonPoints.length; i++) {
                const prevPoint = AppState.currentPolygonPoints[i - 1];
                const currentPoint = AppState.currentPolygonPoints[i];
                
                const dx = currentPoint.x - prevPoint.x;
                const dy = currentPoint.y - prevPoint.y;
                const distanceInPixels = Math.sqrt(dx * dx + dy * dy);
                const distanceInFeet = distanceInPixels / this.PIXELS_PER_FOOT;
                
                // Show labels for edges 1 foot or longer
                if (distanceInFeet >= 1) {
                    const midX = (prevPoint.x + currentPoint.x) / 2;
                    const midY = (prevPoint.y + currentPoint.y) / 2;
                    
                    // Calculate perpendicular offset for label positioning
                    const lineLength = Math.sqrt(dx * dx + dy * dy);
                    if (lineLength === 0) continue;
                    
                    const perpX = -dy / lineLength;
                    const perpY = dx / lineLength;
                    const offset = 20;
                    const labelX = midX + perpX * offset;
                    const labelY = midY + perpY * offset;
                    
                    // Enhanced label styling
                    const text = `${distanceInFeet.toFixed(1)}'`;
                    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const textMetrics = ctx.measureText(text);
                    const padding = 4;
                    
                    // Blue-tinted background - no border at all
                    ctx.fillStyle = 'rgba(52, 152, 219, 0.9)';
                    
                    const backgroundRect = {
                        x: labelX - textMetrics.width / 2 - padding,
                        y: labelY - 6 - padding,
                        width: textMetrics.width + padding * 2,
                        height: 12 + padding * 2
                    };
                    
                    // Simple filled rectangle - no stroke/border
                    ctx.fillRect(backgroundRect.x, backgroundRect.y, backgroundRect.width, backgroundRect.height);
                    
                    // White text for contrast
                    ctx.fillStyle = 'white';
                    ctx.fillText(text, labelX, labelY);
                }
            }
        }

        // *** ENHANCED: Draw preview lines to potential cycle closing points ***
        if (AppState.currentPolygonPoints.length >= 2) {
            this.drawCyclePreviewLines(ctx);
        }

        // *** ENHANCED: Draw vertices with higher z-index and better visibility ***
        AppState.currentPolygonPoints.forEach((point, index) => {
            const isFirstVertex = (index === 0);
            const isLastVertex = (index === AppState.currentPolygonPoints.length - 1);
            
            // Draw outer glow/shadow for better visibility
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            // Draw the main vertex circle with larger size for better visibility
            if (isFirstVertex) {
                ctx.fillStyle = '#e74c3c'; // Red for start
            } else if (isLastVertex) {
                ctx.fillStyle = '#27ae60'; // Green for end
            } else {
                ctx.fillStyle = '#3498db'; // Blue for intermediate
            }
            
            // Larger radius for better visibility (8px instead of 5px)
            ctx.beginPath();
            ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
            ctx.fill();
            
            // Thick white border for contrast
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
            
            // Draw point labels with better contrast and positioning
            ctx.save();
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // White text shadow for better readability
            ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            // Position label higher above the vertex
            ctx.fillText(point.name, point.x, point.y - 20);
            ctx.restore();
        });
    }

    // Restore the drawing state to what it was before this function ran
    ctx.restore();
}

  isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
  }

  updateAngleUIColors() {
    const angleDisplay = document.getElementById('angleDisplay');
    const angleBtn = document.getElementById('angle-btn');
    const cornerArrows = document.querySelectorAll('.dir-btn.up-left, .dir-btn.up-right, .dir-btn.down-left, .dir-btn.down-right');
    const orangeColor = '#FFB366';
    const blueColor = '#3498db';
    if (angleDisplay && !angleDisplay.classList.contains('hidden')) {
      if (angleBtn) {
        angleBtn.style.backgroundColor = orangeColor;
      }
      cornerArrows.forEach(arrow => {
        arrow.style.backgroundColor = orangeColor;
      });
    } else {
      if (angleBtn) {
        angleBtn.style.backgroundColor = '';
      }
      cornerArrows.forEach(arrow => {
        arrow.style.backgroundColor = blueColor;
      });
    }
  }

  setupAngleButton() {
    // The angle button is already handled by setupNumericKeypad()
    // No need for a separate listener here
    console.log('DrawingManager: Angle button setup skipped - handled by numeric keypad');
  }

  removeAngleButton() {
    // No separate listener to remove since it's handled by removeNumericKeypad()
    console.log('DrawingManager: Angle button removal skipped - handled by numeric keypad');
  }

  handleAngleButtonClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    console.log('handleAngleButtonClick called');
    const angleDisplay = document.getElementById('angleDisplay');
    if (angleDisplay) {
      console.log('Angle display found, current hidden state:', angleDisplay.classList.contains('hidden'));
      if (angleDisplay.classList.contains('hidden')) {
        angleDisplay.classList.remove('hidden');
        console.log('Angle display shown');
      } else {
        angleDisplay.classList.add('hidden');
        console.log('Angle display hidden');
      }
      this.updateAngleUIColors();
    } else {
      console.log('Angle display element not found!');
    }
  }

  setupNumericKeypad() {
    const keypadButtons = document.querySelectorAll('.key-btn');
    keypadButtons.forEach(button => {
      // Remove any existing listener first
      button.removeEventListener('click', this.boundHandleKeypadClick);
      button.addEventListener('click', this.boundHandleKeypadClick);
    });
  }

  removeNumericKeypad() {
    const keypadButtons = document.querySelectorAll('.key-btn');
    keypadButtons.forEach(button => {
      button.removeEventListener('click', this.boundHandleKeypadClick);
    });
  }

  handleKeypadClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const buttonText = e.target.textContent.trim();
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    let targetInput = null;
    
    // Determine which input and sequence to use
    if (this.activeInput === 'angle' && angleInput && !angleInput.classList.contains('hidden')) {
      targetInput = angleInput;
    } else {
      targetInput = distanceInput;
    }
    
    if (!targetInput) return;
    
    console.log('Keypad click:', buttonText, 'Active input:', this.activeInput);
    
    switch (buttonText) {
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        // Work directly with the appropriate sequence
        if (this.activeInput === 'angle' && angleInput && !angleInput.classList.contains('hidden')) {
          // Check if we need to start fresh
          if (targetInput.value === '0') {
            this.angleInputSequence.length = 0;
          }
          
          this.angleInputSequence.push(parseInt(buttonText));
          // For angle: just concatenate the digits as a whole number
          let angleNumber = 0;
          for (let i = 0; i < this.angleInputSequence.length; i++) {
            angleNumber = angleNumber * 10 + this.angleInputSequence[i];
          }
          targetInput.value = angleNumber.toString();
          console.log('Updated angle sequence:', this.angleInputSequence, 'Display value:', targetInput.value);
        } else {
          // Check if we need to start fresh
          if (targetInput.value === '0' || targetInput.value === '0.0') {
            this.distanceInputSequence.length = 0;
          }
          
          this.distanceInputSequence.push(parseInt(buttonText));
          let number = 0;
          for (let i = 0; i < this.distanceInputSequence.length; i++) {
            number = number * 10 + this.distanceInputSequence[i];
          }
          number = number / 10;
          targetInput.value = number.toFixed(1);
          console.log('Updated distance sequence:', this.distanceInputSequence, 'Display value:', targetInput.value);
        }
        break;
      case 'del':
        if (this.activeInput === 'angle' && angleInput && !angleInput.classList.contains('hidden')) {
          this.angleInputSequence.pop();
          if (this.angleInputSequence.length === 0) {
            targetInput.value = '0';
          } else {
            let angleNumber = 0;
            for (let i = 0; i < this.angleInputSequence.length; i++) {
              angleNumber = angleNumber * 10 + this.angleInputSequence[i];
            }
            targetInput.value = angleNumber.toString();
          }
        } else {
          this.distanceInputSequence.pop();
          if (this.distanceInputSequence.length === 0) {
            targetInput.value = '0';
          } else {
            let number = 0;
            for (let i = 0; i < this.distanceInputSequence.length; i++) {
              number = number * 10 + this.distanceInputSequence[i];
            }
            number = number / 10;
            targetInput.value = number.toFixed(1);
          }
        }
        break;
      case 'clear':
        if (this.activeInput === 'angle' && angleInput && !angleInput.classList.contains('hidden')) {
          this.angleInputSequence.length = 0;
          targetInput.value = '0';
        } else {
          this.distanceInputSequence.length = 0;
          targetInput.value = '0';
        }
        break;
      case 'angle':
        console.log('Angle button clicked');
        this.handleAngleButtonClick(e);
        if (angleInput && !angleInput.classList.contains('hidden')) {
          this.activeInput = 'angle';
          angleInput.value = '0'; // Changed from '0.0' to '0'
          angleInput.focus();
        }
        break;
      case 'cls':
        break;
    }
  }

  setupDirectionalPad() {
    const directionButtons = document.querySelectorAll('.dir-btn');
    directionButtons.forEach(button => {
      // Remove any existing listener first
      button.removeEventListener('click', this.boundHandleDirectionClick);
      button.addEventListener('click', this.boundHandleDirectionClick);
    });
  }

  removeDirectionalPad() {
    const directionButtons = document.querySelectorAll('.dir-btn');
    directionButtons.forEach(button => {
      button.removeEventListener('click', this.boundHandleDirectionClick);
    });
  }

 handleDirectionClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const button = e.target;
    if (button.classList.contains('center')) return;
    const angleInput = document.getElementById('angleDisplay');
    if (!angleInput) return;
    
    const currentAngleValue = parseFloat(angleInput.value);
    // Determine if a custom angle was in the input before the click
    const isCustomAngle = currentAngleValue !== 0 && !Object.values(this.directionAngles).includes(currentAngleValue);
    
    let finalAngle = currentAngleValue;
    
    if (isCustomAngle) {
      console.log('DEBUG: Custom angle detected:', currentAngleValue);
      // Apply custom angle transformations based on quadrant clicked
      if (button.classList.contains('up-right')) {
        finalAngle = currentAngleValue; // θ = a
        console.log('DEBUG: Upper right clicked, using angle:', finalAngle);
      } else if (button.classList.contains('down-right')) {
        finalAngle = -currentAngleValue; // θ = -a
        console.log('DEBUG: Lower right clicked, using angle:', finalAngle);
      } else if (button.classList.contains('up-left')) {
        finalAngle = 180 - currentAngleValue; // θ = 180-a
        console.log('DEBUG: Upper left clicked, using angle:', finalAngle);
      } else if (button.classList.contains('down-left')) {
        finalAngle = 180 + currentAngleValue; // θ = 180+a
        console.log('DEBUG: Lower left clicked, using angle:', finalAngle);
      } else {
        // For cardinal directions (up, down, left, right), use the custom angle as-is
        console.log('DEBUG: Cardinal direction clicked, using custom angle as-is:', finalAngle);
      }
      
      // Normalize angle to 0-360 range
      finalAngle = ((finalAngle % 360) + 360) % 360;
      console.log('DEBUG: Final normalized angle:', finalAngle);
      
    } else {
      // Use the directional preset angle
      for (const [className, angle] of Object.entries(this.directionAngles)) {
        if (button.classList.contains(className)) {
          finalAngle = angle;
          angleInput.value = angle;
          this.activeInput = 'angle';
          angleInput.focus();
          console.log('Direction clicked:', className, 'preset angle:', angle);
          break;
        }
      }
    }
    
    // Place the vertex with the calculated angle
    this.placeVertexWithAngle(finalAngle);
    
    // If a custom angle was used to place the point, simulate a click on the angle
    // button to hide the input field for the next action.
    if (isCustomAngle) {
        console.log('Custom angle used; hiding angle input field post-placement.');
        this.handleAngleButtonClick();
    }
  }
  
  placeVertexWithAngle(angleDegrees) {
    const distanceInput = document.getElementById('distanceDisplay');
    if (!distanceInput) return;
    
    const distance = parseFloat(distanceInput.value);
    if (isNaN(distance) || distance <= 0) {
      console.log('Invalid distance:', distance);
      return;
    }
    
    console.log('Placing vertex with distance:', distance, 'angle:', angleDegrees);
    this.placeNextVertex(distance, angleDegrees);
  }

  setupArrowKeyListeners() {
    // Remove any existing listener first
    document.removeEventListener('keydown', this.boundHandleArrowKey);
    document.addEventListener('keydown', this.boundHandleArrowKey);
    console.log('DrawingManager: Arrow key listeners set up');
  }

  removeArrowKeyListeners() {
    document.removeEventListener('keydown', this.boundHandleArrowKey);
    console.log('DrawingManager: Arrow key listeners removed');
  }

  handleArrowKey(event) {
    if (!this.isActive) return;
    const angleInput = document.getElementById('angleDisplay');
    if (!angleInput) return;
    let angle;
    switch (event.key) {
      case 'ArrowRight':
        angle = 0;
        break;
      case 'ArrowUp':
        angle = 90;
        break;
      case 'ArrowLeft':
        angle = 180;
        break;
      case 'ArrowDown':
        angle = 270;
        break;
      default:
        return;
    }
    event.preventDefault();
    angleInput.value = angle;
    this.activeInput = 'angle';
    angleInput.focus();
    console.log('Arrow key pressed:', event.key, 'angle:', angle);
    this.checkAndPlaceNextPoint();
  }

 checkAndPlaceNextPoint() {
    if (this.waitingForFirstVertex || AppState.currentPolygonPoints.length === 0) return;
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    if (!distanceInput || !angleInput) return;
    const distance = parseFloat(distanceInput.value);
    const angle = parseFloat(angleInput.value);
    if (isNaN(distance) || distance <= 0) {
      console.log('Invalid distance:', distance);
      return;
    }
    if (isNaN(angle)) {
      console.log('Invalid angle:', angle);
      return;
    }

    // Determine if the angle entered via keyboard is a "custom" one
    const isCustomAngle = angleInput && !angleInput.classList.contains('hidden') && angle !== 0 && !Object.values(this.directionAngles).includes(angle);

    console.log('Placing next point with distance:', distance, 'angle:', angle);
    this.placeNextVertex(distance, angle);

    // If a custom angle was used, hide the input field for the next action.
    if (isCustomAngle) {
        console.log('Custom angle used via Enter; hiding angle input field post-placement.');
        this.handleAngleButtonClick();
    }
  }

 
 // In drawing.js, replace the findClickedHelperPoint function with this enhanced version

findClickedHelperPoint(x, y) {
    const clickRadius = this.isMobileDevice() ? 30 : 20;
    let closestHelper = null;
    let closestDistance = Infinity;
    
    // Check temporary helper points first (from current drawing)
    if (AppState.helperPoints) {
        for (const point of AppState.helperPoints) {
            const dx = x - point.x;
            const dy = y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= clickRadius && distance < closestDistance) {
                closestHelper = point;
                closestDistance = distance;
            }
        }
    }
    
    // *** ENHANCED: Check permanent helper points (from completed paths) ***
    if (AppState.permanentHelperPoints) {
        for (const point of AppState.permanentHelperPoints) {
            const dx = x - point.x;
            const dy = y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= clickRadius && distance < closestDistance) {
                closestHelper = point;
                closestDistance = distance;
            }
        }
    }
    
    if (closestHelper) {
        console.log('🟣 HELPER DEBUG: Found closest helper point at:', closestHelper, 'distance:', closestDistance.toFixed(1));
        return closestHelper;
    }
    
    return null;
}

// *** ENHANCED: Update addHelperAsVertex to ensure EXACT positioning ***
addHelperAsVertex(helperPoint) {
    console.log('🟣 HELPER DEBUG: Adding helper point as vertex with EXACT positioning');
    
    const newPoint = {
        x: helperPoint.x, // Use EXACT coordinates from helper point
        y: helperPoint.y, // Use EXACT coordinates from helper point
        name: `p${AppState.currentPolygonCounter}`,
        snappedToHelper: true // Mark that this was snapped
    };

    AppState.currentPolygonPoints.push(newPoint);
    AppState.currentPolygonCounter++;
    
    console.log(`🎯 SNAP: Added vertex ${newPoint.name} at EXACT position (${newPoint.x}, ${newPoint.y})`);
    
    // Clear input fields
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    if (distanceInput) distanceInput.value = '0';
    if (angleInput) angleInput.value = '0';
    this.distanceInputSequence.length = 0;
    this.angleInputSequence.length = 0;
    this.activeInput = 'distance';
    if (distanceInput) distanceInput.focus();

    HelperPointManager.updateHelperPoints();
    CanvasManager.saveAction();
    CanvasManager.redraw();
}

// *** ENHANCED: Update addPermanentHelperAsVertex for exact positioning ***
addPermanentHelperAsVertex(permanentHelper) {
    console.log('🔗 VERTEX DEBUG: Adding permanent helper as regular vertex with EXACT positioning');
    
    const newPoint = {
        x: permanentHelper.x, // Use EXACT coordinates
        y: permanentHelper.y, // Use EXACT coordinates
        name: `p${AppState.currentPolygonCounter}`,
        fromPermanentHelper: true,
        snappedToHelper: true // Mark as snapped
    };

    AppState.currentPolygonPoints.push(newPoint);
    AppState.currentPolygonCounter++;
    
    console.log(`🎯 SNAP: Added vertex ${newPoint.name} at EXACT position (${newPoint.x}, ${newPoint.y}) from permanent helper`);
    
    // Clear input fields
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    if (distanceInput) distanceInput.value = '0';
    if (angleInput) angleInput.value = '0';
    this.distanceInputSequence.length = 0;
    this.angleInputSequence.length = 0;
    this.activeInput = 'distance';
    if (distanceInput) distanceInput.focus();

    HelperPointManager.updateHelperPoints();
    CanvasManager.saveAction();
    CanvasManager.redraw();
}

// *** NEW: Enhanced placeFirstVertex with helper point snapping ***
placeFirstVertex(x, y) {
    console.log('DrawingManager: Placing first vertex at:', x, y);
    
    // Check if we're close to any existing helper points for snapping
    const nearbyHelper = this.findClickedHelperPoint(x, y);
    let finalX = x;
    let finalY = y;
    
    if (nearbyHelper) {
        finalX = nearbyHelper.x;
        finalY = nearbyHelper.y;
        console.log('🎯 SNAP: First vertex snapped to helper point at:', finalX, finalY);
    }
    
    const firstPoint = {
        x: finalX,
        y: finalY,
        name: 'p0',
        snappedToHelper: !!nearbyHelper
    };
    
    AppState.currentPolygonPoints = [firstPoint];
    AppState.currentPolygonCounter = 1;
    this.waitingForFirstVertex = false;

    // Update helper points before redrawing
    HelperPointManager.updateHelperPoints();

    CanvasManager.saveAction();
    CanvasManager.redraw();

    console.log('DrawingManager: First vertex p0 placed');
    const distanceInput = document.getElementById('distanceDisplay');
    if (distanceInput) {
        this.activeInput = 'distance';
        setTimeout(() => {
            distanceInput.focus();
            distanceInput.select();
            console.log('Distance input focused after placing p0');
        }, 100);
    }
}

// *** ENHANCED: Update placeNextVertex with better snapping detection ***
placeNextVertex(distance, angleDegrees) {
    console.log('DEBUG: placeNextVertex called with angle =', angleDegrees, 'degrees');
    const currentPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1];
    const distanceInPixels = distance * this.PIXELS_PER_FOOT;
    const angleRadians = angleDegrees * (Math.PI / 180);
    const calculatedX = currentPoint.x + distanceInPixels * Math.cos(angleRadians);
    const calculatedY = currentPoint.y - distanceInPixels * Math.sin(angleRadians);
    
    // *** NEW: Check for helper point snapping at calculated position ***
    const snapRadius = 15; // Slightly larger snap radius for calculated positions
    const nearbyHelper = this.findNearbyHelper(calculatedX, calculatedY, snapRadius);
    
    let finalX = calculatedX;
    let finalY = calculatedY;
    
    if (nearbyHelper) {
        finalX = nearbyHelper.x;
        finalY = nearbyHelper.y;
        console.log('🎯 SNAP: Calculated vertex snapped to helper point!', 
                   `Original: (${calculatedX.toFixed(1)}, ${calculatedY.toFixed(1)})`, 
                   `Snapped: (${finalX}, ${finalY})`);
    }
    
    console.log('DEBUG: Final position =', {x: finalX, y: finalY});
    
    const newPoint = {
        x: finalX,
        y: finalY,
        name: `p${AppState.currentPolygonCounter}`,
        snappedToHelper: !!nearbyHelper
    };

    // Check for line extension logic
    if (AppState.currentPolygonPoints.length >= 2) {
        console.log('DEBUG: Checking for line extension');
        const prevPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 2];
        const lastPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1];
        const prevDx = lastPoint.x - prevPoint.x;
        const prevDy = lastPoint.y - prevPoint.y;
        const prevAngleRadians = Math.atan2(-prevDy, prevDx);
        const prevAngleDegrees = (prevAngleRadians * 180 / Math.PI + 360) % 360;
        const currentAngleDegrees = (angleDegrees + 360) % 360;
        const angleDifference = Math.abs(currentAngleDegrees - prevAngleDegrees);
        const normalizedDifference = Math.min(angleDifference, 360 - angleDifference);
        const isSameDirection = normalizedDifference < 1;
        
        if (isSameDirection) {
            console.log(`Same direction detected! Removing intermediate vertex ${lastPoint.name}`);
            AppState.currentPolygonPoints.pop();
            AppState.currentPolygonCounter--;
            newPoint.name = lastPoint.name;
            console.log(`Extended line from ${prevPoint.name} directly to ${newPoint.name}`);
        }
    }

    AppState.currentPolygonPoints.push(newPoint);
    AppState.currentPolygonCounter++;
    console.log(`Placed ${newPoint.name} at (${finalX.toFixed(1)}, ${finalY.toFixed(1)})`);
    
    this.autoPanToPoint(finalX, finalY);
    
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    if (distanceInput) distanceInput.value = '0';
    if (angleInput) angleInput.value = '0';
    
    this.distanceInputSequence.length = 0;
    this.angleInputSequence.length = 0;
    
    this.activeInput = 'distance';
    if (distanceInput) distanceInput.focus();
    
    // Update helper points before redrawing
    HelperPointManager.updateHelperPoints();
    
    CanvasManager.saveAction();
    CanvasManager.redraw();
}

// *** NEW: Helper function to find nearby helpers for auto-snapping ***
findNearbyHelper(x, y, radius = 15) {
    let closestHelper = null;
    let closestDistance = Infinity;
    
    // Check temporary helper points
    if (AppState.helperPoints) {
        for (const point of AppState.helperPoints) {
            const dx = x - point.x;
            const dy = y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= radius && distance < closestDistance) {
                closestHelper = point;
                closestDistance = distance;
            }
        }
    }
    
    // Check permanent helper points
    if (AppState.permanentHelperPoints) {
        for (const point of AppState.permanentHelperPoints) {
            const dx = x - point.x;
            const dy = y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= radius && distance < closestDistance) {
                closestHelper = point;
                closestDistance = distance;
            }
        }
    }
    
    return closestHelper;
}

  autoPanToPoint(x, y) {
    const viewport = document.getElementById('canvasViewport');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const viewportWidth = rect.width;
    const viewportHeight = rect.height;
    const screenX = x + AppState.viewportTransform.x;
    const screenY = y + AppState.viewportTransform.y;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    const margin = 100;
    const isOffScreen = screenX < margin || screenX > viewportWidth - margin || 
                       screenY < margin || screenY > viewportHeight - margin;
    if (isOffScreen) {
      const targetTransformX = centerX - x;
      const targetTransformY = centerY - y;
      const dx = targetTransformX - AppState.viewportTransform.x;
      const dy = targetTransformY - AppState.viewportTransform.y;
      const steps = 20;
      let step = 0;
      const animate = () => {
        step++;
        const progress = step / steps;
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        AppState.viewportTransform.x += dx * easeProgress / steps;
        AppState.viewportTransform.y += dy * easeProgress / steps;
        CanvasManager.updateViewportTransform();
        CanvasManager.redraw();
        if (step < steps) {
          requestAnimationFrame(animate);
        }
      };
      animate();
      console.log('Auto-panning to keep point in view');
    }
  }


findAreaContainingPoint(permanentHelper) {
    if (!AppState.drawnPolygons || !permanentHelper) return null;
    
    for (const area of AppState.drawnPolygons) {
        // Check if this permanent helper point is one of the vertices of this area
        const matchingVertex = area.path.find(vertex => 
            Math.abs(vertex.x - permanentHelper.x) < 2 && 
            Math.abs(vertex.y - permanentHelper.y) < 2
        );
        
        if (matchingVertex) {
            console.log('🔍 PERIMETER DEBUG: Found permanent helper belongs to area:', area.label);
            return {
                area: area,
                vertexIndex: area.path.indexOf(matchingVertex)
            };
        }
    }
    return null;
}


// *** NEW METHOD: Get the path following an area's perimeter ***
getPerimeterPathToPoint(fromPoint, toPointInfo, direction = 'shortest') {
    const area = toPointInfo.area;
    const targetVertexIndex = toPointInfo.vertexIndex;
    
    console.log('🔄 PERIMETER DEBUG: Getting perimeter path to vertex', targetVertexIndex, 'of area:', area.label);
    
    // We need to find where our current path intersects with this area's perimeter
    // For now, let's find the closest vertex on the area to our fromPoint
    let closestVertexIndex = 0;
    let closestDistance = Infinity;
    
    area.path.forEach((vertex, index) => {
        const dx = vertex.x - fromPoint.x;
        const dy = vertex.y - fromPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < closestDistance) {
            closestDistance = distance;
            closestVertexIndex = index;
        }
    });
    
    console.log('🔄 PERIMETER DEBUG: Closest vertex to current position is index:', closestVertexIndex);
    
    // Get the path along the perimeter from closest vertex to target vertex
    const perimeterPath = [];
    const pathLength = area.path.length;
    
    // Determine direction (clockwise or counterclockwise) - for now use shortest path
    const clockwiseDistance = (targetVertexIndex - closestVertexIndex + pathLength) % pathLength;
    const counterClockwiseDistance = (closestVertexIndex - targetVertexIndex + pathLength) % pathLength;
    
    const useClockwise = clockwiseDistance <= counterClockwiseDistance;
    
    console.log('🔄 PERIMETER DEBUG: Clockwise distance:', clockwiseDistance, 'Counter-clockwise:', counterClockwiseDistance, 'Using clockwise:', useClockwise);
    
    if (useClockwise) {
        // Go clockwise
        for (let i = closestVertexIndex; i !== targetVertexIndex; i = (i + 1) % pathLength) {
            perimeterPath.push({
                x: area.path[i].x,
                y: area.path[i].y,
                name: `follow_${i}`,
                followingPerimeter: true
            });
        }
    } else {
        // Go counter-clockwise
        for (let i = closestVertexIndex; i !== targetVertexIndex; i = (i - 1 + pathLength) % pathLength) {
            perimeterPath.push({
                x: area.path[i].x,
                y: area.path[i].y,
                name: `follow_${i}`,
                followingPerimeter: true
            });
        }
    }
    
    // Add the target vertex
    perimeterPath.push({
        x: area.path[targetVertexIndex].x,
        y: area.path[targetVertexIndex].y,
        name: `target_${targetVertexIndex}`,
        followingPerimeter: true
    });
    
    console.log('🔄 PERIMETER DEBUG: Generated perimeter path with', perimeterPath.length, 'points');
    return perimeterPath;
}
  handleDecimalInput(event, fieldType) {
    const input = event.target;
    const key = event.key;
    
    console.log('Input handler:', key, 'Field:', fieldType);
    
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      
      if (fieldType === 'distance') {
        // Check if we need to start fresh
        if (input.value === '0' || input.value === '0.0') {
          this.distanceInputSequence.length = 0;
        }
        
        this.distanceInputSequence.push(parseInt(key));
        let number = 0;
        for (let i = 0; i < this.distanceInputSequence.length; i++) {
          number = number * 10 + this.distanceInputSequence[i];
        }
        number = number / 10;
        input.value = number.toFixed(1);
        console.log('Updated distance sequence:', this.distanceInputSequence, 'Display value:', input.value);
      } else {
        // Angle input - whole numbers only
        if (input.value === '0') {
          this.angleInputSequence.length = 0;
        }
        
        this.angleInputSequence.push(parseInt(key));
        let angleNumber = 0;
        for (let i = 0; i < this.angleInputSequence.length; i++) {
          angleNumber = angleNumber * 10 + this.angleInputSequence[i];
        }
        input.value = angleNumber.toString();
        console.log('Updated angle sequence:', this.angleInputSequence, 'Display value:', input.value);
      }
    } else if (key === 'Backspace') {
      event.preventDefault();
      if (fieldType === 'distance') {
        this.distanceInputSequence.pop();
        if (this.distanceInputSequence.length === 0) {
          input.value = '0';
        } else {
          let number = 0;
          for (let i = 0; i < this.distanceInputSequence.length; i++) {
            number = number * 10 + this.distanceInputSequence[i];
          }
          number = number / 10;
          input.value = number.toFixed(1);
        }
      } else {
        // Angle input - whole numbers only
        this.angleInputSequence.pop();
        if (this.angleInputSequence.length === 0) {
          input.value = '0';
        } else {
          let angleNumber = 0;
          for (let i = 0; i < this.angleInputSequence.length; i++) {
            angleNumber = angleNumber * 10 + this.angleInputSequence[i];
          }
          input.value = angleNumber.toString();
        }
      }
    } else if (key === 'Enter') {
      event.preventDefault();
      this.checkAndPlaceNextPoint();
    }
  }
}