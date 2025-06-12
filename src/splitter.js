// src/splitter.js - Automatic polygon splitting when two cycles are detected
// ENHANCED to also handle vertex connections to existing polygons

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { AreaHelpers } from './helpers.js';
import { AreaManager } from './areaManager.js';

export class SplitterManager {
    constructor() {
        this.PIXELS_PER_FOOT = 8;
        this.isProcessingSplit = false;
        this.pendingSecondArea = null;
        console.log('SplitterManager: Initialized (v3 - Vertex Connection + Graph Analysis)');
    }

    init() {
        // Listen for cycle completion events
        AppState.on('app:cycleClosed', (e) => {
            console.log('🔍 SPLIT: Received cycleClosed event');
            const wasHandled = this.handlePotentialSplit(e);
            if (wasHandled) {
                // Prevent the event from reaching AreaManager
                e.stopImmediatePropagation();
            }
        });
        
        // NEW: Listen for canvas interactions to intercept vertex connections
        this.setupVertexConnectionInterceptor();
        
        console.log('SplitterManager: Listening for cycle completion and vertex connections');
    }



/**
 * Creates a unique, sorted identifier for a polygon's path to allow for comparison.
 * @param {Array<Object>} path - An array of vertex points {x, y}.
 * @returns {string} A canonical string ID for the path.
 */
getCanonicalPathID(path) {
    if (!path || path.length === 0) return '';
    
    const sortedPathString = path
        .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`) // Create a string for each point
        .sort() // Sort the strings alphabetically
        .join(';'); // Join them into a single ID
        
    return sortedPathString;
}

    /**
     * NEW: Setup interceptor for vertex connections to existing polygons
     */
    setupVertexConnectionInterceptor() {
        // Listen for drawing mode canvas interactions
        AppState.on('canvas:interaction', (e) => {
            if (AppState.currentMode === 'drawing') {
                this.handleDrawingModeClick(e.detail);
            }
        });
        
        // If the canvas interaction event doesn't exist, we'll hook into the viewport directly
        // We need to add this interceptor at the viewport level
        const viewport = document.getElementById('canvasViewport');
        if (viewport) {
            // Add our listener with high priority (capture phase)
            viewport.addEventListener('click', (e) => {
                if (AppState.currentMode === 'drawing') {
                    this.interceptDrawingClick(e);
                }
            }, { capture: true }); // Capture phase means we get the event first
            
            console.log('🔍 SPLIT: Vertex connection interceptor installed');
        }
    }

    /**
     * NEW: Intercept clicks during drawing mode to check for existing polygon vertices
     */
// In splitter.js, find and replace this function

    interceptDrawingClick(e) {
        if (!AppState.currentPolygonPoints || AppState.currentPolygonPoints.length === 0) {
            return false;
        }

        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left) - AppState.viewportTransform.x;
        const canvasY = (e.clientY - rect.top) - AppState.viewportTransform.y;
        
        const endConnectionInfo = this.findExistingPolygonVertex(canvasX, canvasY);

        if (endConnectionInfo) {
            const startPoint = AppState.currentPolygonPoints[0];
            const startConnectionInfo = this.findPolygonConnection(startPoint);

            if (startConnectionInfo && startConnectionInfo.polygon.id === endConnectionInfo.polygon.id) {
                console.log('✅ Adjacent area creation triggered by interceptor.');
                
                // *** ADD THIS LINE to set the flag ***
                AppState.clickHasBeenProcessed = true;

                const polygon = startConnectionInfo.polygon;
                const startIndex = startConnectionInfo.vertexIndex;
                const endIndex = endConnectionInfo.vertexIndex;

                const arcPath = this.getShorterArc(polygon.path, endIndex, startIndex);
                const newCyclePath = [...AppState.currentPolygonPoints, endConnectionInfo.vertex, ...arcPath];

                if (newCyclePath.length > 1) {
                    const first = newCyclePath[0];
                    const last = newCyclePath[newCyclePath.length - 1];
                    if (Math.abs(first.x - last.x) < 1 && Math.abs(first.y - last.y) < 1) {
                        newCyclePath.pop();
                    }
                }
                
                AppState.emit('app:cycleClosed', { path: newCyclePath });
                
                AppState.currentPolygonPoints = [];
                AppState.currentPolygonCounter = 0;
                
                CanvasManager.redraw();
                return true;
            }
        }
        return false;
    }

    /**
     * NEW: Find existing polygon vertex near click coordinates
     */
    findExistingPolygonVertex(x, y) {
        const clickRadius = 25; // Same as drawing system
        let closestVertex = null;
        let closestDistance = Infinity;
        
        console.log('🔗 VERTEX: Checking', AppState.drawnPolygons.length, 'existing polygons');
        
        for (let polyIndex = 0; polyIndex < AppState.drawnPolygons.length; polyIndex++) {
            const polygon = AppState.drawnPolygons[polyIndex];
            
            for (let vertexIndex = 0; vertexIndex < polygon.path.length; vertexIndex++) {
                const vertex = polygon.path[vertexIndex];
                const dx = x - vertex.x;
                const dy = y - vertex.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                console.log(`🔗 VERTEX: Polygon "${polygon.label}" vertex ${vertexIndex} at (${vertex.x.toFixed(1)}, ${vertex.y.toFixed(1)}) - distance: ${distance.toFixed(1)}px`);
                
                if (distance <= clickRadius && distance < closestDistance) {
                    closestVertex = {
                        vertex: vertex,
                        polygon: polygon,
                        polygonIndex: polyIndex,
                        vertexIndex: vertexIndex,
                        distance: distance
                    };
                    closestDistance = distance;
                }
            }
        }
        
        if (closestVertex) {
            console.log(`✅ VERTEX: Found closest vertex at distance ${closestVertex.distance.toFixed(1)}px from polygon "${closestVertex.polygon.label}"`);
        } else {
            console.log('❌ VERTEX: No existing polygon vertex found within click radius');
        }
        
        return closestVertex;
    }

    /**
     * NEW: Connect current drawing path to an existing polygon vertex
     */
    connectToExistingVertex(existingVertexInfo) {
        const { vertex, polygon } = existingVertexInfo;
        
        console.log(`🔗 VERTEX: Connecting to vertex (${vertex.x}, ${vertex.y}) from polygon "${polygon.label}"`);
        
        // Create new point with exact coordinates from existing vertex
        const newPoint = {
            x: vertex.x,
            y: vertex.y,
            name: `p${AppState.currentPolygonCounter}`,
            connectedToPolygon: polygon.id,
            connectedToVertex: existingVertexInfo.vertexIndex
        };
        
        // Add to current path
        AppState.currentPolygonPoints.push(newPoint);
        AppState.currentPolygonCounter++;
        
        console.log(`🔗 VERTEX: Added ${newPoint.name} at exact position (${newPoint.x}, ${newPoint.y})`);
        
        // Check if this completes a two-cycle pattern
        this.checkForImmediateTwoCycleCompletion();
        
        // Update display
        CanvasManager.saveAction();
        CanvasManager.redraw();
    }

    /**
     * NEW: Check if the current path + existing polygons forms a two-cycle pattern
     */
    checkForImmediateTwoCycleCompletion() {
        console.log('🔍 SPLIT: Checking for immediate two-cycle completion');
        
        // Build connected graph with current path (even if not closed)
        const connectedGraph = this.buildConnectedGraphFromCurrentPath();
        
        if (!connectedGraph) {
            console.log('🔍 SPLIT: No connected graph from current path');
            return false;
        }
        
        // Check if this forms a two-cycle pattern
        if (this.isTwoCycleGraph(connectedGraph)) {
            console.log('✅ SPLIT: Two-cycle pattern detected from vertex connection!');
            
            // Clear the current drawing path (we're taking over)
            AppState.currentPolygonPoints = [];
            AppState.currentPolygonCounter = 0;
            
            // Perform the split
            this.performSplit(connectedGraph);
            return true;
        }
        
        return false;
    }

    /**
     * NEW: Build connected graph from current drawing path + existing polygons
     */
    buildConnectedGraphFromCurrentPath() {
        if (!AppState.currentPolygonPoints || AppState.currentPolygonPoints.length < 2) {
            return null;
        }
        
        // Create a temporary closed path for analysis
        const tempPath = [...AppState.currentPolygonPoints];
        
        // Check if first and last points are connected to the same polygon
        const firstPoint = tempPath[0];
        const lastPoint = tempPath[tempPath.length - 1];
        
        // If both ends connect to existing polygons, we might have a two-cycle
        const firstConnection = this.findPolygonConnection(firstPoint);
        const lastConnection = this.findPolygonConnection(lastPoint);
        
        if (firstConnection && lastConnection) {
            console.log('🔍 SPLIT: Found connections to existing polygons');
            return this.buildConnectedGraph(tempPath);
        }
        
        return null;
    }

    /**
     * NEW: Find which polygon a point connects to
     */
    findPolygonConnection(point) {
        const tolerance = 5;
        
        for (const polygon of AppState.drawnPolygons) {
            for (let i = 0; i < polygon.path.length; i++) {
                const vertex = polygon.path[i];
                const dx = point.x - vertex.x;
                const dy = point.y - vertex.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= tolerance) {
                    return {
                        polygon: polygon,
                        vertexIndex: i,
                        vertex: vertex
                    };
                }
            }
        }
        
        return null;
    }

    /**
     * Main entry point - analyze the entire connected graph for two-cycle pattern
     */
    handlePotentialSplit(event) {
        if (this.isProcessingSplit) return false;
        
        const newPath = event.detail.path;
        if (!newPath || newPath.length < 3) return false;
        
        console.log('🔍 SPLIT: ===== CYCLE COMPLETION DETECTED =====');
        console.log('🔍 SPLIT: New path vertices:', newPath.length);
        newPath.forEach((vertex, index) => {
            console.log(`🔍 SPLIT:   ${vertex.name}: (${vertex.x.toFixed(1)}, ${vertex.y.toFixed(1)})`);
        });
        
        console.log('🔍 SPLIT: Current existing polygons:', AppState.drawnPolygons.length);
        AppState.drawnPolygons.forEach((polygon, index) => {
            console.log(`🔍 SPLIT:   Polygon ${index}: "${polygon.label}" with ${polygon.path.length} vertices`);
            polygon.path.forEach((vertex, vIndex) => {
                console.log(`🔍 SPLIT:     ${vertex.name}: (${vertex.x.toFixed(1)}, ${vertex.y.toFixed(1)})`);
            });
        });
        
        // Build the complete connected graph (existing polygons + new path)
        const connectedGraph = this.buildConnectedGraph(newPath);
        
        if (!connectedGraph) {
            console.log('❌ SPLIT: No connected graph found');
            return false;
        }
        
        console.log('🔍 SPLIT: Connected graph has', connectedGraph.vertices.size, 'vertices');
        
        // Debug: Print the complete unified graph
        console.log('🔍 SPLIT: ===== UNIFIED GRAPH STRUCTURE =====');
        for (const [vertexKey, vertex] of connectedGraph.vertices) {
            const neighbors = connectedGraph.graph.get(vertexKey) || [];
            console.log(`🔍 SPLIT:   Vertex ${vertexKey}: degree ${neighbors.length}, neighbors: [${neighbors.join(', ')}]`);
        }
        
        // Test if this connected graph represents two cycles sharing a path
        if (this.isTwoCycleGraph(connectedGraph)) {
            console.log('✅ SPLIT: Two-cycle pattern detected in connected graph!');
            this.performSplit(connectedGraph);
            return true;
        }
        
        console.log('❌ SPLIT: Not a two-cycle pattern, letting normal processing continue');
        return false;
    }

    /**
     * Build a connected graph that includes existing polygons connected to the new path
     */
    buildConnectedGraph(newPath) {
        // Find which existing polygons share vertices with the new path
        const connectedPolygons = this.findConnectedPolygons(newPath);
        
        if (connectedPolygons.length === 0) {
            console.log('🔍 SPLIT: New path not connected to any existing polygons');
            return null;
        }
        
        console.log('🔍 SPLIT: Found', connectedPolygons.length, 'connected polygons');
        
        // Build unified graph from all connected components
        return this.buildUnifiedGraph(newPath, connectedPolygons);
    }

    /**
     * Find existing polygons that share vertices with the new path
     */
    findConnectedPolygons(newPath) {
        const connectedPolygons = [];
        const tolerance = 5; // pixels
        
        for (const polygon of AppState.drawnPolygons) {
            for (const newVertex of newPath) {
                for (const polyVertex of polygon.path) {
                    const dx = newVertex.x - polyVertex.x;
                    const dy = newVertex.y - polyVertex.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance <= tolerance) {
                        console.log(`🔍 SPLIT: Found connection between new vertex (${newVertex.x.toFixed(1)}, ${newVertex.y.toFixed(1)}) and polygon "${polygon.label}"`);
                        connectedPolygons.push(polygon);
                        break; // Found connection, move to next polygon
                    }
                }
                if (connectedPolygons.includes(polygon)) break; // Already found this polygon
            }
        }
        
        return connectedPolygons;
    }

    /**
     * Build unified graph from new path + connected polygons
     */
    buildUnifiedGraph(newPath, connectedPolygons) {
        const graph = new Map();
        const vertices = new Map(); // Map from coordinate key to vertex info
        const tolerance = 5;
        
        // Helper to get coordinate key for a point
        const getKey = (point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
        
        // Helper to add vertex (merge if coordinates are very close)
        const addVertex = (point, source) => {
            const key = getKey(point);
            
            // Check for nearby existing vertices
            for (const [existingKey, existingVertex] of vertices) {
                const [existingX, existingY] = existingKey.split(',').map(Number);
                const dx = point.x - existingX;
                const dy = point.y - existingY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= tolerance) {
                    // Merge with existing vertex
                    console.log(`🔍 SPLIT: Merging vertex (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) with existing (${existingX.toFixed(1)}, ${existingY.toFixed(1)})`);
                    return existingKey;
                }
            }
            
            // Add new vertex
            vertices.set(key, {
                x: point.x,
                y: point.y,
                sources: [source]
            });
            graph.set(key, []);
            return key;
        };
        
        // Helper to add edge
        const addEdge = (key1, key2) => {
            if (key1 !== key2 && graph.has(key1) && graph.has(key2)) {
                // Avoid duplicate edges
                if (!graph.get(key1).includes(key2)) {
                    graph.get(key1).push(key2);
                    graph.get(key2).push(key1);
                }
            }
        };
        
        // Add vertices and edges from existing polygons
        connectedPolygons.forEach((polygon, polyIndex) => {
            console.log(`🔍 SPLIT: Adding polygon "${polygon.label}" to graph`);
            const polyVertexKeys = [];
            
            // Add vertices
            polygon.path.forEach(vertex => {
                const key = addVertex(vertex, `polygon_${polyIndex}`);
                polyVertexKeys.push(key);
            });
            
            // Add edges (polygon is a cycle)
            for (let i = 0; i < polyVertexKeys.length; i++) {
                const current = polyVertexKeys[i];
                const next = polyVertexKeys[(i + 1) % polyVertexKeys.length];
                addEdge(current, next);
            }
        });
        
        // Add vertices and edges from new path
        console.log('🔍 SPLIT: Adding new path to graph');
        const newPathKeys = [];
        
        // Add vertices
        newPath.forEach(vertex => {
            const key = addVertex(vertex, 'new_path');
            newPathKeys.push(key);
        });
        
        // Add edges (new path is also a cycle)
        for (let i = 0; i < newPathKeys.length; i++) {
            const current = newPathKeys[i];
            const next = newPathKeys[(i + 1) % newPathKeys.length];
            addEdge(current, next);
        }
        
        console.log('🔍 SPLIT: Unified graph completed');
        console.log('🔍 SPLIT: Total vertices:', vertices.size);
        console.log('🔍 SPLIT: Total edges:', Array.from(graph.values()).reduce((sum, neighbors) => sum + neighbors.length, 0) / 2);
        
        return {
            graph,
            vertices,
            connectedPolygons,
            newPath
        };
    }

    /**
     * Check if unified graph satisfies two-cycle conditions
     */
    isTwoCycleGraph(graphData) {
        const { graph, vertices } = graphData;
        
        const V = graph.size;
        let E = 0;
        const degrees = [];
        
        // Count edges and degrees
        for (const [vertex, neighbors] of graph) {
            const degree = neighbors.length;
            degrees.push(degree);
            E += degree;
        }
        
        E = E / 2; // Each edge counted twice in undirected graph
        
        console.log(`🔍 SPLIT: Unified graph analysis:`);
        console.log(`  - Vertices (V): ${V}`);
        console.log(`  - Edges (E): ${E}`);
        console.log(`  - Expected for two cycles: E = V + 1 = ${V + 1}`);
        console.log(`  - Degree sequence:`, degrees.sort((a, b) => b - a));
        
        // Check condition 1: |E| = |V| + 1
        if (E !== V + 1) {
            console.log(`❌ SPLIT: Edge count condition failed (${E} ≠ ${V + 1})`);
            return false;
        }
        
        // Check condition 2: Exactly two degree-3 vertices, rest degree-2
        const degreeCount = degrees.reduce((acc, deg) => {
            acc[deg] = (acc[deg] || 0) + 1;
            return acc;
        }, {});
        
        console.log('🔍 SPLIT: Degree distribution:', degreeCount);
        
        const hasTwoDegree3 = degreeCount[3] === 2;
        const restAreDegree2 = degreeCount[2] === V - 2;
        const noOtherDegrees = Object.keys(degreeCount).length === 2;
        
        if (hasTwoDegree3 && restAreDegree2 && noOtherDegrees) {
            console.log('✅ SPLIT: Degree sequence condition satisfied');
            return true;
        } else {
            console.log('❌ SPLIT: Degree sequence condition failed');
            console.log(`  - Two degree-3 vertices: ${hasTwoDegree3} (expected: true)`);
            console.log(`  - Rest are degree-2: ${restAreDegree2} (expected: true)`);
            console.log(`  - No other degrees: ${noOtherDegrees} (expected: true)`);
            return false;
        }
    }

    /**
     * Perform the split by decomposing the unified graph into two cycles
     */
/**
 * Perform the split by decomposing the unified graph into two cycles
 */
// In splitter.js, find and replace this entire function

performSplit(graphData) {

    AppState.emit('app:exitDrawingMode');


    this.isProcessingSplit = true;
    try {
        const originalPolygonsMap = new Map();
        graphData.connectedPolygons.forEach(p => {
            originalPolygonsMap.set(this.getCanonicalPathID(p.path), p);
        });
        
        graphData.connectedPolygons.forEach(polygon => {
            const index = AppState.drawnPolygons.indexOf(polygon);
            if (index > -1) AppState.drawnPolygons.splice(index, 1);
        });
        
        const polygonIds = graphData.connectedPolygons.map(p => p.id);
        AppState.placedElements = AppState.placedElements.filter(el => 
            !(el.type === 'area_label' && polygonIds.includes(el.linkedPolygonId))
        );
        
        const junctionVertices = this.findJunctionVertices(graphData);
        if (junctionVertices.length !== 2) throw new Error(`Expected 2 junction vertices, found ${junctionVertices.length}`);
        
        const paths = this.findAllPathsBetweenJunctions(graphData, junctionVertices);
        if (paths.length !== 3) throw new Error(`Expected 3 paths, found ${paths.length}`);

        // --- NEW LOGIC TO FIX SUPERIMPOSED AREA ---

        // 1. Construct all three possible cycles from the three paths.
        const cycle1 = this.constructCleanCycle(paths[0], paths[1]);
        const cycle2 = this.constructCleanCycle(paths[0], paths[2]);
        const cycle3 = this.constructCleanCycle(paths[1], paths[2]);

        // 2. Calculate the area of each cycle.
        const allCycles = [
            { path: cycle1, area: this.calculateArea(cycle1) },
            { path: cycle2, area: this.calculateArea(cycle2) },
            { path: cycle3, area: this.calculateArea(cycle3) },
        ];

        // 3. Sort the cycles by area, largest first.
        allCycles.sort((a, b) => b.area - a.area);
        
        // 4. Discard the largest cycle (the outer perimeter) and keep the two smaller ones.
        const finalCycle1 = allCycles[1].path;
        const finalCycle2 = allCycles[2].path;
        
        console.log('🔪 SPLIT: Correctly identified two inner cycles.');

        // --- RESUME LOGIC USING THE TWO CORRECT CYCLES ---
        
        const cycle1ID = this.getCanonicalPathID(finalCycle1);
        const cycle2ID = this.getCanonicalPathID(finalCycle2);

        const matchedOriginalPolygon1 = originalPolygonsMap.get(cycle1ID);
        const matchedOriginalPolygon2 = originalPolygonsMap.get(cycle2ID);

        if ((matchedOriginalPolygon1 && !matchedOriginalPolygon2) || (!matchedOriginalPolygon1 && matchedOriginalPolygon2)) {
            console.log('✅ SPLIT: Detected one unchanged polygon. Entering single-prompt mode.');

            const unchangedPolygon = matchedOriginalPolygon1 || matchedOriginalPolygon2;
            const newCycle = matchedOriginalPolygon1 ? finalCycle2 : finalCycle1;

            AppState.drawnPolygons.push(unchangedPolygon);
            this.createAreaLabelElement(unchangedPolygon);

            const area = this.calculateArea(newCycle);
            const newPolygonToClassify = this.createPolygonFromCycle(newCycle, area, 'New Area');
            AppState.drawnPolygons.push(newPolygonToClassify);

            const modal = document.getElementById('polygonModal');
            const nameInput = document.getElementById('polygonName');
            const typeSelect = document.getElementById('polygonType');
            const includeInGLACheckbox = document.getElementById('includeInGLA');
            const modalTitle = modal.querySelector('h3');
            const saveBtn = modal.querySelector('.btn-primary');
            const cancelBtn = modal.querySelector('.btn-secondary');

            modalTitle.textContent = `Classify Your New Area of ${area.toFixed(1)} sq ft`;
            const defaultType = 'living';
            typeSelect.value = defaultType;
            nameInput.value = AreaManager.generateAreaLabel(defaultType);
            
            const syncGlaCheckbox = () => {
                if (!includeInGLACheckbox) return;
                const selectedOption = typeSelect.options[typeSelect.selectedIndex];
                includeInGLACheckbox.checked = parseInt(selectedOption.getAttribute('data-gla'), 10) === 1;
            };
            typeSelect.onchange = () => {
                nameInput.value = AreaManager.generateAreaLabel(typeSelect.value);
                syncGlaCheckbox();
            };
            syncGlaCheckbox();
            
            saveBtn.onclick = () => {
                const selectedOption = typeSelect.options[typeSelect.selectedIndex];
                newPolygonToClassify.label = nameInput.value.trim();
                newPolygonToClassify.type = typeSelect.value;
                newPolygonToClassify.glaType = parseInt(selectedOption.getAttribute('data-gla'), 10);
                modal.classList.add('hidden');
                this.finalizeSplit();
            };

            cancelBtn.onclick = () => this.handleSplitCancel();
            modal.classList.remove('hidden');
            nameInput.focus();

        } else {
            console.log('✅ SPLIT: Two new areas created. Entering two-prompt mode.');
            const area1 = this.calculateArea(finalCycle1);
            const area2 = this.calculateArea(finalCycle2);
            
            const largerPolygon = this.createPolygonFromCycle(area1 >= area2 ? finalCycle1 : finalCycle2, Math.max(area1, area2), 'Area 1');
            const smallerPolygon = this.createPolygonFromCycle(area1 < area2 ? finalCycle1 : finalCycle2, Math.min(area1, area2), 'Area 2');
            
            this.pendingSecondArea = smallerPolygon;
            AppState.currentPolygonPoints = [];
            AppState.currentPolygonCounter = 0;
            
            CanvasManager.redraw();
            this.showFirstAreaModal(largerPolygon, largerPolygon.area);
        }
    } catch (error) {
        console.error('🔥 SPLIT: Error during split:', error);
        this.isProcessingSplit = false;
    }
}

    /**
     * NEW: Intelligently identify which path is the shared path
     */
    identifySharedPath(paths, graphData) {
        // Strategy: The shared path is likely the shortest one, or the one that was part of the original polygon
        
        // For now, use simple strategy: shortest path is likely the shared edge
        let shortestIndex = 0;
        let shortestLength = paths[0].length;
        
        paths.forEach((path, index) => {
            if (path.length < shortestLength) {
                shortestLength = path.length;
                shortestIndex = index;
            }
        });
        
        console.log('🔪 SPLIT: Shortest path (index', shortestIndex, ') has', shortestLength, 'vertices');
        return shortestIndex;
    }

    /**
     * NEW: Construct a clean cycle by properly combining paths
     */
    constructCleanCycle(sidePath, sharedPath) {
        console.log('🔪 SPLIT: Constructing cycle from side path:', sidePath.length, 'vertices and shared path:', sharedPath.length, 'vertices');
        
        // Simple approach: side path + shared path in reverse order
        const cycle = [...sidePath];
        
        // Add shared path in reverse, but skip the junction vertices to avoid duplicates
        const reversedShared = [...sharedPath].reverse();
        
        // Skip first and last vertices of reversed shared path (they should be junctions already in side path)
        for (let i = 1; i < reversedShared.length - 1; i++) {
            cycle.push(reversedShared[i]);
        }
        
        console.log('🔪 SPLIT: Constructed cycle with', cycle.length, 'vertices');
        return cycle;
    }

    /**
     * Find vertices with degree 3 (junction points)
     */
    findJunctionVertices(graphData) {
        const { graph } = graphData;
        const junctions = [];
        
        for (const [vertex, neighbors] of graph) {
            if (neighbors.length === 3) {
                junctions.push(vertex);
            }
        }
        
        return junctions;
    }

    /**
     * Find all simple paths between junction vertices using DFS
     */
    findAllPathsBetweenJunctions(graphData, junctionVertices) {
        const { graph, vertices } = graphData;
        const [start, end] = junctionVertices;
        const allPaths = [];
        
        const visited = new Set();
        const currentPath = [];
        
        const dfs = (current) => {
            currentPath.push(current);
            visited.add(current);
            
            if (current === end && currentPath.length > 1) {
                // Convert path to coordinate points
                const pathPoints = currentPath.map((vertexKey, index) => {
                    const vertex = vertices.get(vertexKey);
                    return {
                        x: vertex.x,
                        y: vertex.y,
                        name: `path${allPaths.length}_p${index}`
                    };
                });
                allPaths.push([...pathPoints]);
            } else if (current !== end) {
                // Continue searching
                const neighbors = graph.get(current) || [];
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        dfs(neighbor);
                    }
                }
            }
            
            // Backtrack
            currentPath.pop();
            visited.delete(current);
        };
        
        dfs(start);
        return allPaths;
    }

    /**
     * Construct cycle by combining side path with shared path
     */
    constructCycle(sidePath, sharedPath) {
        const cycle = [...sidePath];
        
        // Add shared path in reverse (excluding junction vertices to avoid duplicates)
        const reversedShared = [...sharedPath].reverse();
        for (let i = 1; i < reversedShared.length - 1; i++) {
            cycle.push(reversedShared[i]);
        }
        
        return cycle;
    }

    /**
     * Calculate area of cycle in square feet
     */
    calculateArea(cycle) {
        if (cycle.length < 3) return 0;
        
        let area = 0;
        for (let i = 0; i < cycle.length; i++) {
            const p1 = cycle[i];
            const p2 = cycle[(i + 1) % cycle.length];
            area += (p1.x * p2.y - p2.x * p1.y);
        }
        
        const areaInPixels = Math.abs(area / 2);
        return areaInPixels / (this.PIXELS_PER_FOOT * this.PIXELS_PER_FOOT);
    }

    /**
     * Create polygon object from cycle
     */
    createPolygonFromCycle(cycle, area, tempName) {
        return {
            id: Date.now() + Math.random(),
            path: cycle.map((point, index) => ({
                x: point.x,
                y: point.y,
                name: `p${index}`
            })),
            label: tempName,
            type: 'living',
            glaType: 1,
            area: area,
            centroid: AreaHelpers.calculateCentroid(cycle)
        };
    }

    /**
     * Show first area modal with custom title
     */
    showFirstAreaModal(polygon, area) {
        AppState.drawnPolygons.push(polygon);
        
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const includeInGLACheckbox = document.getElementById('includeInGLA');
        const modalTitle = modal.querySelector('h3');
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');
        
        if (modalTitle) {
            modalTitle.textContent = `Classify your first area of ${area.toFixed(1)} sq ft`;
        }
        
        const defaultType = 'living';
        typeSelect.value = defaultType;
        nameInput.value = AreaManager.generateAreaLabel(defaultType);

        const syncGlaCheckbox = () => {
            if (!includeInGLACheckbox) return;
            const selectedOption = typeSelect.options[typeSelect.selectedIndex];
            includeInGLACheckbox.checked = parseInt(selectedOption.getAttribute('data-gla'), 10) === 1;
        };

        typeSelect.onchange = () => {
            nameInput.value = AreaManager.generateAreaLabel(typeSelect.value);
            syncGlaCheckbox();
        };
        syncGlaCheckbox();
        
        saveBtn.onclick = () => this.handleFirstAreaSave(polygon);
        cancelBtn.onclick = () => this.handleSplitCancel();
        
        modal.classList.remove('hidden');
        nameInput.focus();
        setTimeout(() => nameInput.select(), 100);
        
        console.log('📝 SPLIT: Showing first area modal');
    }

    /**
     * Handle first area save and show second modal
     */
    handleFirstAreaSave(polygon) {
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        
        polygon.label = nameInput.value.trim() || 'Area 1';
        polygon.type = typeSelect.value;
        polygon.glaType = parseInt(selectedOption.getAttribute('data-gla'), 10);
        
        console.log('✅ SPLIT: First area configured:', polygon.label);
        
        modal.classList.add('hidden');
        this.showSecondAreaModal();
    }

    /**
     * Show second area modal
     */
    showSecondAreaModal() {
        if (!this.pendingSecondArea) {
            console.error('🔥 SPLIT: No second area to configure');
            this.finalizeSplit();
            return;
        }
        
        AppState.drawnPolygons.push(this.pendingSecondArea);
        
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const includeInGLACheckbox = document.getElementById('includeInGLA');
        const modalTitle = modal.querySelector('h3');
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');
        
        if (modalTitle) {
            modalTitle.textContent = `Classify your second area of ${this.pendingSecondArea.area.toFixed(1)} sq ft`;
        }
        
        const defaultType = 'living';
        typeSelect.value = defaultType;
        nameInput.value = AreaManager.generateAreaLabel(defaultType);

        const syncGlaCheckbox = () => {
            if (!includeInGLACheckbox) return;
            const selectedOption = typeSelect.options[typeSelect.selectedIndex];
            includeInGLACheckbox.checked = parseInt(selectedOption.getAttribute('data-gla'), 10) === 1;
        };

        typeSelect.onchange = () => {
            nameInput.value = AreaManager.generateAreaLabel(typeSelect.value);
            syncGlaCheckbox();
        };
        syncGlaCheckbox();
        
        saveBtn.onclick = () => this.handleSecondAreaSave();
        cancelBtn.onclick = () => this.handleSplitCancel();
        
        modal.classList.remove('hidden');
        nameInput.focus();
        setTimeout(() => nameInput.select(), 100);
        
        console.log('📝 SPLIT: Showing second area modal');
    }

    /**
     * Handle second area save and finalize
     */
    handleSecondAreaSave() {
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        
        this.pendingSecondArea.label = nameInput.value.trim() || 'Area 2';
        this.pendingSecondArea.type = typeSelect.value;
        this.pendingSecondArea.glaType = parseInt(selectedOption.getAttribute('data-gla'), 10);
        
        console.log('✅ SPLIT: Second area configured:', this.pendingSecondArea.label);
        
        modal.classList.add('hidden');
        this.finalizeSplit();
    }

    /**
     * Handle split cancellation
     */
    handleSplitCancel() {
        console.log('❌ SPLIT: User cancelled split, reverting');
        
        // Remove any polygons we added during the process
        AppState.drawnPolygons = AppState.drawnPolygons.filter(p => 
            p.id !== this.pendingSecondArea?.id && 
            !p.label.startsWith('Area ')
        );
        
        const modal = document.getElementById('polygonModal');
        modal.classList.add('hidden');
        
        this.cleanupSplit();
    }


getShorterArc(cyclePath, startIndex, endIndex) {
        const pathLength = cyclePath.length;
        if (startIndex === endIndex) return [];
        
        const forwardPath = [];
        let currentIndex = (startIndex + 1) % pathLength;
        while (currentIndex !== endIndex) {
            forwardPath.push({ ...cyclePath[currentIndex] });
            currentIndex = (currentIndex + 1) % pathLength;
        }
        forwardPath.push({ ...cyclePath[endIndex] });

        const backwardPath = [];
        currentIndex = (startIndex - 1 + pathLength) % pathLength;
        while (currentIndex !== endIndex) {
            backwardPath.push({ ...cyclePath[currentIndex] });
            currentIndex = (currentIndex - 1 + pathLength) % pathLength;
        }
        backwardPath.push({ ...cyclePath[endIndex] });

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

        return forwardDistance <= backwardDistance ? forwardPath : backwardPath;
    }

    findPolygonConnection(point) {
        if (!AppState.drawnPolygons) return null;
        const tolerance = 15;
        for (const polygon of AppState.drawnPolygons) {
            const vertexIndex = polygon.path.findIndex(vertex => {
                const dx = point.x - vertex.x;
                const dy = point.y - vertex.y;
                return Math.sqrt(dx * dx + dy * dy) < tolerance;
            });
            if (vertexIndex !== -1) {
                return { polygon, vertexIndex };
            }
        }
        return null;
    }
    
    getCanonicalPathID(path) {
        if (!path || path.length === 0) return '';
        const sortedPathString = path
            .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            .sort()
            .join(';');
        return sortedPathString;
    }
    /**
     * Finalize the split
     */

// In splitter.js, replace your existing finalizeSplit function with this one

// In splitter.js, replace your existing finalizeSplit function with this one

// In splitter.js, replace your existing finalizeSplit function with this one

    finalizeSplit() {
        console.log('🎉 SPLIT: Finalizing split and ensuring all area labels exist.');

        // This robustly finds any polygons that are missing a visual label and creates one.
        AppState.drawnPolygons.forEach(polygon => {
            const labelExists = AppState.placedElements.some(el =>
                el.type === 'area_label' && el.linkedPolygonId === polygon.id
            );
            if (!labelExists) {
                console.log(`Creating missing label for: "${polygon.label}"`);
                this.createAreaLabelElement(polygon);
            }
        });

        // This correctly requests a legend update.
        AppState.emit('app:requestLegendUpdate');
        
        // *** THIS IS THE FIX: This line was added to exit drawing mode. ***
        AppState.emit('app:exitDrawingMode');
        
        // Save and redraw.
        CanvasManager.saveAction();
        CanvasManager.redraw();
        
        this.cleanupSplit();
        console.log('✅ SPLIT: Split completed successfully.');
    }

    /**
     * Create area label element
     */


    createAreaLabelElement(polygon) {
        const areaLabelElement = {
            id: `area_label_${polygon.id}`,
            type: 'area_label',
            content: polygon.label,
            areaData: {
                areaText: polygon.label,
                sqftText: `${polygon.area.toFixed(1)} sq ft`,
                polygonId: polygon.id
            },
            styling: {
                backgroundColor: 'transparent',
                color: '#000',
                textAlign: 'center'
            },
            x: polygon.centroid.x,
            y: polygon.centroid.y,
            width: Math.max(80, polygon.label.length * 8 + 16),
            height: 32,
            draggable: true,
            linkedPolygonId: polygon.id
        };

        AppState.placedElements.push(areaLabelElement);
        console.log('🏷️ SPLIT: Created area label for:', polygon.label);
    }

    /**
     * Clean up after split
     */
    cleanupSplit() {
        this.isProcessingSplit = false;
        this.pendingSecondArea = null;
        
        const modal = document.getElementById('polygonModal');
        const modalTitle = modal.querySelector('h3');
        if (modalTitle) {
            modalTitle.textContent = 'Label Polygon';
        }
    }
}