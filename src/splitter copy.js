// src/splitter.js - Automatic polygon splitting when two cycles are detected
// ENHANCED to also handle vertex connections to existing polygons

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { AreaHelpers } from './helpers.js';

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
    interceptDrawingClick(e) {
        // Only intercept if we have an active drawing path
        if (!AppState.currentPolygonPoints || AppState.currentPolygonPoints.length === 0) {
            return; // Let normal drawing handle first vertex
        }
        
        // Get click coordinates
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left) - AppState.viewportTransform.x;
        const canvasY = (e.clientY - rect.top) - AppState.viewportTransform.y;
        
        console.log('🔗 VERTEX: Intercepting drawing click at:', canvasX.toFixed(1), canvasY.toFixed(1));
        
        // Check if click is on an existing polygon vertex
        const existingVertex = this.findExistingPolygonVertex(canvasX, canvasY);
        
        if (existingVertex) {
            console.log('✅ VERTEX: Found existing polygon vertex!');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Add this vertex to the current drawing path
            this.connectToExistingVertex(existingVertex);
            return true; // Handled
        }
        
        // Let normal drawing continue
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
    performSplit(graphData) {
        this.isProcessingSplit = true;
        
        try {
            console.log('🔪 SPLIT: Starting graph decomposition');
            
            // FIRST: Remove all connected polygons from AppState immediately
            console.log('🔪 SPLIT: Removing original connected polygons');
            graphData.connectedPolygons.forEach(polygon => {
                const index = AppState.drawnPolygons.indexOf(polygon);
                if (index > -1) {
                    AppState.drawnPolygons.splice(index, 1);
                    console.log('🔪 SPLIT: Removed original polygon:', polygon.label);
                }
            });
            
            // Also remove any associated area labels
            const polygonIds = graphData.connectedPolygons.map(p => p.id);
            AppState.placedElements = AppState.placedElements.filter(el => 
                !(el.type === 'area_label' && polygonIds.includes(el.linkedPolygonId))
            );
            
            // Find junction vertices (degree 3)
            const junctionVertices = this.findJunctionVertices(graphData);
            console.log('🔪 SPLIT: Junction vertices:', junctionVertices);
            
            if (junctionVertices.length !== 2) {
                throw new Error(`Expected 2 junction vertices, found ${junctionVertices.length}`);
            }
            
            // Find all paths between junctions
            const paths = this.findAllPathsBetweenJunctions(graphData, junctionVertices);
            console.log('🔪 SPLIT: Found', paths.length, 'paths between junctions');
            paths.forEach((path, index) => {
                console.log(`🔪 SPLIT: Path ${index}: ${path.length} vertices`);
            });
            
            if (paths.length !== 3) {
                throw new Error(`Expected 3 paths, found ${paths.length}`);
            }
            
            // NEW: Identify shared path more intelligently
            // The shared path is usually the one that was part of the original polygon
            const sharedPathIndex = this.identifySharedPath(paths, graphData);
            const sharedPath = paths[sharedPathIndex];
            const otherPaths = paths.filter((_, index) => index !== sharedPathIndex);
            
            console.log('🔪 SPLIT: Identified path', sharedPathIndex, 'as shared path');
            console.log('🔪 SPLIT: Shared path has', sharedPath.length, 'vertices');
            console.log('🔪 SPLIT: Other paths have', otherPaths[0].length, 'and', otherPaths[1].length, 'vertices');
            
            // Construct the two cycles by combining each side path with shared path
            const cycle1 = this.constructCleanCycle(otherPaths[0], sharedPath);
            const cycle2 = this.constructCleanCycle(otherPaths[1], sharedPath);
            
            console.log('🔪 SPLIT: Clean cycle 1 has', cycle1.length, 'vertices');
            console.log('🔪 SPLIT: Clean cycle 2 has', cycle2.length, 'vertices');
            
            // Calculate areas
            const area1 = this.calculateArea(cycle1);
            const area2 = this.calculateArea(cycle2);
            
            console.log(`🔪 SPLIT: Areas - Cycle 1: ${area1.toFixed(1)} sq ft, Cycle 2: ${area2.toFixed(1)} sq ft`);
            
            // Determine larger and smaller cycles
            const isFirstLarger = area1 >= area2;
            const largerCycle = isFirstLarger ? cycle1 : cycle2;
            const smallerCycle = isFirstLarger ? cycle2 : cycle1;
            const largerArea = Math.max(area1, area2);
            const smallerArea = Math.min(area1, area2);
            
            // Create new polygon objects
            const largerPolygon = this.createPolygonFromCycle(largerCycle, largerArea, 'Area 1');
            const smallerPolygon = this.createPolygonFromCycle(smallerCycle, smallerArea, 'Area 2');
            
            // Store for modal sequence
            this.pendingSecondArea = smallerPolygon;
            
            // Clear current drawing path since we're taking over
            AppState.currentPolygonPoints = [];
            AppState.currentPolygonCounter = 0;
            
            // Immediately redraw to show the removal
            CanvasManager.redraw();
            
            // Start the modal sequence with the larger area
            this.showFirstAreaModal(largerPolygon, largerArea);
            
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
        
        if (modalTitle) {
            modalTitle.textContent = `Classify your first area of ${area.toFixed(1)} sq ft`;
        }
        
        nameInput.value = 'Area 1';
        typeSelect.value = 'living';
        if (includeInGLACheckbox) {
            includeInGLACheckbox.checked = true;
        }
        
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');
        
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
        const includeInGLACheckbox = document.getElementById('includeInGLA');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        
        polygon.label = nameInput.value.trim() || 'Area 1';
        polygon.type = typeSelect.value;
        polygon.glaType = includeInGLACheckbox && includeInGLACheckbox.checked ? 1 : parseInt(selectedOption.getAttribute('data-gla'), 10);
        
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
        
        if (modalTitle) {
            modalTitle.textContent = `Classify your second area of ${this.pendingSecondArea.area.toFixed(1)} sq ft`;
        }
        
        nameInput.value = 'Area 2';
        typeSelect.value = 'living';
        if (includeInGLACheckbox) {
            includeInGLACheckbox.checked = true;
        }
        
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');
        
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
        const includeInGLACheckbox = document.getElementById('includeInGLA');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        
        this.pendingSecondArea.label = nameInput.value.trim() || 'Area 2';
        this.pendingSecondArea.type = typeSelect.value;
        this.pendingSecondArea.glaType = includeInGLACheckbox && includeInGLACheckbox.checked ? 1 : parseInt(selectedOption.getAttribute('data-gla'), 10);
        
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

    /**
     * Finalize the split
     */
    finalizeSplit() {
        console.log('🎉 SPLIT: Finalizing split with both areas configured');
        
        // Create area label elements
        AppState.drawnPolygons.slice(-2).forEach(polygon => {
            this.createAreaLabelElement(polygon);
        });
        
        // Force legend update by triggering area manager update
        if (window.areaManager && typeof window.areaManager.updateLegendCalculations === 'function') {
            console.log('🎉 SPLIT: Triggering area manager legend update');
            window.areaManager.updateLegendCalculations();
        } else {
            // Try alternative methods to update legend
            AppState.emit('app:legendUpdate');
            AppState.emit('canvas:redraw:polygons');
        }
        
        // Save and redraw
        CanvasManager.saveAction();
        CanvasManager.redraw();
        
        this.cleanupSplit();
        console.log('✅ SPLIT: Split completed successfully with legend update');
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