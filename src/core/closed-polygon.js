// src/core/closed-polygon.js
// This file consolidates logic for drawing, editing, and splitting polygons.
// Harvested from polygon.js, polysplit.js, enhanced-drawing.js, and other relevant files.

// --- Global Variables (harvested and consolidated) ---
let canvas, ctx;
let currentX = 0, currentY = 0;
let canvasOriginX = 0, canvasOriginY = 0;
let scale = 8; // Pixels per world unit (default, can be adjusted)
const CANVAS_PADDING = 100; // Original value from polygon.js

let polygons = [];
let currentPolygon = []; // Stores lines of the polygon being currently drawn
let editMode = false;
let drawingMode = false;
let waitingForStart = false; // True when "Start" is clicked, waiting for first point

let selectedLine = null;    // For editing a specific line
let selectedPolygon = null; // For editing/labeling a specific polygon

let isPanning = false;
let panStartX = 0, panStartY = 0;
let panStartCanvasOriginX = 0, panStartCanvasOriginY = 0;

let isDraggingPolygon = false;
let draggedPolygon = null;
let polygonDragStartWorld = { x: 0, y: 0 };
let polygonDragStartPoints = [];
let draggedRoomLabels = []; // From polygon.js, for moving labels with polygon
let polygonOriginalState = null; // For undoing polygon moves

// Touch handling variables
let touchStartTime = 0;
let touchStartPos = null;

// Mobile keyboard variables / Drawing input
let currentDistance = ''; // Stores the number input for distance

const directions = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  'up-left': { x: -0.7071, y: 0.7071 }, // Diagonal directions
  'up-right': { x: 0.7071, y: 0.7071 },
  'down-left': { x: -0.7071, y: -0.7071 },
  'down-right': { x: 0.7071, y: -0.7071 },
};

// Polygon splitting variables (from polysplit.js)
let splitMode = false;
let splitSourcePolygon = null;
let splitIntersectionPoints = [];
let splitSourceVertex = null;

// Debug labeling system for splitting (from polysplit.js)
let debugLabels = [];
let showDebugLabels = false;
let debugEdges = [];
let showDebugEdges = false;

// Action history for undo (simple version from polygon.js, may need merging with labels.js version later)
// For now, this will handle drawing and polygon manipulation undos.
let actionHistory = [];

// --- Initialization and Canvas Setup ---

// This function should be called from main.js to set up the canvas and event listeners
export function initClosedPolygonSystem(canvasId = 'drawingCanvas') {
  canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error(`Canvas element with ID '${canvasId}' not found.`);
    return;
  }
  ctx = canvas.getContext('2d');

  resizeCanvas(); // Initial resize
  window.addEventListener('resize', resizeCanvas);

  // Mouse events
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  canvas.addEventListener('click', handleCanvasClick); // For placing first point or labels

  // Touch events
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

  // Keyboard events
  document.addEventListener('keydown', handleKeyDown);

  // Initial UI updates
  updatePositionDisplay();
  updateLegend(); // Assumes legend elements exist
  updateDrawingState(); // Sets initial mode indicator and button states
  updateCursor();

  console.log("Closed Polygon System Initialized");
}

function resizeCanvas() {
  if (!canvas || !canvas.parentElement) return;
  const container = canvas.parentElement;
  const cW = container.clientWidth;
  const cH = container.clientHeight;
  canvas.width = cW;
  canvas.height = cH;

  // If canvasOriginX and canvasOriginY are 0, center the origin initially
  if (canvasOriginX === 0 && canvasOriginY === 0) {
    canvasOriginX = canvas.width / 2;
    canvasOriginY = canvas.height / 2;
  }
  redrawCanvas();
}

// --- Coordinate Transformation ---

function toCanvasCoords(worldX, worldY) {
  if (!canvas) return { x: 0, y: 0 };
  return {
    x: canvasOriginX + worldX * scale,
    y: canvasOriginY - worldY * scale // Y is inverted in canvas
  };
}

function toWorldCoords(canvasX, canvasY) {
  if (!canvas) return { x: 0, y: 0 };
  return {
    x: (canvasX - canvasOriginX) / scale,
    y: -(canvasY - canvasOriginY) / scale // Y is inverted in canvas
  };
}

// --- Event Position Helper ---

function getEventPos(event, targetElement) {
  targetElement = targetElement || canvas;
  if (!targetElement) return { x: 0, y: 0 };
  const rect = targetElement.getBoundingClientRect();
  let clientX, clientY;

  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else if (event.changedTouches && event.changedTouches.length > 0) {
    // Use changedTouches for touchend
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }
  return { x: clientX - rect.left, y: clientY - rect.top };
}

// --- Drawing State Management ---

export function startNewDrawing() {
  if (editMode && !confirm("Exit edit mode and start a new drawing? Any unsaved edits might be lost.")) {
      return;
  }
  if (drawingMode && !confirm("Cancel current drawing and start a new one?")) {
      return;
  }

  editMode = false;
  drawingMode = false;
  waitingForStart = true; // Key state for placing the first point
  currentPolygon = [];
  selectedLine = null;
  selectedPolygon = null;

  currentDistance = '';
  updateDistanceDisplay();
  hideDirectionalPad();
  showStartCursor(); // Show the red dot cursor
  updateDrawingState(); // This will call updateCursor
  redrawCanvas();
  console.log("Waiting to start new drawing...");
}

function cancelStartMode() {
  waitingForStart = false;
  drawingMode = false;
  hideStartCursor();
  currentDistance = '';
  updateDistanceDisplay();
  hideDirectionalPad();
  updateDrawingState();
  redrawCanvas();
}

function updateDrawingState() {
  const modeInd = document.getElementById('modeIndicator');
  const startBtn = document.getElementById('startBtn'); 

  if (!modeInd || !startBtn) {
    return;
  }

  if (splitMode) {
    modeInd.textContent = 'SPLIT MODE';
    modeInd.style.background = '#e74c3c'; 
    startBtn.textContent = 'Cancel Split';
    startBtn.onclick = exitSplitMode;
  } else if (typeof window.isPlacingLabel !== 'undefined' && window.isPlacingLabel) { 
    modeInd.textContent = 'CLICK TO PLACE';
    modeInd.style.background = '#9b59b6'; 
  } else if (waitingForStart) {
    modeInd.textContent = 'TAP TO START';
    modeInd.style.background = '#3498db'; 
    startBtn.textContent = 'Cancel';
    startBtn.onclick = cancelStartMode;
  } else if (drawingMode) {
    modeInd.textContent = 'DRAWING';
    modeInd.style.background = '#27ae60'; 
    startBtn.textContent = 'Start'; 
    startBtn.onclick = startNewDrawing; 
  } else if (editMode) {
    modeInd.textContent = 'EDIT MODE';
    modeInd.style.background = '#f39c12'; 
    startBtn.textContent = 'Start';
    startBtn.onclick = startNewDrawing;
  } else {
    modeInd.textContent = 'READY';
    modeInd.style.background = '#95a5a6'; 
    startBtn.textContent = 'Start';
    startBtn.onclick = startNewDrawing;
  }
  updateCursor();
}

// --- Cursor Management ---

function updateCursor() {
  if (!canvas) return;
  // Remove existing cursor classes
  canvas.classList.remove('panning', 'no-cursor', 'crosshair-cursor', 'drawing-mode', 'edit-mode', 'can-pan');

  if (isPanning || isDraggingPolygon) {
    canvas.classList.add('panning');
  } else if (waitingForStart) {
    canvas.classList.add('no-cursor'); // Hide system cursor, red dot is active
  } else if (drawingMode) {
    canvas.classList.add('crosshair-cursor'); // Explicitly set for drawing
  } else if (editMode) {
    canvas.classList.add('edit-mode');
  } else {
    canvas.classList.add('can-pan');
  }
}

function showStartCursor() {
  const customCursor = document.getElementById('customCursor');
  if (customCursor) {
    customCursor.style.cssText = `
      position: fixed;
      width: 12px;
      height: 12px;
      background: #e74c3c; /* Red */
      border: 2px solid white;
      border-radius: 50%;
      pointer-events: none; 
      z-index: 10000;
      transform: translate(-50%, -50%); 
      display: block;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
    `;
    customCursor.textContent = ''; 
    document.addEventListener('mousemove', updateStartCursorPosition);
  }
  if (canvas) canvas.classList.add('no-cursor'); // Hide system cursor
}

function updateStartCursorPosition(e) {
  const customCursor = document.getElementById('customCursor');
  if (customCursor && customCursor.style.display === 'block' && waitingForStart) {
    customCursor.style.left = e.clientX + 'px';
    customCursor.style.top = e.clientY + 'px';
  }
}

function hideStartCursor() {
  const customCursor = document.getElementById('customCursor');
  if (customCursor) {
    customCursor.style.display = 'none';
  }
  document.removeEventListener('mousemove', updateStartCursorPosition);
  if (canvas) canvas.classList.remove('no-cursor'); // Restore system cursor by removing class
  updateCursor(); // Re-apply appropriate cursor based on current mode
}


// --- Input Handling (Distance, Angle) ---
export function appendNumber(numStr) {
  if (!drawingMode && !waitingForStart) {
    showStartReminder(); 
    return;
  }
  if (numStr === '.' && currentDistance.includes('.')) return; 
  currentDistance += numStr;
  updateDistanceDisplay();
  if (currentDistance) showDirectionalPad();
}

export function deleteLastNumber() { 
  if (!drawingMode && !waitingForStart) return;
  currentDistance = currentDistance.slice(0, -1);
  updateDistanceDisplay();
  if (!currentDistance) hideDirectionalPad();
}

export function clearCurrentDistance() { 
  if (!drawingMode && !waitingForStart) return;
  currentDistance = '';
  updateDistanceDisplay();
  hideDirectionalPad();
}

export function handleEnterKey() { 
  if (currentDistance && (drawingMode || waitingForStart)) {
    drawLine('right');
  }
}

function updateDistanceDisplay() {
  const display = document.getElementById('distanceDisplay');
  if (display) {
    display.textContent = currentDistance ? currentDistance + ' ft' : '0 ft';
  }
}

function showDirectionalPad() {
  if ((drawingMode || waitingForStart) && currentDistance) {
    const pad = document.getElementById('directionalPad');
    if (pad) {
      pad.style.display = 'grid'; 
    }
  }
}

function hideDirectionalPad() {
  const pad = document.getElementById('directionalPad');
  if (pad) pad.style.display = 'none';
}

function showStartReminder() { 
  const modeIndicator = document.getElementById('modeIndicator');
  if (!modeIndicator) return;
  const originalText = modeIndicator.textContent;
  const originalBackground = modeIndicator.style.background;
  modeIndicator.textContent = 'CLICK START TO BEGIN';
  modeIndicator.style.background = '#e67e22'; 
  modeIndicator.style.color = 'white';
  setTimeout(() => {
    modeIndicator.textContent = originalText;
    modeIndicator.style.background = originalBackground;
    modeIndicator.style.color = '';
  }, 2000);
}

export function isAngleModeActive() {
  const angleDisplay = document.getElementById('angleDisplay');
  return angleDisplay ? !angleDisplay.classList.contains('hidden') && angleDisplay.style.display !== 'none' : false;
}

export function getAngleFromInput() {
  const angleDisplay = document.getElementById('angleDisplay');
  if (angleDisplay) {
    const value = angleDisplay.value.replace('°', '');
    const angle = parseFloat(value);
    return isNaN(angle) ? 0 : angle;
  }
  return 0;
}

function getDirectionFromAngle(angleDegrees, buttonDirection) { 
  let finalAngleDegrees;
  switch(buttonDirection) {
    case 'up-right': finalAngleDegrees = angleDegrees; break;
    case 'down-right': finalAngleDegrees = -angleDegrees; break;
    case 'up-left': finalAngleDegrees = 180 - angleDegrees; break;
    case 'down-left': finalAngleDegrees = 180 + angleDegrees; break;
    default: finalAngleDegrees = angleDegrees; 
  }
  const radians = (finalAngleDegrees * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}


// --- Core Drawing Logic ---
export function drawLine(directionKey) {
  if (!drawingMode && !waitingForStart) {
    alert('Please click "Start" or tap on the canvas to begin drawing.');
    return;
  }
  if (!currentDistance) {
    alert('Please enter a distance first.');
    return;
  }

  const dist = parseFloat(currentDistance);
  if (isNaN(dist) || dist <= 0) {
    alert('Please enter a valid positive distance.');
    return;
  }

  if (waitingForStart) {
      drawingMode = true;
      waitingForStart = false;
      hideStartCursor(); 
      updateDrawingState();
  }


  let dirVec;
  if (isAngleModeActive() && ['up-left', 'up-right', 'down-left', 'down-right'].includes(directionKey)) {
    const angle = getAngleFromInput();
    dirVec = getDirectionFromAngle(angle, directionKey);
  } else {
    dirVec = directions[directionKey];
  }

  if (!dirVec) {
    console.error("Invalid direction:", directionKey);
    return;
  }

  if (currentPolygon.length > 0) {
    const lastL = currentPolygon[currentPolygon.length - 1];
    if (lastL.direction === directionKey && !lastL.curved && !isAngleModeActive()) { 
      lastL.distance = parseFloat((lastL.distance + dist).toFixed(1));
      lastL.end.x += dirVec.x * dist;
      lastL.end.y += dirVec.y * dist;
      currentX = parseFloat(lastL.end.x.toFixed(4));
      currentY = parseFloat(lastL.end.y.toFixed(4));
      clearCurrentDistance();
      updatePositionDisplay();
      keepCurrentPointInView();
      if (splitMode) updateSplitIntersectionPoints();
      redrawCanvas();
      return;
    }
  }

  const startPt = { x: currentX, y: currentY };
  const endPt = {
    x: currentX + dirVec.x * dist,
    y: currentY + dirVec.y * dist
  };

  currentPolygon.push({
    start: startPt,
    end: endPt,
    distance: dist,
    direction: directionKey, 
    curved: false, 
    id: Date.now() + Math.random() 
  });

  actionHistory.push({ type: 'add_line', line: { ...currentPolygon[currentPolygon.length - 1] } });


  currentX = parseFloat(endPt.x.toFixed(4));
  currentY = parseFloat(endPt.y.toFixed(4));

  clearCurrentDistance();
  updatePositionDisplay();
  keepCurrentPointInView();
  if (splitMode) updateSplitIntersectionPoints();
  redrawCanvas();
}

export function closePolygon() {
  if (!drawingMode || currentPolygon.length < 2) {
    alert('Need at least 2 lines to close a polygon.');
    return;
  }

  const firstPt = currentPolygon[0].start;
  const lastPt = currentPolygon[currentPolygon.length - 1].end;

  if (Math.abs(firstPt.x - lastPt.x) > 0.01 || Math.abs(firstPt.y - lastPt.y) > 0.01) {
    const closingDist = calculateDistance(lastPt, firstPt);
    currentPolygon.push({
      start: { ...lastPt },
      end: { ...firstPt },
      distance: closingDist,
      direction: 'closing',
      curved: false,
      id: Date.now() + Math.random()
    });
  }

  const newPolygonArea = calculatePolygonArea(currentPolygon);
  const newPolygonCentroid = calculateCentroid(currentPolygon);

  const newPoly = {
    lines: [...currentPolygon], 
    area: newPolygonArea,
    label: `Area ${polygons.length + 1}`,
    includeInGLA: true, 
    type: 'living',     
    id: Date.now(),
    centroid: newPolygonCentroid,
    isOpen: false 
  };
  polygons.push(newPoly);
  actionHistory.push({ type: 'add_polygon', polygon: { ...newPoly, lines: newPoly.lines.map(l => ({...l})) } });


  currentPolygon = [];
  drawingMode = false;
  selectedPolygon = newPoly; 

  clearCurrentDistance();
  updateDrawingState();
  updatePositionDisplay();
  updateLegend();
  redrawCanvas();

  const polygonNameInput = document.getElementById('polygonName');
  const polygonTypeSelect = document.getElementById('polygonType');
  const includeInGLACheckbox = document.getElementById('includeInGLA');
  const polygonModal = document.getElementById('polygonModal');

  if (polygonNameInput && polygonTypeSelect && includeInGLACheckbox && polygonModal) {
    polygonNameInput.value = newPoly.label;
    polygonTypeSelect.value = newPoly.type;
    includeInGLACheckbox.checked = newPoly.includeInGLA;
    polygonModal.style.display = 'flex';
  } else {
    console.warn("Polygon labeling modal elements not found.");
  }
}

// --- Mouse and Touch Event Handlers ---
function handleMouseDown(e) {
  e.preventDefault(); 
  const mousePosCanvas = getEventPos(e);
  const worldPos = toWorldCoords(mousePosCanvas.x, mousePosCanvas.y);

  if (e.button === 2) { 
      isPanning = true;
      panStartX = mousePosCanvas.x;
      panStartY = mousePosCanvas.y;
      panStartCanvasOriginX = canvasOriginX;
      panStartCanvasOriginY = canvasOriginY;
      updateCursor();
      return;
  }

  if (waitingForStart) {
    currentX = worldPos.x;
    currentY = worldPos.y;
    drawingMode = true;
    waitingForStart = false;
    hideStartCursor(); 
    updateDrawingState();
    updatePositionDisplay();
    if (currentDistance) showDirectionalPad(); 
    redrawCanvas();
    console.log("Drawing started at:", currentX, currentY);
    return;
  }

  // Predictive snapping logic
  if (drawingMode && !isPanning && !isDraggingPolygon) {
      const snapThreshold = 12 / scale; 

      const completionPoints = getPredictiveCompletionPoints();
      for (let point of completionPoints) {
          if (calculateDistance(worldPos, point) < snapThreshold) {
              console.log("Clicked predictive completion point:", point.type);
              completeShapeToPoint(point); 
              return; 
          }
      }

      const edgeSnapPoints = getEdgeSnapPoints();
      for (let snapPoint of edgeSnapPoints) {
          if (calculateDistance(worldPos, snapPoint) < snapThreshold) {
              console.log("Clicked edge snap point.");
              completeUsingSharedEdge(snapPoint); 
              return; 
          }
      }
  }


  if (editMode) {
    for (let p of polygons) {
      for (let l of p.lines) {
        if (isPointNearLine(worldPos, l)) {
          selectedLine = l;
          selectedPolygon = p; 
          showLineEditModal(l); 
          redrawCanvas();
          return;
        }
      }
    }

    for (let p of polygons) {
      if (isPointInPolygon(worldPos, p.lines)) {
        isDraggingPolygon = true;
        draggedPolygon = p;
        selectedPolygon = p;
        polygonDragStartWorld = { x: worldPos.x, y: worldPos.y };
        polygonDragStartPoints = p.lines.map(line => ({
            start: { ...line.start },
            end: { ...line.end }
        }));
        polygonOriginalState = {
            polygonId: p.id,
            lines: p.lines.map(line => ({ ...line, start: {...line.start}, end: {...line.end} })),
            centroid: { ...p.centroid },
            area: p.area,
        };

        draggedRoomLabels = [];
        if (typeof roomLabels !== 'undefined' && Array.isArray(roomLabels)) { 
            roomLabels.forEach((label, index) => {
                if (isPointInPolygon({ x: label.x, y: label.y }, p.lines)) {
                    draggedRoomLabels.push({ index: index, startX: label.x, startY: label.y });
                }
            });
        }
        updateCursor();
        redrawCanvas();
        return;
      }
    }
     for (let p of polygons) {
        if (p.isOpen && p.openEndpoints && p.openEndpoints.length === 2) {
            const threshold = 15 / scale; 
            const endpoint1 = p.openEndpoints[0];
            const endpoint2 = p.openEndpoints[1];

            if (calculateDistance(worldPos, endpoint1) < threshold) {
                currentPolygon = rebuildPolygonFromEndpoint(p.lines, endpoint2, endpoint1); 
                currentX = endpoint1.x; currentY = endpoint1.y;
                polygons = polygons.filter(poly => poly.id !== p.id); 
                drawingMode = true; editMode = false;
                updateDrawingState(); updatePositionDisplay(); redrawCanvas(); return;
            }
            if (calculateDistance(worldPos, endpoint2) < threshold) {
                currentPolygon = rebuildPolygonFromEndpoint(p.lines, endpoint1, endpoint2); 
                currentX = endpoint2.x; currentY = endpoint2.y;
                polygons = polygons.filter(poly => poly.id !== p.id);
                drawingMode = true; editMode = false;
                updateDrawingState(); updatePositionDisplay(); redrawCanvas(); return;
            }
        }
    }

    if (splitMode && typeof splitIntersectionPoints !== 'undefined' && splitIntersectionPoints.length > 0) {
        const threshold = 10 / scale;
        for (let point of splitIntersectionPoints) {
            if (calculateDistance(worldPos, point) < threshold) {
                handleSplitPointClick(point); 
                return;
            }
        }
    }
    if (!splitMode && !drawingMode && !waitingForStart) { 
        const threshold = 10 / scale;
        for (let polygon of polygons) {
            if (polygon.isOpen) continue;
            for (let line of polygon.lines) { 
                if (calculateDistance(worldPos, line.start) < threshold) {
                    startSplitMode(polygon, line.start); 
                    return;
                }
            }
        }
    }

  } else if (!drawingMode && !waitingForStart) {
    isPanning = true;
    panStartX = mousePosCanvas.x;
    panStartY = mousePosCanvas.y;
    panStartCanvasOriginX = canvasOriginX;
    panStartCanvasOriginY = canvasOriginY;
    updateCursor();
  }
}

function handleMouseMove(e) {
  e.preventDefault();
  const mousePosCanvas = getEventPos(e);

  if (isPanning) {
    const deltaX = mousePosCanvas.x - panStartX;
    const deltaY = mousePosCanvas.y - panStartY;
    canvasOriginX = panStartCanvasOriginX + deltaX;
    canvasOriginY = panStartCanvasOriginY + deltaY;
    redrawCanvas();
    return;
  }

  if (isDraggingPolygon && draggedPolygon) {
    const worldPos = toWorldCoords(mousePosCanvas.x, mousePosCanvas.y);
    const deltaWorldX = worldPos.x - polygonDragStartWorld.x;
    const deltaWorldY = worldPos.y - polygonDragStartWorld.y;

    draggedPolygon.lines.forEach((line, index) => {
      line.start.x = polygonDragStartPoints[index].start.x + deltaWorldX;
      line.start.y = polygonDragStartPoints[index].start.y + deltaWorldY;
      line.end.x = polygonDragStartPoints[index].end.x + deltaWorldX;
      line.end.y = polygonDragStartPoints[index].end.y + deltaWorldY;
    });
    draggedPolygon.centroid = calculateCentroid(draggedPolygon.lines);

    if (typeof roomLabels !== 'undefined' && Array.isArray(roomLabels)) {
        draggedRoomLabels.forEach(labelInfo => {
            if (roomLabels[labelInfo.index]) {
                roomLabels[labelInfo.index].x = labelInfo.startX + deltaWorldX;
                roomLabels[labelInfo.index].y = labelInfo.startY + deltaWorldY;
            }
        });
    }
    redrawCanvas();
  }

  if (drawingMode || waitingForStart) {
      const worldPos = toWorldCoords(mousePosCanvas.x, mousePosCanvas.y);
      const currentPosEl = document.getElementById('currentPos'); 
      if (currentPosEl) {
          currentPosEl.textContent = `Pos: (${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)})`;
      }
      if (splitMode) { 
          currentX = worldPos.x;
          currentY = worldPos.y;
          updateSplitIntersectionPoints(); 
          redrawCanvas(); 
      }
  }
}

function handleMouseUp(e) {
  e.preventDefault();
  if (isPanning) {
    isPanning = false;
    updateCursor();
  }
  if (isDraggingPolygon) {
    if (polygonOriginalState && draggedPolygon) {
        let hasMoved = false;
        const dx = draggedPolygon.centroid.x - polygonOriginalState.centroid.x;
        const dy = draggedPolygon.centroid.y - polygonOriginalState.centroid.y;
        if (Math.sqrt(dx*dx + dy*dy) > 0.1) { 
            hasMoved = true;
        }

        if(hasMoved){
            actionHistory.push({
                type: 'move_polygon',
                data: { 
                    polygonId: draggedPolygon.id,
                    originalLines: polygonOriginalState.lines.map(l => ({...l, start: {...l.start}, end: {...l.end}})),
                    originalCentroid: {...polygonOriginalState.centroid},
                },
                newData: { 
                    finalLines: draggedPolygon.lines.map(l => ({...l, start: {...l.start}, end: {...l.end}})),
                    finalCentroid: {...draggedPolygon.centroid},
                }
            });
        }
    }

    isDraggingPolygon = false;
    draggedPolygon = null;
    draggedRoomLabels = [];
    polygonOriginalState = null;
    updateLegend(); 
    updateCursor();
    redrawCanvas();
  }
}

function handleMouseLeave(e) {
  if (isPanning) {
    isPanning = false;
    updateCursor();
  }
  if (isDraggingPolygon) {
    if (polygonOriginalState && draggedPolygon) {
         actionHistory.push({ type: 'move_polygon', data: polygonOriginalState });
    }
    isDraggingPolygon = false;
    draggedPolygon = null;
    draggedRoomLabels = [];
    polygonOriginalState = null;
    updateLegend();
    updateCursor();
    redrawCanvas();
  }
}

function handleCanvasClick(e) {
    const mousePosCanvas = getEventPos(e);
    const worldPos = toWorldCoords(mousePosCanvas.x, mousePosCanvas.y);

    if (waitingForStart) {
        currentX = worldPos.x;
        currentY = worldPos.y;
        drawingMode = true;
        waitingForStart = false;
        hideStartCursor(); 
        updateDrawingState();
        updatePositionDisplay();
        if (currentDistance) showDirectionalPad();
        redrawCanvas();
        console.log("Drawing started via canvas click at:", currentX, currentY);
        return;
    }

    if (splitMode && splitIntersectionPoints.length > 0) {
        const threshold = 10 / scale;
        for (let point of splitIntersectionPoints) {
            if (calculateDistance(worldPos, point) < threshold) {
                handleSplitPointClick(point);
                return;
            }
        }
    }

    if (typeof window.selectedLabelToPlace !== 'undefined' && window.selectedLabelToPlace &&
        typeof window.isPlacingLabel !== 'undefined' && window.isPlacingLabel) {

        const isIcon = (typeof window.selectedIconType !== 'undefined' && window.selectedIconType);

        if (isIcon) {
            const newIcon = {
                id: Date.now(), 
                text: window.selectedLabelToPlace,
                x: worldPos.x,
                y: worldPos.y,
                iconType: window.selectedIconType,
                imageData: window.selectedIconImageData,
                canvasSize: window.selectedIconCanvasSize
            };
            if (typeof floorIcons !== 'undefined') floorIcons.push(newIcon); 
            else console.warn("floorIcons array not found for icon placement.");
            actionHistory.push({ type: 'add_icon', iconData: { ...newIcon } });
        } else {
            const newLabel = {
                id: Date.now(), 
                text: window.selectedLabelToPlace,
                x: worldPos.x,
                y: worldPos.y
            };
            if (typeof roomLabels !== 'undefined') roomLabels.push(newLabel); 
            else console.warn("roomLabels array not found for label placement.");
            actionHistory.push({ type: 'add_label', labelData: { ...newLabel } });
        }

        window.selectedLabelToPlace = null;
        window.isPlacingLabel = false;
        if (isIcon) {
            window.selectedIconType = null;
            window.selectedIconImageData = null;
            window.selectedIconCanvasSize = null;
        }
        if (typeof hideCustomCursor === 'function') hideCustomCursor(); 

        if (typeof window.setMode === 'function') {
            window.setMode('rooms'); 
        } else if (typeof window.restorePaletteForMode === 'function') {
            window.restorePaletteForMode(window.currentMode || 'rooms');
        }

        redrawCanvas();
        updateLegend();
        return;
    }
}


// --- Touch Handlers (delegating to mouse handlers for simplicity) ---
function handleTouchStart(e) {
  if (e.touches.length === 1) { 
    touchStartTime = Date.now();
    touchStartPos = getEventPos(e); 
    handleMouseDown(e); 
  }
}

function handleTouchMove(e) {
  if (e.touches.length === 1) {
    handleMouseMove(e); 
  }
}

function handleTouchEnd(e) {
  const touchDuration = Date.now() - touchStartTime;
  const touchEndPos = getEventPos(e); 

  if (touchStartPos && e.changedTouches.length === 1) {
    const dx = Math.abs(touchEndPos.x - touchStartPos.x);
    const dy = Math.abs(touchEndPos.y - touchStartPos.y);

    if (touchDuration < 250 && dx < 10 && dy < 10) {
      const clickEvent = new MouseEvent('click', {
          clientX: e.changedTouches[0].clientX,
          clientY: e.changedTouches[0].clientY,
          bubbles: true,
          cancelable: true,
          view: window
      });
      handleCanvasClick(e); 
    }
  }
  handleMouseUp(e); 
  touchStartPos = null; 
}


// --- Keyboard Handler ---
function handleKeyDown(e) {
  if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
    return;
  }

  if ((drawingMode || waitingForStart) && e.key >= '0' && e.key <= '9') {
    appendNumber(e.key);
    e.preventDefault();
    return;
  }
  if ((drawingMode || waitingForStart) && e.key === '.') {
    appendNumber('.');
    e.preventDefault();
    return;
  }

  if ((drawingMode || waitingForStart) && currentDistance) {
    switch (e.key) {
      case 'ArrowUp': drawLine('up'); e.preventDefault(); break;
      case 'ArrowDown': drawLine('down'); e.preventDefault(); break;
      case 'ArrowLeft': drawLine('left'); e.preventDefault(); break;
      case 'ArrowRight': drawLine('right'); e.preventDefault(); break;
    }
  }

  switch (e.key) {
    case 'Backspace':
    case 'Delete':
      if (drawingMode || waitingForStart) {
        deleteLastNumber();
        e.preventDefault();
      } else if (editMode && selectedLine) {
        e.preventDefault();
      } else if (editMode && selectedPolygon) {
        e.preventDefault();
      }
      break;
    case 'Enter':
      if ((drawingMode || waitingForStart) && currentDistance) {
        handleEnterKey();
        e.preventDefault();
      } else if (drawingMode && currentPolygon.length > 1) {
        closePolygon(); 
        e.preventDefault();
      }
      break;
    case 'Escape':
      if (drawingMode || waitingForStart) {
        if (currentDistance) {
            clearCurrentDistance();
        } else if (currentPolygon.length > 0) {
            undoLast(); 
        } else {
            cancelStartMode(); 
        }
        e.preventDefault();
      } else if (editMode) {
        selectedLine = null;
        selectedPolygon = null;
        closeLineEditModal(); 
        closePolygonModal();  
        if(typeof hideTypeContextMenu === 'function') hideTypeContextMenu(); 
        if(splitMode) exitSplitMode(); 

        redrawCanvas();
        e.preventDefault();
      }
      break;
    case 's': 
      if (e.ctrlKey || e.metaKey) return; 
      if (!drawingMode && !waitingForStart && !editMode) startNewDrawing();
      else if (drawingMode && currentPolygon.length > 1) closePolygon();
      else if (waitingForStart) cancelStartMode();
      e.preventDefault();
      break;
    case 'e': 
       if (e.ctrlKey || e.metaKey) return;
       toggleEditMode();
       e.preventDefault();
       break;
    case 'z': 
        if (e.ctrlKey || e.metaKey) {
            undoLast();
            e.preventDefault();
        }
        break;
  }
}


// --- Polygon Calculations ---
function calculateDistance(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function calculatePolygonArea(lines) {
  if (!lines || lines.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < lines.length; i++) {
    const p1 = lines[i].start;
    const p2 = lines[i].end; 
    area += (p1.x * p2.y) - (p2.x * p1.y);
  }
  return Math.abs(area) / 2;
}

function calculateCentroid(lines) {
  if (!lines || lines.length === 0) return { x: 0, y: 0 };
  let sumX = 0, sumY = 0;
  lines.forEach(l => {
    sumX += l.start.x;
    sumY += l.start.y;
  });
  return {
    x: sumX / lines.length,
    y: sumY / lines.length
  };
}

// --- Collision/Point Checks ---
function isPointNearLine(pt, line, threshold) {
  threshold = threshold || (10 / scale); 
  const { start: s, end: e } = line;
  const lenSq = Math.pow(e.x - s.x, 2) + Math.pow(e.y - s.y, 2);
  if (lenSq === 0) return calculateDistance(pt, s) < threshold; 

  let t = ((pt.x - s.x) * (e.x - s.x) + (pt.y - s.y) * (e.y - s.y)) / lenSq;
  t = Math.max(0, Math.min(1, t)); 

  const closestX = s.x + t * (e.x - s.x);
  const closestY = s.y + t * (e.y - s.y);
  return calculateDistance(pt, { x: closestX, y: closestY }) < threshold;
}

function isPointInPolygon(pt, lines) {
  if (!lines || lines.length < 3) return false;
  let inside = false;
  for (let i = 0, j = lines.length - 1; i < lines.length; j = i++) {
    const pi = lines[i].start;
    const pj = lines[j].start; 
    if (((pi.y > pt.y) !== (pj.y > pt.y)) &&
        (pt.x < (pj.x - pi.x) * (pt.y - pi.y) / (pj.y - pi.y) + pi.x)) {
      inside = !inside;
    }
  }
  return inside;
}


// --- Predictive Drawing & Snapping (from polygon.js) ---
function getEdgeSnapPoints() {
    if (currentPolygon.length < 1) return [];
    const snapPoints = [];
    const currentPoint = { x: currentX, y: currentY };
    const maxSnapDistance = 50 / scale; 

    polygons.forEach(polygon => {
        polygon.lines.forEach(line => {
            const closestPoint = getClosestPointOnLineSegment(currentPoint, line); 
            const distance = calculateDistance(closestPoint, currentPoint);
            if (distance <= maxSnapDistance && distance > 0.1 / scale) { 
                snapPoints.push({
                    x: closestPoint.x, y: closestPoint.y,
                    sourcePolygon: polygon, sourceLine: line, distance: distance
                });
            }
        });
    });
    return snapPoints.sort((a, b) => a.distance - b.distance).slice(0, 3); 
}

function getClosestPointOnLineSegment(point, line) { 
    const { start: s, end: e } = line;
    const lenSq = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
    if (lenSq === 0) return { x: s.x, y: s.y };
    let t = ((point.x - s.x) * (e.x - s.x) + (point.y - s.y) * (e.y - s.y)) / lenSq;
    t = Math.max(0, Math.min(1, t)); 
    return { x: s.x + t * (e.x - s.x), y: s.y + t * (e.y - s.y) };
}

function getPredictiveCompletionPoints() {
    if (currentPolygon.length < 2) return [];
    const completionPoints = [];
    const startPoint = currentPolygon[0].start;
    const currentPoint = { x: currentX, y: currentY };

    completionPoints.push({ x: startPoint.x, y: currentPoint.y, type: 'rect_align_y' });
    completionPoints.push({ x: currentPoint.x, y: startPoint.y, type: 'rect_align_x' });

    const firstLine = currentPolygon[0];
    const secondLine = currentPolygon[1];
    const firstAngle = Math.atan2(firstLine.end.y - firstLine.start.y, firstLine.end.x - firstLine.start.x);
    const secondAngle = Math.atan2(secondLine.end.y - secondLine.start.y, secondLine.end.x - secondLine.start.x);
    let angleDiff = secondAngle - firstAngle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    const thirdAngle = firstAngle; 
    const thirdLength = calculateDistance(secondLine.end, startPoint);
    const parallelogramPoint = {
        x: currentPoint.x + Math.cos(thirdAngle) * thirdLength,
        y: currentPoint.y + Math.sin(thirdAngle) * thirdLength,
        type: 'parallelogram'
    };
    if (calculateDistance(parallelogramPoint, currentPoint) > 0.1 / scale) {
        completionPoints.push(parallelogramPoint);
    }

    const firstLength = calculateDistance(firstLine.start, firstLine.end);
    const secondLength = calculateDistance(secondLine.start, secondLine.end);
    if (Math.abs(firstLength - secondLength) < 0.1 / scale) {
        const rhombusAngle = firstAngle + angleDiff;
        const rhombusPoint = {
            x: currentPoint.x + Math.cos(rhombusAngle) * firstLength,
            y: currentPoint.y + Math.sin(rhombusAngle) * firstLength,
            type: 'rhombus'
        };
        if (calculateDistance(rhombusPoint, currentPoint) > 0.1 / scale) {
            completionPoints.push(rhombusPoint);
        }
    }
    return completionPoints.filter(p => calculateDistance(p, currentPoint) > 0.1 / scale); 
}

function completeUsingSharedEdge(snapPoint) {
    const currentPoint = { x: currentX, y: currentY };
    const startPoint = currentPolygon[0].start;
    const distToSnap = calculateDistance(snapPoint, currentPoint);

    if (distToSnap > 0.1 / scale) {
        const dx = snapPoint.x - currentPoint.x;
        const dy = snapPoint.y - currentPoint.y;
        let direction = 'custom'; 
        if (Math.abs(dx) > Math.abs(dy)) direction = dx > 0 ? 'right' : 'left';
        else direction = dy > 0 ? 'up' : 'down';

        currentPolygon.push({
            start: { ...currentPoint }, end: { ...snapPoint },
            distance: distToSnap, direction: direction, curved: false, id: Date.now() + Math.random()
        });
        currentX = snapPoint.x; currentY = snapPoint.y;
    }

    const distanceToOriginalStart = calculateDistance(snapPoint, startPoint);
    if (distanceToOriginalStart > 0.1 / scale) {
         currentPolygon.push({
            start: { ...snapPoint }, end: { ...startPoint },
            distance: distanceToOriginalStart, direction: 'shared-closing', curved: false,
            id: Date.now() + Math.random(), isSharedEdge: true, sharedWith: snapPoint.sourcePolygon.id
        });
        closePolygon(); 
    } else {
        closePolygon();
    }
    updatePositionDisplay(); redrawCanvas();
}

function completeShapeToPoint(targetPoint) {
    const currentPoint = { x: currentX, y: currentY };
    if (Math.abs(currentPoint.x - targetPoint.x) > 0.1 / scale) {
        const dist = Math.abs(targetPoint.x - currentPoint.x);
        const direction = targetPoint.x > currentPoint.x ? 'right' : 'left';
        currentPolygon.push({
            start: { ...currentPoint }, end: { x: targetPoint.x, y: currentY },
            distance: dist, direction: direction, curved: false, id: Date.now() + Math.random()
        });
        currentX = targetPoint.x; 
    }
    if (Math.abs(currentY - targetPoint.y) > 0.1 / scale) {
        const dist = Math.abs(targetPoint.y - currentY);
        const direction = targetPoint.y > currentY ? 'up' : 'down';
        currentPolygon.push({
            start: { x: currentX, y: currentY }, end: { x: currentX, y: targetPoint.y },
            distance: dist, direction: direction, curved: false, id: Date.now() + Math.random()
        });
        currentY = targetPoint.y; 
    }
    updatePositionDisplay();
    const startPoint = currentPolygon[0].start;
    if (calculateDistance({x: currentX, y: currentY}, startPoint) < 0.1 / scale) {
        closePolygon();
    } else {
        redrawCanvas();
    }
}


// --- UI Updates ---
function updatePositionDisplay() {
  const posEl = document.getElementById('currentPos'); 
  if (posEl) {
    posEl.textContent = `Pos: (${currentX.toFixed(1)}, ${currentY.toFixed(1)})`;
  }
}

function keepCurrentPointInView() {
  if (!canvas || typeof currentX === 'undefined' || typeof currentY === 'undefined') return;
  const margin = CANVAS_PADDING / scale; 
  const pos = toCanvasCoords(currentX, currentY);

  let dx = 0, dy = 0;
  if (pos.x < CANVAS_PADDING) dx = CANVAS_PADDING - pos.x;
  if (pos.x > canvas.width - CANVAS_PADDING) dx = (canvas.width - CANVAS_PADDING) - pos.x;
  if (pos.y < CANVAS_PADDING) dy = CANVAS_PADDING - pos.y;
  if (pos.y > canvas.height - CANVAS_PADDING) dy = (canvas.height - CANVAS_PADDING) - pos.y;

  if (dx !== 0 || dy !== 0) {
    canvasOriginX += dx;
    canvasOriginY += dy;
    redrawCanvas();
  }
}

export function updateLegend() {
  const legendGLAEl = document.getElementById('legendGLA');
  const legendNonLivingEl = document.getElementById('legendNonLiving');
  const legendBedroomsEl = document.getElementById('legendBedrooms');
  const legendBathroomsEl = document.getElementById('legendBathrooms');
  const glaBreakdownEl = document.getElementById('legendGLABreakdown');
  const nonGLABreakdownEl = document.getElementById('legendNonGLABreakdown');

  if (!legendGLAEl) { return; }

  const totalGLA = polygons.reduce((sum, p) => p.includeInGLA ? sum + p.area : sum, 0);
  const nonGLA = polygons.reduce((sum, p) => !p.includeInGLA ? sum + p.area : sum, 0);

  const bedCount = (typeof roomLabels !== 'undefined' && Array.isArray(roomLabels)) ? roomLabels.filter(rl => rl.text === 'Bedroom' || rl.text === 'Bedroom.M').length : 0;
  let bathCount = 0;
  if (typeof roomLabels !== 'undefined' && Array.isArray(roomLabels)) {
    roomLabels.forEach(rl => {
      if (rl.text === 'Bath' || rl.text === 'Bath.M') bathCount += 1;
      else if (rl.text === '1/2 Bath') bathCount += 0.5;
    });
  }

  legendGLAEl.textContent = totalGLA.toFixed(1);
  if (legendNonLivingEl) legendNonLivingEl.textContent = nonGLA.toFixed(1);
  if (legendBedroomsEl) legendBedroomsEl.textContent = bedCount.toString();
  if (legendBathroomsEl) legendBathroomsEl.textContent = bathCount.toString();

  if (glaBreakdownEl) glaBreakdownEl.innerHTML = '';
  if (nonGLABreakdownEl) nonGLABreakdownEl.innerHTML = '';

  polygons.forEach(p => {
    const div = document.createElement('div');
    div.textContent = `${p.label}: ${p.area.toFixed(1)} sq ft`;
    if (p.includeInGLA && glaBreakdownEl) glaBreakdownEl.appendChild(div);
    else if (nonGLABreakdownEl) nonGLABreakdownEl.appendChild(div);
  });
}


// --- Drawing Functions ---

function drawGrid() {
  if (!ctx || !canvas) return;
  ctx.strokeStyle = '#ecf0f1'; 
  ctx.lineWidth = 1;
  const gridSize = 5 * scale; 

  const worldTopLeft = toWorldCoords(0, 0);
  const worldBottomRight = toWorldCoords(canvas.width, canvas.height);

  const startGridX = Math.floor(worldTopLeft.x / 5) * 5;
  const endGridX = Math.ceil(worldBottomRight.x / 5) * 5;
  const startGridY = Math.floor(worldBottomRight.y / 5) * 5; 
  const endGridY = Math.ceil(worldTopLeft.y / 5) * 5;    

  for (let x = startGridX; x <= endGridX; x += 5) {
    const canvasX = toCanvasCoords(x, 0).x;
    ctx.beginPath();
    ctx.moveTo(canvasX, 0);
    ctx.lineTo(canvasX, canvas.height);
    ctx.stroke();
  }
  for (let y = startGridY; y <= endGridY; y += 5) {
    const canvasY = toCanvasCoords(0, y).y;
    ctx.beginPath();
    ctx.moveTo(0, canvasY);
    ctx.lineTo(canvas.width, canvasY);
    ctx.stroke();
  }
}

const DRAWING_CONFIG = {
  externalLabels: {
    enabled: true, distance: 15, fontSize: 10,
    color: '#2c3e50', backgroundColor: 'rgba(255, 255, 255, 0.8)', padding: 2
  },
  smartEdges: {
    enabled: true, snapDistance: 0.5,
    transparencyLevel: 0.3, highlightColor: '#3498db'
  }
};

function drawLinesEnhanced(lines, isParentSelected, strokeColor, strokeWidth, centroid) {
  if (!ctx || !lines || lines.length === 0) return;

  lines.forEach((line, index) => {
    const isLineSelected = selectedLine === line;
    const startPt = toCanvasCoords(line.start.x, line.start.y);
    const endPt = toCanvasCoords(line.end.x, line.end.y);
    let finalAlpha = 1; 

    ctx.save();
    ctx.globalAlpha = finalAlpha;
    ctx.strokeStyle = isLineSelected ? '#f39c12' : strokeColor;
    ctx.lineWidth = isLineSelected ? 4 : strokeWidth;
    ctx.beginPath();
    ctx.moveTo(startPt.x, startPt.y);

    if (line.curved) {
       const cp = { x: (startPt.x + endPt.x) / 2, y: (startPt.y + endPt.y) / 2 - (line.curved === 'out' ? -20 : 20) }; 
      ctx.quadraticCurveTo(cp.x, cp.y, endPt.x, endPt.y);
    } else {
      ctx.lineTo(endPt.x, endPt.y);
    }
    ctx.stroke();
    ctx.restore();

    if (DRAWING_CONFIG.externalLabels.enabled ) {
      drawExternalLabel(line, startPt, endPt);
    }
  });
}

function drawExternalLabel(line, startPt, endPt) { 
  const config = DRAWING_CONFIG.externalLabels;
  const midX = (startPt.x + endPt.x) / 2;
  const midY = (startPt.y + endPt.y) / 2;
  const lineVector = { x: endPt.x - startPt.x, y: endPt.y - startPt.y };
  const lineLength = Math.sqrt(lineVector.x ** 2 + lineVector.y ** 2);
  if (lineLength === 0) return;

  const normalizedLine = { x: lineVector.x / lineLength, y: lineVector.y / lineLength };
  const perpendicular = { x: -normalizedLine.y, y: normalizedLine.x }; 

  const labelX = midX + perpendicular.x * config.distance;
  const labelY = midY + perpendicular.y * config.distance;
  const labelText = `${line.distance.toFixed(1)}'`;

  ctx.save();
  ctx.font = `${config.fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textMetrics = ctx.measureText(labelText);
  const textWidth = textMetrics.width;
  const textHeight = config.fontSize;

  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(labelX - textWidth / 2 - config.padding, labelY - textHeight / 2 - config.padding,
               textWidth + config.padding * 2, textHeight + config.padding * 2);
  ctx.fillStyle = config.color;
  ctx.fillText(labelText, labelX, labelY);
  ctx.restore();
}


function drawPolygonEnhanced(polygon) { 
  if (!ctx) return;
  const isSelected = selectedPolygon === polygon;
  const isDragged = draggedPolygon === polygon;

  ctx.fillStyle = polygon.includeInGLA ? 'rgba(39, 174, 96, 0.1)' : 'rgba(149, 165, 166, 0.1)';
  ctx.beginPath();
  if (polygon.lines.length === 0) return;
  const firstPt = toCanvasCoords(polygon.lines[0].start.x, polygon.lines[0].start.y);
  ctx.moveTo(firstPt.x, firstPt.y);
  polygon.lines.forEach(l => {
    const endPt = toCanvasCoords(l.end.x, l.end.y);
    if (l.curved) {
      const startPt = toCanvasCoords(l.start.x, l.start.y);
      const cp = { x: (startPt.x + endPt.x) / 2, y: (startPt.y + endPt.y) / 2 - (l.curved === 'out' ? -20 : 20) };
      ctx.quadraticCurveTo(cp.x, cp.y, endPt.x, endPt.y);
    } else {
      ctx.lineTo(endPt.x, endPt.y);
    }
  });
  ctx.closePath();
  ctx.fill();

  const strokeColor = isDragged ? '#2c3e50' : isSelected ? '#e74c3c' : polygon.includeInGLA ? '#27ae60' : '#95a5a6';
  const strokeWidth = isDragged ? 4 : isSelected ? 3 : 2;
  drawLinesEnhanced(polygon.lines, isSelected, strokeColor, strokeWidth, polygon.centroid);
}


export function redrawCanvas() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  polygons.forEach(p => {
    drawPolygonEnhanced(p); 
  });

  if (currentPolygon.length > 0) {
    drawLinesEnhanced(currentPolygon, false, '#3498db', 3); 
  }

  if (drawingMode || waitingForStart) {
    const pos = toCanvasCoords(currentX, currentY);
    ctx.fillStyle = '#e74c3c'; 
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5, 0, 2 * Math.PI); 
    ctx.fill();
  }

  if (drawingMode && currentPolygon.length >= 1) { 
    const completionPoints = getPredictiveCompletionPoints();
    completionPoints.forEach(point => {
        const pos = toCanvasCoords(point.x, point.y);
        ctx.fillStyle = '#e67e22'; ctx.strokeStyle = '#d35400'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    });

    const edgeSnapPoints = getEdgeSnapPoints();
    edgeSnapPoints.forEach(point => {
        const pos = toCanvasCoords(point.x, point.y);
        ctx.fillStyle = '#9b59b6'; ctx.strokeStyle = '#8e44ad'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    });
  }

  if (splitMode && splitIntersectionPoints.length > 0) {
    splitIntersectionPoints.forEach(point => {
      const pos = toCanvasCoords(point.x, point.y);
      ctx.fillStyle = '#e74c3c'; ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    });
    if (splitSourcePolygon) { 
        const currentPosCanvas = toCanvasCoords(currentX, currentY);
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.3)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
        if(splitSourceVertex) {
            const sourceVertexCanvas = toCanvasCoords(splitSourceVertex.x, splitSourceVertex.y);
            ctx.beginPath(); ctx.moveTo(sourceVertexCanvas.x, sourceVertexCanvas.y); ctx.lineTo(currentPosCanvas.x, currentPosCanvas.y); ctx.stroke();
        }
        ctx.setLineDash([]);
    }
  }
  if (waitingForStart) {
    const drawnVertices = new Set();
    polygons.forEach(p => {
        p.lines.forEach(line => {
            const startKey = `${line.start.x.toFixed(3)},${line.start.y.toFixed(3)}`;
            if (!drawnVertices.has(startKey)) {
                const startPos = toCanvasCoords(line.start.x, line.start.y);
                ctx.fillStyle = '#95a5a6'; ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(startPos.x, startPos.y, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
                drawnVertices.add(startKey);
            }
            const endKey = `${line.end.x.toFixed(3)},${line.end.y.toFixed(3)}`;
            if (!drawnVertices.has(endKey)) {
                const endPos = toCanvasCoords(line.end.x, line.end.y);
                ctx.fillStyle = '#95a5a6'; ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(endPos.x, endPos.y, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
                drawnVertices.add(endKey);
            }
        });
    });
  }
  if (editMode) {
    polygons.forEach(p => {
        if (p.isOpen && p.openEndpoints && p.openEndpoints.length === 2) {
            const endpoint1 = p.openEndpoints[0]; const endpoint2 = p.openEndpoints[1];
            const point1 = toCanvasCoords(endpoint1.x, endpoint1.y);
            const point2 = toCanvasCoords(endpoint2.x, endpoint2.y);
            ctx.fillStyle = '#f39c12'; ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(point1.x, point1.y, 10, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(point2.x, point2.y, 10, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        }
    });
  }

  document.querySelectorAll('.polygon-label').forEach(lbl => lbl.remove());
  polygons.forEach(p => {
    const pos = toCanvasCoords(p.centroid.x, p.centroid.y);
    const labelDiv = document.createElement('div');
    labelDiv.className = `polygon-label ${p.includeInGLA ? 'gla' : ''}`;
    labelDiv.innerHTML = `${p.label}<br>${p.area.toFixed(1)} sq ft`;
    labelDiv.dataset.polygonId = p.id;
    labelDiv.style.position = 'absolute'; 
    labelDiv.style.left = `${pos.x - labelDiv.offsetWidth / 2}px`; 
    labelDiv.style.top = `${pos.y - labelDiv.offsetHeight / 2}px`;
    
     if (editMode) {
      labelDiv.style.cursor = 'move';
      labelDiv.addEventListener('contextmenu', (e) => { 
          if (typeof handlePolygonLabelContextMenu === 'function') handlePolygonLabelContextMenu(e, p);
      });
    }

    if (canvas && canvas.parentElement) {
      canvas.parentElement.appendChild(labelDiv);
      labelDiv.style.left = `${pos.x - labelDiv.offsetWidth / 2}px`;
      labelDiv.style.top = `${pos.y - labelDiv.offsetHeight / 2}px`;
    }

    if (editMode && selectedPolygon && selectedPolygon.id === p.id) {
        labelDiv.style.border = "1px dashed red";
        const deleteIcon = document.createElement('div');
        deleteIcon.className = 'delete-icon'; deleteIcon.textContent = '×';
        deleteIcon.style.position = 'absolute'; deleteIcon.style.top = '-5px'; deleteIcon.style.right = '-5px';
        deleteIcon.style.background = 'red'; deleteIcon.style.color = 'white'; deleteIcon.style.borderRadius = '50%';
        deleteIcon.style.width = '15px'; deleteIcon.style.height = '15px'; deleteIcon.style.textAlign = 'center';
        deleteIcon.style.lineHeight = '15px'; deleteIcon.style.cursor = 'pointer';
        deleteIcon.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Delete polygon "${p.label}"?`)) {
                polygons = polygons.filter(poly => poly.id !== p.id);
                selectedPolygon = null;
                updateLegend();
                redrawCanvas();
            }
        };
        labelDiv.appendChild(deleteIcon);
    }
  });

  if (typeof drawRoomLabels === 'function') drawRoomLabels();
  if (typeof drawFloorIconsWithImages === 'function') drawFloorIconsWithImages(); 
  else if (typeof drawFloorIcons === 'function') drawFloorIcons(); 

  if (showDebugEdges && typeof drawDebugEdges === 'function') drawDebugEdges(ctx);
  if (showDebugLabels && typeof drawDebugLabels === 'function') drawDebugLabels(ctx);

  if (typeof drawMobileSelectionIndicators === 'function') drawMobileSelectionIndicators();
}


// --- Edit Mode and Polygon/Line Manipulation ---
export function toggleEditMode() {
  editMode = !editMode;
  if (editMode) {
    drawingMode = false;
    waitingForStart = false;
    currentDistance = '';
    updateDistanceDisplay();
    hideDirectionalPad();
    hideStartCursor(); 
    if (typeof window.setMode === 'function') window.setMode('edit'); 
  } else {
    selectedLine = null;
    selectedPolygon = null;
    if (splitMode) exitSplitMode(); 
  }
  updateDrawingState();
  redrawCanvas();
}

// Modal functions (from polygon.js)
export function showLineEditModal(line) {
  selectedLine = line; 
  const modal = document.getElementById('lineEditModal');
  const currentLengthEl = document.getElementById('currentLength');
  const newLengthInput = document.getElementById('newLength');
  const makeCurvedCheckbox = document.getElementById('makeCurved');

  if (modal && currentLengthEl && newLengthInput && makeCurvedCheckbox) {
    currentLengthEl.textContent = line.distance.toFixed(1);
    newLengthInput.value = line.distance.toFixed(1);
    makeCurvedCheckbox.checked = line.curved || false;
    modal.style.display = 'flex';
  } else {
    console.warn("Line edit modal elements not found.");
  }
}

export function confirmLineEdit() {
  if (!selectedLine || !selectedPolygon) return; 
  const newLengthInput = document.getElementById('newLength');
  const makeCurvedCheckbox = document.getElementById('makeCurved');
  if (!newLengthInput || !makeCurvedCheckbox) return;

  const newLength = parseFloat(newLengthInput.value);
  const isCurved = makeCurvedCheckbox.checked;

  const originalLineState = { ...selectedLine, start: {...selectedLine.start}, end: {...selectedLine.end} };
  const originalPolygonArea = selectedPolygon.area;
  const originalPolygonCentroid = {...selectedPolygon.centroid};


  if (newLength > 0 && newLength !== selectedLine.distance) {
    const scaleFactor = newLength / selectedLine.distance;
    const dx = selectedLine.end.x - selectedLine.start.x;
    const dy = selectedLine.end.y - selectedLine.start.y;
    selectedLine.end.x = selectedLine.start.x + dx * scaleFactor;
    selectedLine.end.y = selectedLine.start.y + dy * scaleFactor;
    selectedLine.distance = newLength;
  }
  selectedLine.curved = isCurved;

  if (selectedPolygon) {
    selectedPolygon.area = calculatePolygonArea(selectedPolygon.lines);
    selectedPolygon.centroid = calculateCentroid(selectedPolygon.lines);
  }

  actionHistory.push({
      type: 'edit_line',
      lineId: selectedLine.id, 
      polygonId: selectedPolygon.id,
      originalLineState: originalLineState,
      originalPolygonArea: originalPolygonArea,
      originalPolygonCentroid: originalPolygonCentroid,
      newLineState: { ...selectedLine, start: {...selectedLine.start}, end: {...selectedLine.end} },
      newPolygonArea: selectedPolygon.area,
      newPolygonCentroid: {...selectedPolygon.centroid}
  });

  updateLegend();
  closeLineEditModal(); 
}

export function deleteSelectedLine() { 
  if (!selectedLine || !selectedPolygon) return;
  const lineIndex = selectedPolygon.lines.indexOf(selectedLine);

  if (lineIndex > -1 && selectedPolygon.lines.length > 3) { 
    const deletedLine = selectedPolygon.lines.splice(lineIndex, 1)[0];
    selectedPolygon.isOpen = true; 
    if (selectedPolygon.lines.length > 0) {
        selectedPolygon.openEndpoints = [ { ...deletedLine.start }, { ...deletedLine.end } ];
    } else {
        selectedPolygon.openEndpoints = []; 
    }

    actionHistory.push({ type: 'delete_line', line: deletedLine, polygonId: selectedPolygon.id });

    selectedPolygon.area = calculatePolygonArea(selectedPolygon.lines); 
    selectedPolygon.centroid = calculateCentroid(selectedPolygon.lines);
    updateLegend();
  } else {
    alert("Cannot delete line. Polygon must have at least 3 sides.");
  }
  closeLineEditModal(); 
}


export function closeLineEditModal() {
  const modal = document.getElementById('lineEditModal');
  if (modal) modal.style.display = 'none';
  selectedLine = null; 
  redrawCanvas();
}

export function confirmPolygonLabel() {
  if (!selectedPolygon) return;
  const polygonNameInput = document.getElementById('polygonName');
  const polygonTypeSelect = document.getElementById('polygonType');
  const includeInGLACheckbox = document.getElementById('includeInGLA');

  if (polygonNameInput && polygonTypeSelect && includeInGLACheckbox) {
    const oldLabel = selectedPolygon.label;
    const oldType = selectedPolygon.type;
    const oldGLA = selectedPolygon.includeInGLA;

    selectedPolygon.label = polygonNameInput.value || selectedPolygon.label;
    selectedPolygon.type = polygonTypeSelect.value;
    selectedPolygon.includeInGLA = includeInGLACheckbox.checked;

    actionHistory.push({
        type: 'relabel_polygon',
        polygonId: selectedPolygon.id,
        oldLabel, oldType, oldGLA,
        newLabel: selectedPolygon.label, newType: selectedPolygon.type, newGLA: selectedPolygon.includeInGLA
    });

    updateLegend();
  }
  closePolygonModal(); 
}

export function closePolygonModal() {
  const modal = document.getElementById('polygonModal');
  if (modal) modal.style.display = 'none';
  redrawCanvas();
}

function rebuildPolygonFromEndpoint(lines, startDrawPoint, otherEndPoint) { 
    const reorderedLines = [];
    let currentPoint = { ...startDrawPoint };
    const availableLines = [...lines.map(l => ({...l, start: {...l.start}, end: {...l.end}, used: false}))]; 

    while(true) {
        let foundNext = false;
        for (let i = 0; i < availableLines.length; i++) {
            if (availableLines[i].used) continue;
            const line = availableLines[i];
            if (isPointsEqual(line.start, currentPoint)) {
                reorderedLines.push({...line});
                currentPoint = {...line.end};
                availableLines[i].used = true;
                foundNext = true;
                break;
            } else if (isPointsEqual(line.end, currentPoint)) {
                reorderedLines.push({ ...line, start: {...line.end}, end: {...line.start} }); 
                currentPoint = {...line.start};
                availableLines[i].used = true;
                foundNext = true;
                break;
            }
        }
        if (!foundNext || isPointsEqual(currentPoint, otherEndPoint) || reorderedLines.length >= lines.length) {
            break; 
        }
    }
    return reorderedLines;
}


// --- Undo/Redo ---
export function undoLast() {
    if (actionHistory.length === 0) {
        if (drawingMode && currentPolygon.length > 0) {
            const lastLine = currentPolygon.pop();
            currentX = lastLine.start.x;
            currentY = lastLine.start.y;
            updatePositionDisplay();
            keepCurrentPointInView();
            redrawCanvas();
            console.log('Undid last drawing segment.');
        } else {
            console.log('No actions to undo.');
        }
        return;
    }

    const lastAction = actionHistory.pop();
    console.log('Undoing action:', lastAction);

    switch (lastAction.type) {
        case 'add_line':
            if (currentPolygon.length > 0 && currentPolygon[currentPolygon.length - 1].id === lastAction.line.id) {
                const undoneLine = currentPolygon.pop();
                currentX = undoneLine.start.x;
                currentY = undoneLine.start.y;
            }
            break;
        case 'add_polygon':
            polygons = polygons.filter(p => p.id !== lastAction.polygon.id);
            break;
        case 'move_polygon':
            const polyToRestore = polygons.find(p => p.id === lastAction.data.polygonId);
            if (polyToRestore) {
                polyToRestore.lines = lastAction.data.originalLines.map(l => ({...l, start: {...l.start}, end: {...l.end}}));
                polyToRestore.centroid = {...lastAction.data.originalCentroid};
                polyToRestore.area = calculatePolygonArea(polyToRestore.lines); 
            }
            break;
        case 'edit_line':
            const editedPoly = polygons.find(p => p.id === lastAction.polygonId);
            if(editedPoly){
                const lineIdx = editedPoly.lines.findIndex(l => l.id === lastAction.lineId);
                if(lineIdx > -1){
                    editedPoly.lines[lineIdx] = {...lastAction.originalLineState, start: {...lastAction.originalLineState.start}, end: {...lastAction.originalLineState.end}};
                }
                editedPoly.area = lastAction.originalPolygonArea;
                editedPoly.centroid = {...lastAction.originalPolygonCentroid};
            }
            break;
        case 'delete_line':
            const polyContainer = polygons.find(p => p.id === lastAction.polygonId);
            if(polyContainer){
                console.warn("Undo for 'delete_line' is complex and might require full polygon state restoration.");
            }
            break;
        case 'relabel_polygon':
            const relabeledPoly = polygons.find(p => p.id === lastAction.polygonId);
            if(relabeledPoly){
                relabeledPoly.label = lastAction.oldLabel;
                relabeledPoly.type = lastAction.oldType;
                relabeledPoly.includeInGLA = lastAction.oldGLA;
            }
            break;
        default:
            console.log('Unknown action type for undo:', lastAction.type);
            break;
    }

    updateLegend();
    redrawCanvas();
    updatePositionDisplay(); 
}

export function redoLast() { console.log("Redo not yet implemented."); }


// --- Canvas Clearing ---
export function clearCanvas() {
  if (confirm('Are you sure you want to clear the entire sketch? This cannot be undone.')) {
    polygons = [];
    currentPolygon = [];
    actionHistory = []; 
    editMode = false;
    drawingMode = false;
    waitingForStart = false;
    currentX = canvas ? canvas.width / (2 * scale) : 0; 
    currentY = 0;
    currentDistance = '';
    hideStartCursor();
    updateDistanceDisplay();
    hideDirectionalPad();
    updateLegend();
    updateDrawingState();
    redrawCanvas();
    console.log("Canvas cleared.");
  }
}

// --- Polygon Splitting Logic (from polysplit.js) ---
export function startSplitMode(polygon, vertex) {
    if (!editMode) {
        console.warn("Splitting can only be initiated in Edit Mode after selecting a polygon vertex.");
        return;
    }
    splitMode = true;
    splitSourcePolygon = polygon;
    splitSourceVertex = vertex;
    currentX = vertex.x; 
    currentY = vertex.y;
    drawingMode = true; 
    waitingForStart = false; 

    showDebugLabels = true;
    showDebugEdges = true;
    clearDebugLabels();
    clearDebugEdges();
    if(typeof labelPolygonVertices === 'function') labelPolygonVertices(polygon, vertex);
    if(typeof highlightVCycleEdges === 'function') highlightVCycleEdges(polygon);

    updateSplitIntersectionPoints(); 
    updateDrawingState();
    updatePositionDisplay();
    redrawCanvas();
    console.log("Split mode started from vertex:", vertex);
}

export function exitSplitMode() {
    splitMode = false;
    splitSourcePolygon = null;
    splitSourceVertex = null;
    splitIntersectionPoints = [];
    drawingMode = false; 
    currentPolygon = []; 

    showDebugLabels = false; 
    showDebugEdges = false;
    clearDebugLabels();
    clearDebugEdges();

    editMode = true; 
    updateDrawingState();
    redrawCanvas();
    console.log("Split mode exited.");
}


function updateSplitIntersectionPoints() {
    if (!splitMode || !splitSourcePolygon) return;
    splitIntersectionPoints = [];
    const tolerance = 0.01 / scale; 

    const splitLine = { start: splitSourceVertex, end: { x: currentX, y: currentY } };

    splitSourcePolygon.lines.forEach((polyLine, index) => {
        if (isPointsEqual(polyLine.start, splitSourceVertex, tolerance) || isPointsEqual(polyLine.end, splitSourceVertex, tolerance)) {
            if (!isPointsEqual(polyLine.start, splitSourceVertex, tolerance) && calculateDistance(splitLine.end, polyLine.start) < 10/scale) {
                 splitIntersectionPoints.push({ ...polyLine.start, type: 'vertex_snap', lineIndex: index, originalLine: polyLine });
            }
            if (!isPointsEqual(polyLine.end, splitSourceVertex, tolerance) && calculateDistance(splitLine.end, polyLine.end) < 10/scale) {
                 splitIntersectionPoints.push({ ...polyLine.end, type: 'vertex_snap', lineIndex: index, originalLine: polyLine });
            }
            return;
        }

        const intersection = getLineIntersection(splitLine.start, splitLine.end, polyLine.start, polyLine.end);
        if (intersection) {
            if (!isPointsEqual(intersection, splitSourceVertex, tolerance)) {
                splitIntersectionPoints.push({ ...intersection, type: 'edge_intersect', lineIndex: index, originalLine: polyLine });
            }
        }
    });

    splitIntersectionPoints = splitIntersectionPoints.filter((point, index, self) =>
        index === self.findIndex(p => isPointsEqual(p, point, tolerance))
    );

    if(typeof labelSplitIntersectionPoints === 'function') labelSplitIntersectionPoints(); 
    if(typeof updatePathLabeling === 'function') updatePathLabeling(); 
    redrawCanvas(); 
}


function handleSplitPointClick(splitPoint) {
    if (!splitMode || !splitSourcePolygon || !splitSourceVertex || !currentPolygon.length) {
        console.error("Cannot perform split: Invalid state.");
        return;
    }
    console.log('Split from vertex:', splitSourceVertex, 'along drawn path, to intersection point:', splitPoint);

    const newPolys = performPerimeterSplit(splitSourcePolygon, splitSourceVertex, splitPoint, currentPolygon);

    if (newPolys && newPolys.length === 2) {
        polygons = polygons.filter(p => p.id !== splitSourcePolygon.id); 
        polygons.push(...newPolys); 

        actionHistory.push({
            type: 'split_polygon',
            originalPolygonId: splitSourcePolygon.id,
            originalPolygonLines: splitSourcePolygon.lines.map(l => ({...l, start: {...l.start}, end: {...l.end}})),
            newPolygon1Id: newPolys[0].id,
            newPolygon2Id: newPolys[1].id,
        });


        if(typeof labelResultingPolygons === 'function') labelResultingPolygons(newPolys[0], newPolys[1]);
        if(typeof highlightResultPolygons === 'function') highlightResultPolygons(newPolys[0], newPolys[1]);

        exitSplitMode(); 
        updateLegend();
    } else {
        console.error("Polygon split failed to produce two new polygons.");
        exitSplitMode(); 
    }
}


function performPerimeterSplit(originalPolygon, splitStartVertex, splitEndIntersection, drawnSplitPathLines) {

    const originalLines = originalPolygon.lines;
    const tolerance = 0.01 / scale;

    let startVertexLineIndex = -1;
    let endIntersectionLineIndex = -1;

    for (let i = 0; i < originalLines.length; i++) {
        if (isPointsEqual(originalLines[i].start, splitStartVertex, tolerance) || isPointsEqual(originalLines[i].end, splitStartVertex, tolerance)) {
            if(isPointsEqual(originalLines[i].start, splitStartVertex, tolerance)) startVertexLineIndex = i;
        }
        if (isPointOnLineSegment(splitEndIntersection, originalLines[i], tolerance)) {
            endIntersectionLineIndex = i;
        }
    }
    for (let i = 0; i < originalLines.length; i++) {
        if (isPointsEqual(originalLines[i].start, splitStartVertex, tolerance)) {
            startVertexLineIndex = i;
            break;
        }
    }

    if (startVertexLineIndex === -1 || endIntersectionLineIndex === -1) {
        console.error("Could not locate split points on original polygon perimeter.", startVertexLineIndex, endIntersectionLineIndex, splitStartVertex, splitEndIntersection);
        return null;
    }

    const dividingLine = {
        start: { ...splitStartVertex },
        end: { ...splitEndIntersection },
        distance: calculateDistance(splitStartVertex, splitEndIntersection),
        direction: 'split',
        curved: false,
        id: Date.now() + Math.random() + 1000
    };
    const reverseDividingLine = {
        start: { ...splitEndIntersection },
        end: { ...splitStartVertex },
        distance: dividingLine.distance,
        direction: 'split_reverse',
        curved: false,
        id: Date.now() + Math.random() + 1001
    };

    const poly1Lines = [];
    let currentIndex = startVertexLineIndex;
    while (currentIndex !== endIntersectionLineIndex) {
        poly1Lines.push({ ...originalLines[currentIndex] });
        currentIndex = (currentIndex + 1) % originalLines.length;
    }
    const endLine = originalLines[endIntersectionLineIndex];
    if (!isPointsEqual(endLine.start, splitEndIntersection, tolerance)) {
        poly1Lines.push({
            start: { ...endLine.start },
            end: { ...splitEndIntersection },
            distance: calculateDistance(endLine.start, splitEndIntersection),
            direction: endLine.direction, curved: endLine.curved, id: Date.now() + Math.random()
        });
    }
    poly1Lines.push(reverseDividingLine);

    const poly2Lines = [];
    poly2Lines.push(dividingLine);
    currentIndex = endIntersectionLineIndex;
    if (!isPointsEqual(splitEndIntersection, endLine.end, tolerance)) {
        poly2Lines.push({
            start: { ...splitEndIntersection },
            end: { ...endLine.end },
            distance: calculateDistance(splitEndIntersection, endLine.end),
            direction: endLine.direction, curved: endLine.curved, id: Date.now() + Math.random()
        });
    }
    currentIndex = (currentIndex + 1) % originalLines.length;
    while (currentIndex !== startVertexLineIndex) {
        poly2Lines.push({ ...originalLines[currentIndex] });
        currentIndex = (currentIndex + 1) % originalLines.length;
    }
    const startLine = originalLines[startVertexLineIndex];
    if (!isPointsEqual(startLine.start, splitStartVertex, tolerance) && currentIndex === startVertexLineIndex) {
    }

    const p1 = {
        lines: poly1Lines, id: Date.now() + 2, includeInGLA: originalPolygon.includeInGLA,
        type: originalPolygon.type, label: originalPolygon.label + "a",
        area: calculatePolygonArea(poly1Lines), centroid: calculateCentroid(poly1Lines), isOpen: false
    };
    const p2 = {
        lines: poly2Lines, id: Date.now() + 3, includeInGLA: originalPolygon.includeInGLA,
        type: originalPolygon.type, label: originalPolygon.label + "b",
        area: calculatePolygonArea(poly2Lines), centroid: calculateCentroid(poly2Lines), isOpen: false
    };

    if (p1.lines.length < 3 || p2.lines.length < 3) {
        console.error("Split resulted in invalid polygons (less than 3 sides).", p1.lines.length, p2.lines.length);
        return null;
    }

    return [p1, p2];
}


// Debug drawing functions from polysplit.js
function addDebugLabel(x, y, text, color = 'blue', size = 16) {
  if(!showDebugLabels) return;
  debugLabels.push({ x, y, text, color, size, id: Date.now() + Math.random() });
}
function drawDebugLabels(ctx) {
  if (!showDebugLabels || !ctx) return;
  debugLabels.forEach(label => {
    const pos = toCanvasCoords(label.x, label.y); 
    ctx.save();
    ctx.font = `bold ${label.size}px Arial`;
    ctx.fillStyle = label.color;
    ctx.strokeStyle = 'white'; ctx.lineWidth = 3;
    ctx.strokeText(label.text, pos.x + 5, pos.y - 5);
    ctx.fillText(label.text, pos.x + 5, pos.y - 5);
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  });
}
function addDebugEdge(x1, y1, x2, y2, color = 'blue', width = 4, label = '') {
  if(!showDebugEdges) return;
  debugEdges.push({ x1, y1, x2, y2, color, width, label, id: Date.now() + Math.random() });
}
function drawDebugEdges(ctx) {
  if (!showDebugEdges || !ctx) return;
  debugEdges.forEach(edge => {
    const startPt = toCanvasCoords(edge.x1, edge.y1);
    const endPt = toCanvasCoords(edge.x2, edge.y2);
    ctx.save();
    ctx.strokeStyle = edge.color; ctx.lineWidth = edge.width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(startPt.x, startPt.y); ctx.lineTo(endPt.x, endPt.y); ctx.stroke();
    if (edge.label) {
      const midX = (startPt.x + endPt.x) / 2; const midY = (startPt.y + endPt.y) / 2;
      ctx.font = 'bold 12px Arial'; ctx.fillStyle = edge.color; ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
      ctx.strokeText(edge.label, midX, midY); ctx.fillText(edge.label, midX, midY);
    }
    ctx.restore();
  });
}
function clearDebugLabels() { debugLabels = []; }
function clearDebugEdges() { debugEdges = []; }
function labelPolygonVertices(polygon, startVertex) { /* ... from polysplit.js, adapted ... */ }
function highlightVCycleEdges(polygon) { /* ... from polysplit.js, adapted ... */ }
function updatePathLabeling() { /* ... from polysplit.js, adapted ... */ }
function labelSplitIntersectionPoints() { /* ... from polysplit.js, adapted ... */ }
function labelResultingPolygons(poly1, poly2) { /* ... from polysplit.js, adapted ... */ }
function highlightResultPolygons(poly1, poly2) { /* ... from polysplit.js, adapted ... */ }


// Helper for line intersection (from polysplit.js or standard geometry)
function getLineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;

    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) return null; // Lines are parallel or coincident

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { // Intersection lies on both segments
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1)
        };
    }
    return null; // No intersection on segments
}


// Export functions to be called from HTML or other modules
// For Vite, these would typically be imported in main.js and then assigned to window if needed for HTML onclicks,
// or event listeners would be set up in main.js.
// For now, direct window assignment for simplicity, mirroring old structure.

window.startNewDrawing = startNewDrawing;
window.toggleEditMode = toggleEditMode;
window.undoLast = undoLast;
window.redoLast = redoLast;
window.clearCanvas = clearCanvas;
window.drawLine = drawLine;
window.closePolygon = closePolygon;
window.appendNumber = appendNumber;
window.deleteLastNumber = deleteLastNumber; // Renamed
window.clearCurrentDistance = clearCurrentDistance; // Renamed
window.handleEnterKey = handleEnterKey; // Renamed
// window.toggleAngle = toggleAngle; // Assuming this is handled by paletteManager or another UI module
window.confirmPolygonLabel = confirmPolygonLabel;
window.closePolygonModal = closePolygonModal;
window.confirmLineEdit = confirmLineEdit;
window.deleteSelectedLine = deleteSelectedLine; // Renamed
window.closeLineEditModal = closeLineEditModal;
// window.toggleLegend = toggleLegend; // From misc.js, likely UI specific

// Expose some state and core functions for other modules if needed
export {
    polygons,
    currentX,
    currentY,
    scale,
    editMode,
    drawingMode,
    selectedPolygon,
    // redrawCanvas, // REMOVED from here as it's exported at definition
    toWorldCoords,
    toCanvasCoords,
    // Potentially others like `actionHistory` if undo is managed externally
};

// Call init when the script loads, or export it to be called from main.js
// For Vite, it's better to export and call from main.js after DOM is ready.
// document.addEventListener('DOMContentLoaded', initClosedPolygonSystem);

