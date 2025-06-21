import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { HelperPointManager } from './helpers.js';


let splitMode = false;
let splitSourcePolygon = null;
let splitIntersectionPoints = [];
let splitSourceVertex = null;



// *** STEP 3: Add the working startSplitMode function ***
function startSplitMode(polygon, vertex) {
    console.log('🔪 SPLIT: Starting split mode');
    splitMode = true;
    splitSourcePolygon = polygon;
    splitSourceVertex = vertex;
    
    // Convert to your current drawing system
    AppState.currentPolygonPoints = [{
        x: vertex.x,
        y: vertex.y,
        name: 'p0'
    }];
    AppState.currentPolygonCounter = 1;
    this.waitingForFirstVertex = false;
    
    // Switch to drawing mode for path creation
    AppState.currentMode = 'drawing';
    AppState.emit('mode:changed', { mode: 'drawing' });
    
    // Calculate initial intersection points
    updateSplitIntersectionPoints();
    
    // Update UI
    const modeIndicator = document.getElementById('modeIndicator');
    if (modeIndicator) {
        modeIndicator.textContent = 'SPLIT MODE';
        modeIndicator.style.background = '#e74c3c';
    }
    
    CanvasManager.redraw();
    console.log('🔪 SPLIT: Split mode activated');
}

// *** STEP 4: Add the working updateSplitIntersectionPoints function ***
function updateSplitIntersectionPoints() {
    if (!splitMode || !splitSourcePolygon) return;
    
    splitIntersectionPoints = [];
    const tolerance = 0.01;
    const currentX = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1]?.x || 0;
    const currentY = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1]?.y || 0;
    
    // Check if current position is inside the polygon
    const isInside = this.isPointInPolygon({ x: currentX, y: currentY }, splitSourcePolygon.path || splitSourcePolygon.lines);
    if (!isInside) {
        console.log('Current position is outside polygon');
        return;
    }
    
    // Get all edges of the polygon
    const edges = [];
    const polygonPath = splitSourcePolygon.path || splitSourcePolygon.lines;
    polygonPath.forEach((line, index) => {
        const start = line.start || line;
        const end = line.end || polygonPath[(index + 1) % polygonPath.length];
        edges.push({
            start: start,
            end: end,
            index: index
        });
    });
    
    // Find intersections with horizontal line through current position
    const horizontalLineStart = { x: currentX - 1000, y: currentY };
    const horizontalLineEnd = { x: currentX + 1000, y: currentY };
    
    edges.forEach(edge => {
        const intersection = getLineIntersection(
            horizontalLineStart, horizontalLineEnd,
            edge.start, edge.end
        );
        
        if (intersection && Math.abs(intersection.x - currentX) > tolerance) {
            splitIntersectionPoints.push({
                x: intersection.x,
                y: intersection.y,
                type: 'horizontal',
                edge: edge
            });
        }
    });
    
    // Find intersections with vertical line through current position
    const verticalLineStart = { x: currentX, y: currentY - 1000 };
    const verticalLineEnd = { x: currentX, y: currentY + 1000 };
    
    edges.forEach(edge => {
        const intersection = getLineIntersection(
            verticalLineStart, verticalLineEnd,
            edge.start, edge.end
        );
        
        if (intersection && Math.abs(intersection.y - currentY) > tolerance) {
            splitIntersectionPoints.push({
                x: intersection.x,
                y: intersection.y,
                type: 'vertical',
                edge: edge
            });
        }
    });
    
    // Remove duplicates
    splitIntersectionPoints = splitIntersectionPoints.filter((point, index, self) =>
        index === self.findIndex(p => 
            Math.abs(p.x - point.x) < tolerance && Math.abs(p.y - point.y) < tolerance
        )
    );
    
    console.log('Found', splitIntersectionPoints.length, 'split intersection points');
}

// *** STEP 5: Add the working handleSplitPointClick function ***
function handleSplitPointClick(splitPoint) {
    if (!splitMode || !splitSourcePolygon || !splitSourceVertex) return;
    
    console.log('🔪 SPLIT: Executing split from vertex to point', splitPoint);
    
    // Perform the split using the working algorithm from core.js
    const newPolygons = performPerimeterSplit(splitSourcePolygon, splitSourceVertex, splitPoint);
    
    if (newPolygons && newPolygons.length === 2) {
        // Remove original polygon
        const polygonIndex = AppState.drawnPolygons.findIndex(p => p.id === splitSourcePolygon.id);
        if (polygonIndex !== -1) {
            AppState.drawnPolygons.splice(polygonIndex, 1);
            
            // Add new polygons with proper naming
            const baseName = splitSourcePolygon.label;
            newPolygons[0].label = baseName + 'A';
            newPolygons[1].label = baseName + 'B';
            
            AppState.drawnPolygons.push(...newPolygons);
            
            // Exit split mode
            exitSplitMode();
            
            // Update legend and redraw
            CanvasManager.saveAction();
            CanvasManager.redraw();
            console.log('✅ SPLIT: Polygon split completed successfully');
        }
    } else {
        console.error('🔪 SPLIT: Failed to create new polygons');
    }
}

// *** STEP 6: Add the working performPerimeterSplit function ***
function performPerimeterSplit(polygon, startVertex, endPoint) {
    const tolerance = 0.01;
    
    console.log('🔪 SPLIT: Performing perimeter split');
    console.log('Original polygon:', polygon.label, 'vertices:', polygon.path?.length || polygon.lines?.length);
    
    // Get the polygon path
    const originalPath = polygon.path || polygon.lines;
    if (!originalPath || originalPath.length < 3) {
        console.error('Invalid polygon path');
        return null;
    }
    
    // Convert lines to vertices if needed
    const originalVertices = [];
    if (polygon.lines) {
        // Convert from lines format
        polygon.lines.forEach(line => {
            originalVertices.push({
                x: line.start.x,
                y: line.start.y
            });
        });
    } else {
        // Already in vertex format
        originalVertices.push(...originalPath);
    }
    
    // Find start vertex index
    let startVertexIndex = -1;
    for (let i = 0; i < originalVertices.length; i++) {
        if (Math.abs(originalVertices[i].x - startVertex.x) < tolerance && 
            Math.abs(originalVertices[i].y - startVertex.y) < tolerance) {
            startVertexIndex = i;
            break;
        }
    }
    
    if (startVertexIndex === -1) {
        console.error('Could not find start vertex');
        return null;
    }
    
    // Find end point on polygon boundary
    let endVertexIndex = -1;
    for (let i = 0; i < originalVertices.length; i++) {
        if (Math.abs(originalVertices[i].x - endPoint.x) < tolerance && 
            Math.abs(originalVertices[i].y - endPoint.y) < tolerance) {
            endVertexIndex = i;
            break;
        }
    }
    
    if (endVertexIndex === -1) {
        console.error('Could not find end vertex');
        return null;
    }
    
    // Create the two split polygons
    const polygon1Vertices = [];
    const polygon2Vertices = [];
    
    // Add the drawn path to the splitting
    const drawnPath = AppState.currentPolygonPoints || [];
    
    // Build first polygon: start -> end (forward) + drawn path (reverse)
    let currentIndex = startVertexIndex;
    while (currentIndex !== endVertexIndex) {
        polygon1Vertices.push({
            x: originalVertices[currentIndex].x,
            y: originalVertices[currentIndex].y
        });
        currentIndex = (currentIndex + 1) % originalVertices.length;
    }
    polygon1Vertices.push({
        x: originalVertices[endVertexIndex].x,
        y: originalVertices[endVertexIndex].y
    });
    
    // Add drawn path in reverse (excluding endpoints)
    for (let i = drawnPath.length - 2; i > 0; i--) {
        polygon1Vertices.push({
            x: drawnPath[i].x,
            y: drawnPath[i].y
        });
    }
    
    // Build second polygon: end -> start (forward) + drawn path (forward)
    currentIndex = endVertexIndex;
    while (currentIndex !== startVertexIndex) {
        polygon2Vertices.push({
            x: originalVertices[currentIndex].x,
            y: originalVertices[currentIndex].y
        });
        currentIndex = (currentIndex + 1) % originalVertices.length;
    }
    polygon2Vertices.push({
        x: originalVertices[startVertexIndex].x,
        y: originalVertices[startVertexIndex].y
    });
    
    // Add drawn path forward (excluding endpoints)
    for (let i = 1; i < drawnPath.length - 1; i++) {
        polygon2Vertices.push({
            x: drawnPath[i].x,
            y: drawnPath[i].y
        });
    }
    
    // Convert vertices to path format for your system
    const polygon1Path = polygon1Vertices.map((vertex, index) => ({
        x: vertex.x,
        y: vertex.y,
        name: `p${index}`
    }));
    
    const polygon2Path = polygon2Vertices.map((vertex, index) => ({
        x: vertex.x,
        y: vertex.y,
        name: `p${index}`
    }));
    
    // Calculate areas
    const area1 = this.calculatePolygonAreaFromPath(polygon1Path);
    const area2 = this.calculatePolygonAreaFromPath(polygon2Path);
    
    console.log(`Split result: ${area1.toFixed(1)} + ${area2.toFixed(1)} = ${(area1 + area2).toFixed(1)} sq ft`);
    
    // Create polygon objects
    const newPolygon1 = {
        id: Date.now(),
        path: polygon1Path,
        label: polygon.label + 'A',
        type: polygon.type,
        glaType: polygon.glaType,
        area: area1,
        centroid: this.calculateCentroidFromPath(polygon1Path)
    };
    
    const newPolygon2 = {
        id: Date.now() + 1,
        path: polygon2Path,
        label: polygon.label + 'B',
        type: polygon.type,
        glaType: polygon.glaType,
        area: area2,
        centroid: this.calculateCentroidFromPath(polygon2Path)
    };
    
    return [newPolygon1, newPolygon2];
}

// *** STEP 7: Add helper functions ***
function getLineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;
    
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

// Add these to the global scope or ensure they're accessible
window.startSplitMode = startSplitMode;
window.handleSplitPointClick = handleSplitPointClick;
window.updateSplitIntersectionPoints = updateSplitIntersectionPoints;
window.splitMode = false;
window.splitSourcePolygon = null;
window.splitIntersectionPoints = [];
window.splitSourceVertex = null;

function exitSplitMode() {
    splitMode = false;
    splitSourcePolygon = null;
    splitSourceVertex = null;
    splitIntersectionPoints = [];
    
    // Clear drawing state
    AppState.currentPolygonPoints = [];
    AppState.currentPolygonCounter = 0;
    this.waitingForFirstVertex = true;
    
    // Switch back to placement mode
    AppState.currentMode = 'placement';
    AppState.emit('mode:changed', { mode: 'placement' });
    
    // Update UI
    const modeIndicator = document.getElementById('modeIndicator');
    if (modeIndicator) {
        modeIndicator.textContent = 'READY';
        modeIndicator.style.background = '#95a5a6';
    }
    
    console.log('🔪 SPLIT: Exited split mode');
}

// Add these methods to your DrawingManager class if they don't exist
function isPointInPolygon(point, path) { // <--- FIX 1: Added 'function' keyword
    let inside = false;
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
        const pi = path[i];
        const pj = path[j];
        if ((pi.y > point.y) !== (pj.y > point.y) &&
            point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x) {
            inside = !inside;
        }
    }
    return inside;
}

function calculatePolygonAreaFromPath(path) { // <--- FIX 2: Added 'function' keyword
    if (!path || path.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < path.length; i++) {
        const p1 = path[i];
        const p2 = path[(i + 1) % path.length];
        area += (p1.x * p2.y - p2.x * p1.y);
    }
    return Math.abs(area / 2) / 64; // Convert to square feet
}

function calculateCentroidFromPath(path) { // <--- FIX 3: Added 'function' keyword
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
    this.branchFromIndex = null; // Used to track which vertex to branch from.
    // *** ADD THESE TWO NEW PROPERTIES ***
    this.pathPrefixes = ['p', 'q', 'r', 's', 't', 'u', 'v', 'w'];
    this.currentPrefixIndex = 0; // Start with 'p'

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

 // Helper method to check if an edge already has a label drawn
isEdgeAlreadyLabeled(p1, p2, labeledEdges) {
    // Check both directions since edge p1->p2 is the same as p2->p1
    return labeledEdges.some(edge => 
        (Math.abs(edge.p1.x - p1.x) < 1 && Math.abs(edge.p1.y - p1.y) < 1 &&
         Math.abs(edge.p2.x - p2.x) < 1 && Math.abs(edge.p2.y - p2.y) < 1) ||
        (Math.abs(edge.p1.x - p2.x) < 1 && Math.abs(edge.p1.y - p2.y) < 1 &&
         Math.abs(edge.p2.x - p1.x) < 1 && Math.abs(edge.p2.y - p1.y) < 1)
    );
}

// Then modify the drawDrawnLines() method to track labeled edges:

drawDrawnLines() {
    const { ctx } = AppState;
    if (!ctx || !AppState.drawnLines || AppState.drawnLines.length === 0) {
      return;
    }

    ctx.save();

    // NEW: Track which edges have been labeled to avoid duplicates
    const labeledEdges = [];

    // First, collect all edges that are part of polygons
    if (AppState.drawnPolygons) {
        AppState.drawnPolygons.forEach(polygon => {
            for (let i = 0; i < polygon.path.length; i++) {
                const p1 = polygon.path[i];
                const p2 = polygon.path[(i + 1) % polygon.path.length];
                labeledEdges.push({ p1, p2 });
            }
        });
    }

    // Loop through each "committed" line path
    AppState.drawnLines.forEach(line => {
      if (!line.path || line.path.length < 1) return;

      const path = line.path;

      // --- 1. Draw the line segments (edges) ---
      if (path.length > 1) {
        ctx.strokeStyle = '#555'; // Dark gray, same as polygon outlines
        ctx.lineWidth = 1.5; // Same width as polygon outlines
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
      }

      // --- 2. Draw the distance labels on each edge ---
      for (let i = 1; i < path.length; i++) {
        const prevPoint = path[i - 1];
        const currentPoint = path[i];
        
        // NEW: Skip this label if the edge is already labeled (part of a polygon)
        if (this.isEdgeAlreadyLabeled(prevPoint, currentPoint, labeledEdges)) {
            continue;
        }
        
        const dx = currentPoint.x - prevPoint.x;
        const dy = currentPoint.y - prevPoint.y;
        const distanceInPixels = Math.sqrt(dx * dx + dy * dy);
        const distanceInFeet = distanceInPixels / this.PIXELS_PER_FOOT;
        
        if (distanceInFeet >= 1) {
          const midX = (prevPoint.x + currentPoint.x) / 2;
          const midY = (prevPoint.y + currentPoint.y) / 2;
          const lineLength = Math.sqrt(dx * dx + dy * dy);
          if (lineLength === 0) continue;
          
          const perpX = -dy / lineLength;
          const perpY = dx / lineLength;
          const offset = 20;
          const labelX = midX + perpX * offset;
          const labelY = midY + perpY * offset;
          
          const text = `${distanceInFeet.toFixed(1)}'`;
          
          // Plain text styling to match polygons
          ctx.font = '10px Arial';
          ctx.fillStyle = '#555'; // Dark gray text
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, labelX, labelY);
          
          // NEW: Track this edge as labeled
          labeledEdges.push({ p1: prevPoint, p2: currentPoint });
        }
      }

      // --- 3. Draw the vertices and their labels ---
      // Only show vertices AND labels when in drawing mode
      if (AppState.currentMode === 'drawing') {
        path.forEach((point) => {
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          
          // For inactive paths, all vertices are the same intermediate color.
          ctx.fillStyle = '#3498db'; 
          
          ctx.beginPath();
          ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.restore();
          
          // VERTEX LABELS
          ctx.save();
          ctx.fillStyle = '#2c3e50';
          ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
          ctx.shadowBlur = 3;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          
          ctx.fillText(point.name, point.x, point.y - 20);
          ctx.restore();
        });
      }
    });

    ctx.restore();
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
// In drawing.js, find and replace this specific function

/**
 * Calculates the shortest distance from a point to a line segment.
 * @param {object} point The point {x, y}.
 * @param {object} lineStart The starting point of the line segment {x, y}.
 * @param {object} lineEnd The ending point of the line segment {x, y}.
 * @returns {number} The distance in pixels.
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





// STEP 1: ADD THIS NEW HELPER FUNCTION INSIDE THE DrawingManager CLASS
/**
 * Finds if a point is on a vertex of any completed polygon.
 * @param {object} point - The {x, y} coordinates to check.
 * @returns {object|null} Info about the connection or null if none.
 */
findPolygonConnection(point) {
    if (!AppState.drawnPolygons) return null;
    const tolerance = this.isMobileDevice() ? 30 : 20;
    for (const polygon of AppState.drawnPolygons) {
        const vertexIndex = polygon.path.findIndex(vertex => {
            const dx = point.x - vertex.x;
            const dy = point.y - vertex.y;
            return Math.sqrt(dx * dx + dy * dy) < tolerance;
        });
        if (vertexIndex !== -1) {
            return {
                polygon,
                vertexIndex,
                vertex: polygon.path[vertexIndex]
            };
        }
    }
    return null;
}



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

// Replace the entire drawPolygons function in drawing.js with this:
drawPolygons() {
    const { ctx } = AppState;
    if (!ctx) return;

    // Save the current drawing state
    ctx.save();

    if (AppState.currentPolygonPoints.length > 0) {
        // Draw the main path lines
        if (AppState.currentPolygonPoints.length > 1) {
            // MODIFIED: Change line color based on drawing mode
            if (AppState.currentMode === 'drawing') {
                ctx.strokeStyle = '#3498db'; // Blue when actively drawing
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = '#555'; // Dark gray when not in drawing mode
                ctx.lineWidth = 1.5;
            }
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
                    
                    const text = `${distanceInFeet.toFixed(1)}'`;
                    
                    // MODIFIED: Use plain text style when not in drawing mode
                    if (AppState.currentMode === 'drawing') {
                        // Blue background style when actively drawing
                        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        const textMetrics = ctx.measureText(text);
                        const padding = 4;
                        
                        ctx.fillStyle = 'rgba(52, 152, 219, 0.9)';
                        
                        const backgroundRect = {
                            x: labelX - textMetrics.width / 2 - padding,
                            y: labelY - 6 - padding,
                            width: textMetrics.width + padding * 2,
                            height: 12 + padding * 2
                        };
                        
                        ctx.fillRect(backgroundRect.x, backgroundRect.y, backgroundRect.width, backgroundRect.height);
                        
                        ctx.fillStyle = 'white';
                        ctx.fillText(text, labelX, labelY);
                    } else {
                        // Plain text style when not in drawing mode
                        ctx.font = '10px Arial';
                        ctx.fillStyle = '#555';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(text, labelX, labelY);
                    }
                }
            }
        }

        // *** NEW: Draw closing edge preview only in drawing mode ***
        if (AppState.currentMode === 'drawing' && AppState.currentPolygonPoints.length >= 3) {
            const firstPoint = AppState.currentPolygonPoints[0];
            const lastPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1];
            
            // Only show if points are not already very close
            const dx = firstPoint.x - lastPoint.x;
            const dy = firstPoint.y - lastPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 5) {
                // Draw closing edge preview
                ctx.save();
                ctx.strokeStyle = 'rgba(46, 204, 113, 0.8)'; // Green for close action
                ctx.lineWidth = 3;
                ctx.setLineDash([12, 6]);
                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(firstPoint.x, firstPoint.y);
                ctx.stroke();
                
                // Add distance label for closing edge
                const distanceInFeet = distance / this.PIXELS_PER_FOOT;
                if (distanceInFeet >= 1) {
                    const midX = (lastPoint.x + firstPoint.x) / 2;
                    const midY = (lastPoint.y + firstPoint.y) / 2;
                    
                    ctx.setLineDash([]); // Reset dash for text
                    ctx.fillStyle = 'rgba(46, 204, 113, 0.9)';
                    ctx.font = 'bold 9px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const text = `${distanceInFeet.toFixed(1)}' (cls)`;
                    const textMetrics = ctx.measureText(text);
                    const padding = 3;
                    
                    // Green background for closing edge label
                    ctx.fillRect(
                        midX - textMetrics.width / 2 - padding,
                        midY - 6 - padding,
                        textMetrics.width + padding * 2,
                        12 + padding * 2
                    );
                    
                    ctx.fillStyle = 'white';
                    ctx.fillText(text, midX, midY);
                }
                
                ctx.restore();
            }
        }

        // *** ENHANCED: Draw vertices with higher z-index and better visibility ***
        // MODIFIED: Only draw vertices when in drawing mode
        if (AppState.currentMode === 'drawing') {
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

 // Replace the entire drawHelperPoints function in drawing.js with this:
drawHelperPoints() {
    // Only draw helper points if we're in drawing mode
    if (AppState.currentMode !== 'drawing') {
        return;
    }

    const { ctx } = AppState;
    if (!ctx) return;

    ctx.save();

    // Draw temporary helper points (simple purple dots for alignment)
    if (AppState.helperPoints && AppState.helperPoints.length > 0) {
        AppState.helperPoints.forEach(point => {
            ctx.save();
            
            // Simple purple dot with white border
            ctx.fillStyle = '#9b59b6'; // Purple
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            
            // Draw small circle (6px radius)
            ctx.beginPath();
            ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
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
    
    // Listen for drawing committed lines (lower layer)
    AppState.on('canvas:redraw:lines', () => {
        this.drawDrawnLines();
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

// Replace the entire activate function in drawing.js with this:
 

// *** NEW: Add mouse move handler for edge snap preview ***
handleMouseMove(e) {
    if (!this.isActive) return;
    
    // Only track mouse movement when waiting for first vertex
    if (this.waitingForFirstVertex) {
        const canvas = AppState.canvas;
        const rect = canvas.getBoundingClientRect();
        
        // Calculate the scale factor between display size and actual canvas size
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        // Convert mouse coordinates to canvas space
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        
        // Convert to viewport coordinates
        const viewport = document.getElementById('canvasViewport');
        const viewportRect = viewport.getBoundingClientRect();
        const viewportX = (e.clientX - viewportRect.left) - AppState.viewportTransform.x;
        const viewportY = (e.clientY - viewportRect.top) - AppState.viewportTransform.y;
        
        // Update mouse position for edge snap preview
        this.lastMousePosition = { x: viewportX, y: viewportY };
        
        // Redraw to show/hide edge snap preview
        CanvasManager.redraw();
    }
}

// STEP 2: REPLACE THE ENTIRE `handleCanvasInteraction` FUNCTION WITH THIS UPDATED VERSION
handleCanvasInteraction(e) {
    if (!this.isActive) return;

    const viewport = document.getElementById('canvasViewport');
    const viewportRect = viewport.getBoundingClientRect();
    const canvasX = (e.clientX - viewportRect.left) - AppState.viewportTransform.x;
    const canvasY = (e.clientY - viewportRect.top) - AppState.viewportTransform.y;
    this.lastMousePosition = {
        x: canvasX,
        y: canvasY
    };

    // Rule 1: Placing the first vertex of a new shape
    if (this.waitingForFirstVertex) {
        this.placeFirstVertex(canvasX, canvasY);
        return true; // Action handled
    }

    const currentPath = AppState.currentPolygonPoints;

    // Priority #1: Clicking a vertex on the CURRENT path (to close or backtrack)
    const clickedVertexIndex = this.findClickedVertex(canvasX, canvasY);
    if (clickedVertexIndex !== -1) {
        if (clickedVertexIndex === 0 && currentPath.length >= 3) {
            console.log('✅ Cycle completion triggered by clicking the first vertex.');
            this.completeCycle(currentPath);
        } else {
            this.continueFromVertex(clickedVertexIndex);
        }
        return true; // Action handled
    }

    // Priority #2: Clicking a permanent helper point (for snapping)
    const clickedHelper = this.findClickedHelperPoint(canvasX, canvasY);
    if (clickedHelper) {
        // --- NEW LOGIC FOR ADJACENT AREA CREATION VIA HELPER ---
        const startPoint = currentPath[0];
        const startConnectionInfo = this.findPolygonConnection(startPoint);
        const endConnectionInfo = this.findPolygonConnection(clickedHelper);

        if (startConnectionInfo && endConnectionInfo && startConnectionInfo.polygon.id === endConnectionInfo.polygon.id && startConnectionInfo.vertexIndex !== endConnectionInfo.vertexIndex) {
            console.log('✅ Adjacent area creation triggered by clicking a permanent helper point.');
            const polygon = startConnectionInfo.polygon;
            const startIndex = startConnectionInfo.vertexIndex;
            const endIndex = endConnectionInfo.vertexIndex;
            const arcPath = this.getShorterArc(polygon.path, endIndex, startIndex);
            
            // Add the clicked helper point to the current path before completing
            this.addHelperAsVertex(clickedHelper, true); // Add quietly
            
            const newCyclePath = [...AppState.currentPolygonPoints, ...arcPath];

            if (newCyclePath.length > 1) {
                const first = newCyclePath[0];
                const last = newCyclePath[newCyclePath.length - 1];
                if (Math.abs(first.x - last.x) < 1 && Math.abs(first.y - last.y) < 1) {
                    newCyclePath.pop();
                }
            }
            this.completeCycle(newCyclePath);

        } else {
            console.log('🟣 Helper point clicked for snapping (not closing adjacent area).');
            this.addHelperAsVertex(clickedHelper);
        }
        return true; // Action handled
    }

    // Priority #3: Clicking on an existing completed polygon vertex
    const endConnectionInfo = this.findPolygonConnection({
        x: canvasX,
        y: canvasY
    });
    if (endConnectionInfo) {
        const startPoint = currentPath[0];
        const startConnectionInfo = this.findPolygonConnection(startPoint);

        // ** THIS IS THE CORE OF THE FIX **
        // Check if start and end points are on the SAME polygon but are DIFFERENT vertices
        if (startConnectionInfo && endConnectionInfo.polygon.id === startConnectionInfo.polygon.id && endConnectionInfo.vertexIndex !== startConnectionInfo.vertexIndex) {
            console.log('✅ Adjacent area creation triggered by clicking a polygon vertex.');
            
            const polygon = startConnectionInfo.polygon;
            const startIndex = startConnectionInfo.vertexIndex;
            const endIndex = endConnectionInfo.vertexIndex;

            // Get the path along the perimeter to close the shape
            const arcPath = this.getShorterArc(polygon.path, endIndex, startIndex);
            
            // Construct the final path for the new area
            const newCyclePath = [...currentPath, endConnectionInfo.vertex, ...arcPath];
            
            // Clean up duplicate vertices at the start/end
            if (newCyclePath.length > 1) {
                const first = newCyclePath[0];
                const last = newCyclePath[newCyclePath.length - 1];
                if (Math.abs(first.x - last.x) < 1 && Math.abs(first.y - last.y) < 1) {
                    newCyclePath.pop();
                }
            }
            
            this.completeCycle(newCyclePath);

        } else {
            // Fallback: The click is on a polygon vertex, but it's not forming an adjacent area.
            // Just add it as a new point to the current line.
            console.log('Clicked on a polygon vertex, but not forming an adjacent area. Adding as a point.');
            this.addPolygonVertexToPath(endConnectionInfo.vertex);
        }
        return true; // Action handled
    }

    // If we reach here, the click was in empty space, allow it to be handled by other systems like panning
    console.log('🖱️ Click in empty space - allowing panning');
    return false;
}


// STEP 3: ADD a quiet flag to addHelperAsVertex to prevent double actions
// Find the `addHelperAsVertex` function and replace it with this version.
addHelperAsVertex(helperPoint, quiet = false) {
    if (!quiet) console.log('🟣 HELPER DEBUG: Adding helper point as vertex with EXACT positioning');

    const prefix = this.pathPrefixes[this.currentPrefixIndex];
    const newPoint = {
        x: helperPoint.x,
        y: helperPoint.y,
        name: `${prefix}${AppState.currentPolygonCounter}`,
        snappedToHelper: true
    };

    AppState.currentPolygonPoints.push(newPoint);
    AppState.currentPolygonCounter++;
    AppState.emit('app:drawingPointAdded', { point: newPoint });

    if (!quiet) {
       console.log(`🎯 SNAP: Added vertex ${newPoint.name} at EXACT position (${newPoint.x}, ${newPoint.y})`);
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
}




 handleCanvasClick(e) {
    if (!this.isActive) return;
    
    // *** IMPORTANT: Don't prevent default here - let panning work ***
    
    // *** FIXED: Use viewport-based coordinates consistently ***
    const viewport = document.getElementById('canvasViewport');
    const rect = viewport.getBoundingClientRect();
    
    // Convert click coordinates to canvas world coordinates
    const canvasX = (e.clientX - rect.left) - AppState.viewportTransform.x;
    const canvasY = (e.clientY - rect.top) - AppState.viewportTransform.y;
    
    // Create a synthetic event with canvas coordinates
    const canvasEvent = {
      clientX: e.clientX,
      clientY: e.clientY
    };
    
    // Try to handle the interaction
    const wasHandled = this.handleCanvasInteraction(canvasEvent);
    
    // *** KEY FIX: Only prevent propagation if we actually handled something ***
    if (wasHandled) {
        e.preventDefault();
        e.stopPropagation();
    }
}

handleCanvasTouch(e) {
    if (!this.isActive) return;
    
    // *** IMPORTANT: Don't prevent default here initially - let panning work ***
    
    if (e.changedTouches && e.changedTouches.length > 0) {
      // Use the first touch point
      const touch = e.changedTouches[0];
      
      // *** FIXED: Use the same coordinate system as handleCanvasClick ***
      const viewport = document.getElementById('canvasViewport');
      const rect = viewport.getBoundingClientRect();
      
      // Convert touch coordinates to canvas world coordinates
      const canvasX = (touch.clientX - rect.left) - AppState.viewportTransform.x;
      const canvasY = (touch.clientY - rect.top) - AppState.viewportTransform.y;
      
      // Create a synthetic event with the correct coordinates
      const canvasEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY
      };
      
      // Try to handle the interaction
      const wasHandled = this.handleCanvasInteraction(canvasEvent);
      
      // *** KEY FIX: Only prevent default if we actually handled something ***
      if (wasHandled) {
          e.preventDefault();
          e.stopPropagation();
      }
    }
}

// *** FIXED: Activate function - don't interfere with viewport touch events ***
activate() {

    this.createHelperPointsFromPolygonVertices();

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
        // *** CRITICAL: Only add to canvas, not viewport, to avoid interfering with panning ***
        canvas.addEventListener('click', this.boundHandleCanvasClick);
        canvas.addEventListener('touchend', this.boundHandleCanvasTouch);
        
        // *** NEW: Add mouse move tracking for edge snap preview ***
        this.boundHandleMouseMove = this.handleMouseMove.bind(this);
        canvas.addEventListener('mousemove', this.boundHandleMouseMove);
    }
    
    AppState.emit('ui:drawing:activated');
}

// *** FIXED: Deactivate function ***
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
        
        // *** NEW: Remove mouse move listener ***
        if (this.boundHandleMouseMove) {
            canvas.removeEventListener('mousemove', this.boundHandleMouseMove);
        }
    }
    
    // Clear mouse position tracking
    this.lastMousePosition = null;
    
    AppState.emit('ui:drawing:deactivated');
}

  

 

// *** STEP 2: Add simplified polygon split detection ***
// Add this new method to DrawingManager class
checkForSimplePolygonSplit(helperPoint) {
    const currentPath = AppState.currentPolygonPoints;
    if (!currentPath || currentPath.length < 1) return null;
    
    const firstPoint = currentPath[0];
    
    console.log('🔍 SPLIT CHECK: Checking if both endpoints are on same polygon');
    console.log('First point:', firstPoint);
    console.log('Helper point:', helperPoint);
    
    // Check each existing polygon
    for (const polygon of AppState.drawnPolygons) {
        const firstOnPolygon = this.isPointOnPolygonBoundary(firstPoint, polygon, 10);
        const helperOnPolygon = this.isPointOnPolygonBoundary(helperPoint, polygon, 10);
        
        console.log(`Checking polygon "${polygon.label}":`, {
            firstOnPolygon: !!firstOnPolygon,
            helperOnPolygon: !!helperOnPolygon
        });
        
        if (firstOnPolygon && helperOnPolygon) {
            // Both points are on the same polygon - this is a split!
            console.log('✅ SPLIT DETECTED: Both endpoints on same polygon');
            
            // Add the helper point to complete the splitting path
            const completePath = [...currentPath, helperPoint];
            
            return {
                polygon: polygon,
                splittingPath: completePath,
                firstConnection: firstOnPolygon,
                secondConnection: helperOnPolygon
            };
        }
    }
    
    console.log('❌ No polygon split detected');
    return null;
}

// *** STEP 3: Add simplified polygon split execution ***
// Add this new method to DrawingManager class
executePolygonSplit(splitInfo) {
    const { polygon, splittingPath } = splitInfo;
    
    console.log('🔪 EXECUTING SPLIT on polygon:', polygon.label);
    console.log('Splitting path length:', splittingPath.length);
    
    // Find connection points on the polygon boundary
    const firstPoint = splittingPath[0];
    const lastPoint = splittingPath[splittingPath.length - 1];
    
    // Find which vertices these points correspond to
    const firstVertexIndex = this.findVertexIndex(polygon.path, firstPoint, 15);
    const lastVertexIndex = this.findVertexIndex(polygon.path, lastPoint, 15);
    
    if (firstVertexIndex === -1 || lastVertexIndex === -1) {
        console.error('🔪 SPLIT ERROR: Could not find connection vertices');
        return false;
    }
    
    console.log(`🔪 SPLIT: Connecting vertex ${firstVertexIndex} to vertex ${lastVertexIndex}`);
    
    // Create two new polygons using the simple approach
    const newPolygons = this.createSplitPolygons(polygon, splittingPath, firstVertexIndex, lastVertexIndex);
    
    if (newPolygons && newPolygons.length === 2) {
        // Remove original polygon
        const originalIndex = AppState.drawnPolygons.findIndex(p => p.id === polygon.id);
        if (originalIndex !== -1) {
            AppState.drawnPolygons.splice(originalIndex, 1);
            AppState.drawnPolygons.push(...newPolygons);
            
            // Clear the current drawing path
            AppState.currentPolygonPoints = [];
            AppState.currentPolygonCounter = 0;
            this.waitingForFirstVertex = true;
            
            // Update and redraw
            HelperPointManager.updateHelperPoints();
            CanvasManager.saveAction();
            CanvasManager.redraw();
            
            console.log('✅ SPLIT: Polygon split completed successfully');
            return true;
        }
    }
    
    console.error('🔪 SPLIT ERROR: Failed to create new polygons');
    return false;
}

// *** STEP 4: Add simple polygon creation from split ***
// Add this new method to DrawingManager class
createSplitPolygons(originalPolygon, splittingPath, startVertexIndex, endVertexIndex) {
    console.log('🏗️ CREATING split polygons');
    
    const originalPath = originalPolygon.path;
    const pathLength = originalPath.length;
    
    // Create first polygon: startVertex -> endVertex (forward) + splitting path (reverse)
    const polygon1Path = [];
    
    // Add vertices from start to end (forward around original polygon)
    let currentIndex = startVertexIndex;
    while (currentIndex !== endVertexIndex) {
        polygon1Path.push({
            x: originalPath[currentIndex].x,
            y: originalPath[currentIndex].y,
            name: `p${polygon1Path.length}`
        });
        currentIndex = (currentIndex + 1) % pathLength;
    }
    // Add end vertex
    polygon1Path.push({
        x: originalPath[endVertexIndex].x,
        y: originalPath[endVertexIndex].y,
        name: `p${polygon1Path.length}`
    });
    
    // Add splitting path in reverse (excluding first and last points to avoid duplicates)
    for (let i = splittingPath.length - 2; i > 0; i--) {
        polygon1Path.push({
            x: splittingPath[i].x,
            y: splittingPath[i].y,
            name: `p${polygon1Path.length}`
        });
    }
    
    // Create second polygon: endVertex -> startVertex (forward) + splitting path (forward)
    const polygon2Path = [];
    
    // Add vertices from end to start (forward around original polygon)
    currentIndex = endVertexIndex;
    while (currentIndex !== startVertexIndex) {
        polygon2Path.push({
            x: originalPath[currentIndex].x,
            y: originalPath[currentIndex].y,
            name: `p${polygon2Path.length}`
        });
        currentIndex = (currentIndex + 1) % pathLength;
    }
    // Add start vertex
    polygon2Path.push({
        x: originalPath[startVertexIndex].x,
        y: originalPath[startVertexIndex].y,
        name: `p${polygon2Path.length}`
    });
    
    // Add splitting path forward (excluding first and last points to avoid duplicates)
    for (let i = 1; i < splittingPath.length - 1; i++) {
        polygon2Path.push({
            x: splittingPath[i].x,
            y: splittingPath[i].y,
            name: `p${polygon2Path.length}`
        });
    }
    
    // Validate polygon sizes
    if (polygon1Path.length < 3 || polygon2Path.length < 3) {
        console.error('🔪 SPLIT ERROR: Invalid polygon sizes:', polygon1Path.length, polygon2Path.length);
        return null;
    }
    
    // Calculate areas
    const area1 = this.calculatePolygonAreaFromPath(polygon1Path);
    const area2 = this.calculatePolygonAreaFromPath(polygon2Path);
    
    console.log(`🔪 SPLIT RESULT: Created polygons with ${polygon1Path.length} and ${polygon2Path.length} vertices`);
    console.log(`🔪 SPLIT AREAS: ${area1.toFixed(1)} + ${area2.toFixed(1)} = ${(area1 + area2).toFixed(1)} sq ft`);
    
    // Create polygon objects
    const newPolygon1 = {
        id: Date.now(),
        path: polygon1Path,
        label: originalPolygon.label + 'A',
        type: originalPolygon.type,
        glaType: originalPolygon.glaType,
        area: area1,
        centroid: this.calculateCentroidFromPath(polygon1Path)
    };
    
    const newPolygon2 = {
        id: Date.now() + 1,
        path: polygon2Path,
        label: originalPolygon.label + 'B',
        type: originalPolygon.type,
        glaType: originalPolygon.glaType,
        area: area2,
        centroid: this.calculateCentroidFromPath(polygon2Path)
    };
    
    return [newPolygon1, newPolygon2];
}

// *** STEP 5: Helper functions (if not already present) ***
// Add these helper methods if they don't exist in your DrawingManager class

findVertexIndex(polygonPath, point, tolerance = 10) {
    for (let i = 0; i < polygonPath.length; i++) {
        const vertex = polygonPath[i];
        const dx = point.x - vertex.x;
        const dy = point.y - vertex.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= tolerance) {
            return i;
        }
    }
    return -1;
}

isPointOnPolygonBoundary(point, polygon, tolerance = 5) {
    // Check if point is exactly on a vertex
    for (const vertex of polygon.path) {
        const dx = point.x - vertex.x;
        const dy = point.y - vertex.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= tolerance) {
            return { type: 'vertex', vertex: vertex, polygon: polygon };
        }
    }
    
    // Check if point is on an edge
    for (let i = 0; i < polygon.path.length; i++) {
        const edgeStart = polygon.path[i];
        const edgeEnd = polygon.path[(i + 1) % polygon.path.length];
        const distanceToEdge = this.distanceFromPointToLineSegment(point, edgeStart, edgeEnd);
        
        if (distanceToEdge <= tolerance) {
            return { type: 'edge', edgeStart: edgeStart, edgeEnd: edgeEnd, polygon: polygon };
        }
    }
    
    return null;
}

calculatePolygonAreaFromPath(path) {
    if (!path || path.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < path.length; i++) {
        const p1 = path[i];
        const p2 = path[(i + 1) % path.length];
        area += (p1.x * p2.y - p2.x * p1.y);
    }
    return Math.abs(area / 2) / 64; // Convert to square feet (assuming 8 pixels per foot)
}

calculateCentroidFromPath(path) {
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

findClickedPolygonVertex(x, y) {
    const clickRadius = this.isMobileDevice() ? 30 : 20;
    
    for (const polygon of AppState.drawnPolygons) {
        for (const vertex of polygon.path) {
            const dx = x - vertex.x;
            const dy = y - vertex.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= clickRadius) {
                console.log('🔪 Found clicked polygon vertex:', vertex);
                return vertex;
            }
        }
    }
    return null;
}

addPolygonVertexToPath(vertex) {
    console.log('🔪 Adding polygon vertex to current path:', vertex);
    
    const newPoint = {
        x: vertex.x,
        y: vertex.y,
        name: `p${AppState.currentPolygonCounter}`,
        fromPolygonVertex: true
    };

    AppState.currentPolygonPoints.push(newPoint);
    AppState.currentPolygonCounter++;
    AppState.emit('app:drawingPointAdded', { point: newPoint });
    
    // Update helper points and redraw
    HelperPointManager.updateHelperPoints();
    CanvasManager.saveAction();
    CanvasManager.redraw();
}
  // In drawing.js, replace the entire handleCanvasInteraction function with this one:
// In drawing.js, replace the entire handleCanvasInteraction function with this one:
// In drawing.js, find and replace this function

 
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
 // Replace your existing completeCycle function with this enhanced version
completeCycle(pathToComplete) {
    console.log('🎉 Attempting to complete cycle with', pathToComplete.length, 'points.');
    
    // First, check if this is a splitting scenario
  
    
    // If not splitting, proceed with normal cycle completion
    console.log('🎉 Creating new polygon cycle');
    
    // Add vertices as permanent helpers for future snapping.
    //this.addVerticesAsPermanentHelpers(pathToComplete);
    
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
    console.log('🔍 VERTEX DEBUG: Current polygon points:', AppState.currentPolygonPoints.length);
    
    // NEW: Also check existing polygon vertices for debugging
    console.log('🔍 VERTEX DEBUG: Existing polygons:', AppState.drawnPolygons.length);
    AppState.drawnPolygons.forEach((polygon, polyIndex) => {
        polygon.path.forEach((vertex, vertexIndex) => {
            const dx = x - vertex.x;
            const dy = y - vertex.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            console.log(`🔍 VERTEX DEBUG: Polygon ${polyIndex} vertex ${vertexIndex} at (${vertex.x.toFixed(1)}, ${vertex.y.toFixed(1)}) - distance: ${distance.toFixed(1)}px`);
        });
    });
    
    // Check current drawing path vertices
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

// In src/drawing.js, replace the existing function with this one.

  continueFromVertex(vertexIndex) {
    const currentPath = AppState.currentPolygonPoints;
    const clickedPoint = currentPath[vertexIndex];
    
    const isLastVertex = vertexIndex === currentPath.length - 1;

    if (isLastVertex) {
      console.log('Continuing from last vertex - no vertices removed.');
    } else {
      console.log(`Branching from intermediate vertex ${clickedPoint.name}.`);
      
      if (currentPath.length > 1) {
        this.addVerticesAsPermanentHelpers(currentPath);
        AppState.drawnLines.push({
          id: Date.now(),
          path: [...currentPath]
        });
        console.log('Committed original path to drawnLines to create a branch.');
      }

      // --- START MODIFICATION: Advance to the next letter prefix ---
      this.currentPrefixIndex = (this.currentPrefixIndex + 1) % this.pathPrefixes.length;
      const newPrefix = this.pathPrefixes[this.currentPrefixIndex];
      console.log(`Switched to new path prefix: "${newPrefix}"`);
      // --- END MODIFICATION ---

      AppState.currentPolygonPoints = [{
        x: clickedPoint.x,
        y: clickedPoint.y,
        name: `${newPrefix}0` // Use the new prefix for the first vertex of the branch
      }];
      
      AppState.currentPolygonCounter = 1;
      this.waitingForFirstVertex = false;
    }

    // --- The UI reset logic is the same for both cases ---
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
    
    HelperPointManager.updateHelperPoints();
    CanvasManager.saveAction();
    CanvasManager.redraw();
    
    console.log(`Ready to draw new branch. New path starts at the position of old ${clickedPoint.name}.`);
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
            //this.drawCyclePreviewLines(ctx);
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
            
            // MODIFIED: Only draw labels when in drawing mode
            if (AppState.currentMode === 'drawing') {
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
            }
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
        //arrow.style.backgroundColor = "transparent";

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

 // Replace the entire handleKeypadClick function in drawing.js with this:
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
            // *** NEW: Close polygon functionality ***
            console.log('🔄 CLS: Close polygon button clicked');
            this.closeCurrentPolygon();
            break;
    }
}

// *** NEW: Add this new method to close the current polygon ***
closeCurrentPolygon() {
    console.log('🔄 CLS: Attempting to close current polygon');
    
    // Check if we have enough points to form a polygon
    if (!AppState.currentPolygonPoints || AppState.currentPolygonPoints.length < 3) {
        console.log('❌ CLS: Need at least 3 points to close a polygon. Current points:', AppState.currentPolygonPoints?.length || 0);
        return;
    }
    
    const firstPoint = AppState.currentPolygonPoints[0];
    const lastPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1];
    
    // Check if already closed (last point is very close to first point)
    const dx = lastPoint.x - firstPoint.x;
    const dy = lastPoint.y - firstPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 5) {
        console.log('🔄 CLS: Polygon already closed (distance to first point: ' + distance.toFixed(1) + 'px)');
        // Complete the cycle as-is
        this.completeCycle(AppState.currentPolygonPoints);
        return;
    }
    
    console.log(`🔄 CLS: Closing polygon by connecting ${lastPoint.name} to ${firstPoint.name}`);
    console.log(`Distance to close: ${(distance / this.PIXELS_PER_FOOT).toFixed(1)} feet`);
    
    // Create a copy of the current points for the completed cycle
    const closedPath = [...AppState.currentPolygonPoints];
    
    // Complete the cycle
    this.completeCycle(closedPath);
    
    console.log('✅ CLS: Polygon closed successfully');
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

// Replace the entire handleDirectionClick function in drawing.js with this:
handleDirectionClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const button = e.target;
    
    // *** NEW: Handle center button for polygon closing ***
    if (button.classList.contains('center')) {
        console.log('🔴 CENTER: Center button clicked - closing polygon');
        this.closeCurrentPolygon();
        return;
    }
    
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
// Replace the entire placeFirstVertex function in drawing.js with this:
// In drawing.js, replace this entire function

placeFirstVertex(x, y) {
    console.log('DrawingManager: Placing first vertex at:', x, y);
    
    let finalX = x;
    let finalY = y;
    let snapInfo = null;
    let nearbyEdge = null; // CORRECTED: Variable declared here to be in scope.
    
    // *** PRIORITY 1: Check for vertex snapping first (highest priority) ***
    const nearbyHelper = this.findClickedHelperPoint(x, y);
    if (nearbyHelper) {
        finalX = nearbyHelper.x;
        finalY = nearbyHelper.y;
        snapInfo = { type: 'vertex', point: nearbyHelper };
        console.log('🎯 SNAP: First vertex snapped to helper point at:', finalX, finalY);
    } else {
        // *** PRIORITY 2: Check for edge snapping if no vertex found ***
        nearbyEdge = this.findNearbyEdgeForSnapping(x, y); // CORRECTED: Assign to existing variable.
        if (nearbyEdge) {
            const snapPoint = this.getSnapPointOnEdge(nearbyEdge, { x, y });
            finalX = snapPoint.x;
            finalY = snapPoint.y;
            snapInfo = { type: 'edge', edge: nearbyEdge, point: snapPoint };
            console.log('🎯 SNAP: First vertex snapped to edge at:', finalX, finalY);
        }
    }
    
    const firstPoint = {
        x: finalX,
        y: finalY,
        name: 'p0',
        snappedToHelper: !!nearbyHelper,
        snappedToEdge: !!nearbyEdge, // CORRECTED: This line now works safely.
        snapInfo: snapInfo
    };
    
    AppState.currentPolygonPoints = [firstPoint];
    AppState.currentPolygonCounter = 1;
    this.waitingForFirstVertex = false;
    AppState.emit('app:drawingPointAdded', { point: firstPoint });

    // *** NEW: Add snapped-to point as a permanent helper for future reference ***
    if (snapInfo && snapInfo.type === 'edge') {
        this.addSnapPointAsPermanentHelper(snapInfo.point);
    }

    // Update helper points before redrawing
    HelperPointManager.updateHelperPoints();

    CanvasManager.saveAction();
    CanvasManager.redraw();

    console.log('DrawingManager: First vertex p0 placed with snap info:', snapInfo);
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

// Add these new functions to the DrawingManager class in drawing.js:
// Add this new method to the DrawingManager class:
createHelperPointsFromPolygonVertices() {
    if (!AppState.permanentHelperPoints) {
        AppState.permanentHelperPoints = [];
    }
    
    // Add all polygon vertices as permanent helper points
    AppState.drawnPolygons.forEach((polygon, polyIndex) => {
        polygon.path.forEach((vertex, vertexIndex) => {
            // Check if this helper point already exists
            const exists = AppState.permanentHelperPoints.some(hp => 
                Math.abs(hp.x - vertex.x) < 2 && Math.abs(hp.y - vertex.y) < 2
            );
            
            if (!exists) {
                AppState.permanentHelperPoints.push({
                    x: vertex.x,
                    y: vertex.y,
                    source: 'polygon_vertex',
                    polygonId: polygon.id,
                    vertexIndex: vertexIndex,
                    originalName: vertex.name || `p${vertexIndex}`
                });
            }
        });
    });
}

 

// In the drawCompletedAreas() function, add vertex label drawing:
drawCompletedAreas() {
    // ... existing code for drawing polygons ...
    
    // ADD THIS SECTION: Draw vertex labels when in drawing mode
    if (AppState.currentMode === 'drawing') {
        AppState.drawnPolygons.forEach((poly) => {
            poly.path.forEach((vertex, index) => {
                ctx.save();
                ctx.fillStyle = '#e74c3c'; // Red color for existing vertices
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // White text shadow for readability
                ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                ctx.shadowBlur = 3;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;
                
                const label = vertex.name || `p${index}`;
                ctx.fillText(label, vertex.x, vertex.y - 15);
                ctx.restore();
            });
        });
    }
    
    // ... rest of existing code ...
}

// Add this new method to DrawingManager class in drawing.js
checkForPolygonSplitting() {
    const currentPath = AppState.currentPolygonPoints;
    if (!currentPath || currentPath.length < 2) return false;
    
    const firstPoint = currentPath[0];
    const lastPoint = currentPath[currentPath.length - 1];
    
    console.log('🔍 SPLIT CHECK: Checking if path splits a polygon');
    console.log('First point:', firstPoint);
    console.log('Last point:', lastPoint);
    
    // Check if both endpoints are on existing polygons
    for (const polygon of AppState.drawnPolygons) {
        const firstOnPolygon = this.isPointOnPolygonBoundary(firstPoint, polygon);
        const lastOnPolygon = this.isPointOnPolygonBoundary(lastPoint, polygon);
        
        console.log(`Checking polygon "${polygon.label}":`, {
            firstOnPolygon: !!firstOnPolygon,
            lastOnPolygon: !!lastOnPolygon
        });
        
        if (firstOnPolygon && lastOnPolygon) {
            // Additional check: make sure the path doesn't just trace the polygon boundary
            const isJustTracingBoundary = this.isPathTracingBoundary(currentPath, polygon);
            
            if (!isJustTracingBoundary) {
                console.log('🔪 SPLIT: Path connects two points on same polygon - attempting split');
                return this.performPolygonSplit(polygon, currentPath);
            } else {
                console.log('❌ Path is just tracing the boundary, not a valid split');
            }
        }
    }
    
    return false;
}

// Add this helper method to check if a point is on polygon boundary
isPointOnPolygonBoundary(point, polygon, tolerance = 5) {
    // Check if point is exactly on a vertex
    for (const vertex of polygon.path) {
        const dx = point.x - vertex.x;
        const dy = point.y - vertex.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= tolerance) {
            return { type: 'vertex', vertex: vertex, polygon: polygon };
        }
    }
    
    // Check if point is on an edge
    for (let i = 0; i < polygon.path.length; i++) {
        const edgeStart = polygon.path[i];
        const edgeEnd = polygon.path[(i + 1) % polygon.path.length];
        const distanceToEdge = this.distanceFromPointToLineSegment(point, edgeStart, edgeEnd);
        
        if (distanceToEdge <= tolerance) {
            return { type: 'edge', edgeStart: edgeStart, edgeEnd: edgeEnd, polygon: polygon };
        }
    }
    
    return null;
}


// *** NEW: Check if path is just tracing the polygon boundary ***
isPathTracingBoundary(path, polygon) {
    // If the path has intermediate points, check if they're all on the polygon boundary
    if (path.length <= 2) return false;
    
    // Check each intermediate point
    for (let i = 1; i < path.length - 1; i++) {
        const point = path[i];
        if (!this.isPointOnPolygonBoundary(point, polygon)) {
            // At least one point is not on the boundary - this is a valid split
            return false;
        }
    }
    
    // All points are on the boundary - this might just be tracing the edge
    return true;
}


// Add the core splitting algorithm
performPolygonSplit(polygon, splittingPath) {
    console.log('🔪 SPLIT: Performing polygon split');
    console.log('Original polygon:', polygon.label, 'with', polygon.path.length, 'vertices');
    console.log('Splitting path:', splittingPath.length, 'points');
    
    const firstPoint = splittingPath[0];
    const lastPoint = splittingPath[splittingPath.length - 1];
    
    // Find the indices where the splitting path connects to the original polygon
    const firstIndex = this.findVertexIndex(polygon.path, firstPoint);
    const lastIndex = this.findVertexIndex(polygon.path, lastPoint);
    
    if (firstIndex === -1 || lastIndex === -1) {
        console.error('🔪 SPLIT: Could not find connection points on polygon');
        return false;
    }
    
    console.log(`🔪 SPLIT: Connecting vertex ${firstIndex} to vertex ${lastIndex}`);
    
    // Create the two new polygons
    const polygon1Path = [];
    const polygon2Path = [];
    
    // Build first polygon: from firstIndex to lastIndex + splitting path
    let currentIndex = firstIndex;
    while (currentIndex !== lastIndex) {
        polygon1Path.push({ ...polygon.path[currentIndex] });
        currentIndex = (currentIndex + 1) % polygon.path.length;
    }
    polygon1Path.push({ ...polygon.path[lastIndex] }); // Add the last point
    
    // Add the splitting path in reverse (to close the loop properly)
    for (let i = splittingPath.length - 2; i > 0; i--) {
        polygon1Path.push({ ...splittingPath[i] });
    }
    
    // Build second polygon: from lastIndex to firstIndex + splitting path  
    currentIndex = lastIndex;
    while (currentIndex !== firstIndex) {
        polygon2Path.push({ ...polygon.path[currentIndex] });
        currentIndex = (currentIndex + 1) % polygon.path.length;
    }
    polygon2Path.push({ ...polygon.path[firstIndex] }); // Add the first point
    
    // Add the splitting path forward
    for (let i = 1; i < splittingPath.length - 1; i++) {
        polygon2Path.push({ ...splittingPath[i] });
    }
    
    // Validate that both polygons have enough vertices
    if (polygon1Path.length < 3 || polygon2Path.length < 3) {
        console.error('🔪 SPLIT: Invalid split - polygons must have at least 3 vertices');
        console.log('Polygon 1 vertices:', polygon1Path.length);
        console.log('Polygon 2 vertices:', polygon2Path.length);
        return false;
    }
    
    // Create the new polygon objects
    const newPolygon1 = {
        id: Date.now(),
        path: polygon1Path,
        label: polygon.label + 'A',
        glaType: polygon.glaType,
        area: this.calculatePolygonAreaFromPath(polygon1Path),
        centroid: this.calculateCentroidFromPath(polygon1Path)
    };
    
    const newPolygon2 = {
        id: Date.now() + 1,
        path: polygon2Path,
        label: polygon.label + 'B', 
        glaType: polygon.glaType,
        area: this.calculatePolygonAreaFromPath(polygon2Path),
        centroid: this.calculateCentroidFromPath(polygon2Path)
    };
    
    console.log('🔪 SPLIT: Created two new polygons:');
    console.log(`- ${newPolygon1.label}: ${newPolygon1.area.toFixed(1)} sq ft (${newPolygon1.path.length} vertices)`);
    console.log(`- ${newPolygon2.label}: ${newPolygon2.area.toFixed(1)} sq ft (${newPolygon2.path.length} vertices)`);
    console.log(`- Original total: ${polygon.area.toFixed(1)} sq ft`);
    console.log(`- New total: ${(newPolygon1.area + newPolygon2.area).toFixed(1)} sq ft`);
    
    // Remove the original polygon and add the new ones
    const originalIndex = AppState.drawnPolygons.findIndex(p => p.id === polygon.id);
    if (originalIndex !== -1) {
        AppState.drawnPolygons.splice(originalIndex, 1);
        AppState.drawnPolygons.push(newPolygon1, newPolygon2);
        
        // Clear the current drawing path
        AppState.currentPolygonPoints = [];
        AppState.currentPolygonCounter = 0;
        this.waitingForFirstVertex = true;
        
        // Update helper points and redraw
        HelperPointManager.updateHelperPoints();
        CanvasManager.saveAction();
        CanvasManager.redraw();
        
        console.log('✅ SPLIT: Polygon split completed successfully');
        return true;
    }
    
    return false;
}

// Add helper methods for the splitting algorithm
findVertexIndex(polygonPath, point, tolerance = 10) {  // Changed from 5 to 10
    for (let i = 0; i < polygonPath.length; i++) {
        const vertex = polygonPath[i];
        const dx = point.x - vertex.x;
        const dy = point.y - vertex.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= tolerance) {
            console.log(`🔍 Found matching vertex at index ${i}, distance: ${distance.toFixed(2)}`);
            return i;
        }
    }
    console.log(`❌ No matching vertex found for point at (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
    return -1;
}

calculatePolygonAreaFromPath(path) {
    if (!path || path.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < path.length; i++) {
        const p1 = path[i];
        const p2 = path[(i + 1) % path.length];
        area += (p1.x * p2.y - p2.x * p1.y);
    }
    return Math.abs(area / 2) / 64; // Convert to square feet (assuming 8 pixels per foot)
}

calculateCentroidFromPath(path) {
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

// *** NEW: Find nearby edge for snapping ***
findNearbyEdgeForSnapping(x, y) {
    const snapRadius = this.isMobileDevice() ? 25 : 20; // Slightly larger radius for edge snapping
    
    console.log('🔍 EDGE SNAP: Looking for edges near click at:', x.toFixed(1), y.toFixed(1));
    
    // Check all completed polygons for nearby edges
    if (!AppState.drawnPolygons || AppState.drawnPolygons.length === 0) {
        console.log('🔍 EDGE SNAP: No completed polygons to check');
        return null;
    }
    
    let closestEdge = null;
    let closestDistance = Infinity;
    
    for (const polygon of AppState.drawnPolygons) {
        for (let i = 0; i < polygon.path.length; i++) {
            const p1 = polygon.path[i];
            const p2 = polygon.path[(i + 1) % polygon.path.length];
            
            const distanceToEdge = this.distanceFromPointToLineSegment({ x, y }, p1, p2);
            
            if (distanceToEdge <= snapRadius && distanceToEdge < closestDistance) {
                closestEdge = {
                    polygon: polygon,
                    startPoint: p1,
                    endPoint: p2,
                    edgeIndex: i
                };
                closestDistance = distanceToEdge;
                console.log(`🔍 EDGE SNAP: Found closer edge at distance ${distanceToEdge.toFixed(1)}px`);
            }
        }
    }
    
    if (closestEdge) {
        console.log('✅ EDGE SNAP: Found closest edge at distance:', closestDistance.toFixed(1), 'px');
        return closestEdge;
    } else {
        console.log('❌ EDGE SNAP: No edges found within snap radius');
        return null;
    }
}

// *** NEW: Get the exact snap point on an edge ***
getSnapPointOnEdge(edgeInfo, clickPoint) {
    const { startPoint, endPoint } = edgeInfo;
    
    // Calculate the projection of the click point onto the line segment
    const A = clickPoint.x - startPoint.x;
    const B = clickPoint.y - startPoint.y;
    const C = endPoint.x - startPoint.x;
    const D = endPoint.y - startPoint.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
        // Edge has zero length, snap to start point
        return { x: startPoint.x, y: startPoint.y };
    }
    
    let param = dot / lenSq;
    
    // Clamp parameter to stay within the line segment
    param = Math.max(0, Math.min(1, param));
    
    const snapPoint = {
        x: startPoint.x + param * C,
        y: startPoint.y + param * D
    };
    
    console.log('🎯 EDGE SNAP: Calculated snap point at:', snapPoint.x.toFixed(1), snapPoint.y.toFixed(1));
    console.log('🎯 EDGE SNAP: Parameter along edge:', param.toFixed(3));
    
    return snapPoint;
}

// *** NEW: Add snap point as permanent helper for future snapping ***
addSnapPointAsPermanentHelper(snapPoint) {
    // Initialize permanent helper points array if it doesn't exist
    if (!AppState.permanentHelperPoints) {
        AppState.permanentHelperPoints = [];
    }
    
    // Check if this point already exists (avoid duplicates)
    const existingPoint = AppState.permanentHelperPoints.find(p => 
        Math.abs(p.x - snapPoint.x) < 2 && Math.abs(p.y - snapPoint.y) < 2
    );
    
    if (!existingPoint) {
        const helperPoint = {
            x: snapPoint.x,
            y: snapPoint.y,
            source: 'edge_snap',
            pathId: Date.now()
        };
        
        AppState.permanentHelperPoints.push(helperPoint);
        console.log('🔗 SNAP HELPER: Added edge snap point as permanent helper at:', snapPoint.x.toFixed(1), snapPoint.y.toFixed(1));
    } else {
        console.log('🔗 SNAP HELPER: Edge snap point already exists as permanent helper');
    }
}

 
// *** ENHANCED: Update placeNextVertex with better snapping detection ***
  placeNextVertex(distance, angleDegrees) {
    // ... (the first part of the function is unchanged) ...
    let currentPoint;
    if (this.branchFromIndex !== null) {
        currentPoint = AppState.currentPolygonPoints[this.branchFromIndex];
    } else {
        currentPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1];
    }
    
    // ... (calculations for x, y, snapping are unchanged) ...
    const distanceInPixels = distance * this.PIXELS_PER_FOOT;
    const angleRadians = angleDegrees * (Math.PI / 180);
    const calculatedX = currentPoint.x + distanceInPixels * Math.cos(angleRadians);
    const calculatedY = currentPoint.y - distanceInPixels * Math.sin(angleRadians);
    const nearbyHelper = this.findNearbyHelper(calculatedX, calculatedY, 15);
    let finalX = calculatedX;
    let finalY = calculatedY;
    if (nearbyHelper) {
        finalX = nearbyHelper.x;
        finalY = nearbyHelper.y;
        console.log('🎯 SNAP: Calculated vertex snapped to helper point!');
    }

    // --- START MODIFICATION: Use the current prefix for the vertex name ---
    const prefix = this.pathPrefixes[this.currentPrefixIndex];
    const newPoint = {
        x: finalX,
        y: finalY,
        name: `${prefix}${AppState.currentPolygonCounter}`, // e.g., "p1", "q1", etc.
        snappedToHelper: !!nearbyHelper
    };
    // --- END MODIFICATION ---

    // ... (line extension logic is unchanged) ...
    if (AppState.currentPolygonPoints.length >= 2) {
        const prevPoint = currentPoint;
        const lastPointInArray = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1];
        if (prevPoint === lastPointInArray) {
            const pointBeforePrev = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 2];
            const prevDx = prevPoint.x - pointBeforePrev.x;
            const prevDy = prevPoint.y - pointBeforePrev.y;
            const prevAngleRadians = Math.atan2(-prevDy, prevDx);
            const prevAngleDegrees = (prevAngleRadians * 180 / Math.PI + 360) % 360;
            const currentAngleDegrees = (angleDegrees + 360) % 360;
            const angleDifference = Math.abs(currentAngleDegrees - prevAngleDegrees);
            const normalizedDifference = Math.min(angleDifference, 360 - angleDifference);
            if (normalizedDifference < 1) {
                AppState.currentPolygonPoints.pop();
                AppState.currentPolygonCounter--;
                newPoint.name = prevPoint.name;
            }
        }
    }

    // ... (rest of the function is unchanged) ...
    AppState.currentPolygonPoints.push(newPoint);
    AppState.currentPolygonCounter++;
    this.branchFromIndex = null;
    AppState.emit('app:drawingPointAdded', { point: newPoint });
    this.autoPanToPoint(finalX, finalY);
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