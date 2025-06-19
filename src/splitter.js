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
        this.pendingFirstArea = null;    // FIXED: Added this property
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
        const clickRadius = 30; // Same as drawing system
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
                
                if (distance <= clickRadius && distance < closestDistance) {
                    closestDistance = distance;
                    closestVertex = {
                        polygon: polygon,
                        vertexIndex: vertexIndex,
                        vertex: vertex,
                        distance: distance
                    };
                }
            }
        }
        
        if (closestVertex) {
            console.log('🔗 VERTEX: Found vertex in polygon', closestVertex.polygon.label, 'at distance', closestVertex.distance.toFixed(1));
        }
        
        return closestVertex;
    }

    /**
     * NEW: Get the shorter arc between two vertices on a polygon
     */
    getShorterArc(polygonPath, startIndex, endIndex) {
        const pathLength = polygonPath.length;
        
        // Calculate forward path
        let forwardPath = [];
        let currentIndex = startIndex;
        while (currentIndex !== endIndex) {
            currentIndex = (currentIndex + 1) % pathLength;
            forwardPath.push({...polygonPath[currentIndex]});
        }
        
        // Calculate backward path
        let backwardPath = [];
        currentIndex = startIndex;
        while (currentIndex !== endIndex) {
            currentIndex = (currentIndex - 1 + pathLength) % pathLength;
            backwardPath.push({...polygonPath[currentIndex]});
        }
        
        // Return the shorter path
        return forwardPath.length <= backwardPath.length ? forwardPath : backwardPath;
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

    /**
     * Main entry point - analyze the entire connected graph for two-cycle pattern - FIXED
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
            
            // CRITICAL: Mark this event as handled BEFORE doing anything else
            event.splitHandled = true;
            
            // CRITICAL: Stop the event immediately 
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();
            if (event.preventDefault) event.preventDefault();
            
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
        
        // --- START DEBUG LOGGING ---
        console.log('--- DEBUG: GRAPH ANALYSIS INPUT ---');
        try {
            // Log the graph structure
            const simplifiedGraph = {};
            for (const [key, value] of connectedGraph.graph.entries()) {
                simplifiedGraph[key] = value;
            }
            console.log("GRAPH_STRUCTURE:", JSON.stringify(simplifiedGraph, null, 2));

            // Log the vertex details
            const simplifiedVertices = {};
            for (const [key, value] of connectedGraph.vertices.entries()) {
                simplifiedVertices[key] = value;
            }
            console.log("VERTICES:", JSON.stringify(simplifiedVertices, null, 2));

            // Log the calculated degree of each vertex
            const degrees = {};
            for (const [vertex, neighbors] of connectedGraph.graph.entries()) {
                degrees[vertex] = neighbors.length;
            }
            console.log("DEGREES:", JSON.stringify(degrees, null, 2));

        } catch (e) {
            console.error("Error during debug logging:", e);
        }
        console.log('--- END DEBUG LOGGING ---');

        // The original line should come immediately after:
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
     * NEW: Find which polygon a point connects to
     */
    findPolygonConnection(point) {
        const tolerance = 15;
        
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
     * Find connected polygons that share vertices with the new path
     */
    findConnectedPolygons(newPath) {
        const connectedPolygons = [];
        const tolerance = 15;
        
        console.log('🔍 SPLIT: Checking new path against', AppState.drawnPolygons.length, 'existing polygons');
        
        AppState.drawnPolygons.forEach((polygon, polyIndex) => {
            let hasConnection = false;
            
            // Check if any vertex in the new path is close to any vertex in this polygon
            for (const newVertex of newPath) {
                for (const polyVertex of polygon.path) {
                    const dx = newVertex.x - polyVertex.x;
                    const dy = newVertex.y - polyVertex.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance <= tolerance) {
                        hasConnection = true;
                        console.log(`🔍 SPLIT: Found connection between new path and polygon "${polygon.label}"`);
                        break;
                    }
                }
                if (hasConnection) break;
            }
            
            if (hasConnection) {
                connectedPolygons.push(polygon);
            }
        });
        
        return connectedPolygons;
    }

    /**
     * Build unified graph from new path + connected polygons
     */
    buildUnifiedGraph(newPath, connectedPolygons) {
        const graph = new Map();
        const vertices = new Map(); // Map from coordinate key to vertex info
        const tolerance = 15;
        
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
     * Build connected graph
     */
    buildConnectedGraph(newPath) {
        // Find polygons that share vertices with the new path
        const connectedPolygons = this.findConnectedPolygons(newPath);
        
        if (connectedPolygons.length === 0) {
            console.log('🔍 SPLIT: No connected polygons found');
            return null;
        }
        
        console.log('🔍 SPLIT: Found', connectedPolygons.length, 'connected polygons');
        
        // Build unified graph combining all connected polygons and the new path
        return this.buildUnifiedGraph(newPath, connectedPolygons);
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
     * Checks if a given edge exists within a polygon's path.
     * @private
     */
    isEdgeInPolygon(edge, polygonPath) {
        for (let i = 0; i < polygonPath.length; i++) {
            const p1 = polygonPath[i];
            const p2 = polygonPath[(i + 1) % polygonPath.length];
            
            const isMatch = (Math.abs(p1.x - edge[0].x) < 1 && Math.abs(p1.y - edge[0].y) < 1 &&
                             Math.abs(p2.x - edge[1].x) < 1 && Math.abs(p2.y - edge[1].y) < 1) ||
                            (Math.abs(p1.x - edge[1].x) < 1 && Math.abs(p1.y - edge[1].y) < 1 &&
                             Math.abs(p2.x - edge[0].x) < 1 && Math.abs(p2.y - edge[0].y) < 1);
            
            if (isMatch) return true;
        }
        return false;
    }

    /**
     * Constructs a new polygon path by combining a side path and the splitting path.
     * @private
     */
    constructPolygonPath(sidePath, splitPath) {
        // The new polygon is simply the side path followed by the splitting path in reverse,
        // which closes the loop correctly.
        // We skip the last point of the reversed split path because it's the same as the start of the side path.
        return [...sidePath, ...[...splitPath].reverse().slice(1)];
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
                // Found a path to the end
                allPaths.push([...currentPath]);
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
     * Find exactly 3 paths between two junction vertices
     * This ensures we follow actual edges in the graph
     */
    findThreePathsBetweenJunctions(graphData, junctionVertices) {
        const { graph, vertices } = graphData;
        const [junction1, junction2] = junctionVertices;
        
        console.log('🔪 SPLIT: Finding paths between junctions');
        
        // Each junction has exactly 3 neighbors
        const junction1Neighbors = graph.get(junction1);
        const junction2Neighbors = graph.get(junction2);
        
        console.log(`  Junction 1 has ${junction1Neighbors.length} neighbors`);
        console.log(`  Junction 2 has ${junction2Neighbors.length} neighbors`);
        
        const paths = [];
        
        // For each neighbor of junction1, try to find a path to junction2
        for (const startNeighbor of junction1Neighbors) {
            const path = this.findPathToJunction(
                graph, 
                vertices, 
                junction1, 
                startNeighbor, 
                junction2, 
                new Set([junction1])
            );
            
            if (path) {
                console.log(`  Found path with ${path.length} vertices`);
                paths.push(path);
            }
        }
        
        // We should have exactly 3 paths
        if (paths.length === 3) {
            return paths;
        }
        
        // Fallback to original DFS method if needed
        console.warn('🔪 SPLIT: Could not find 3 distinct paths, using fallback');
        return this.findAllPathsBetweenJunctions(graphData, junctionVertices);
    }

    /**
     * Find a path from start through firstStep to target
     * Following actual edges without backtracking
     */
    findPathToJunction(graph, vertices, start, firstStep, target, visited) {
        const path = [];
        const pathVertices = [start];
        
        let current = firstStep;
        let previous = start;
        
        // Keep following edges until we reach the target
        while (current !== target) {
            pathVertices.push(current);
            visited.add(current);
            
            // Find next unvisited neighbor
            const neighbors = graph.get(current) || [];
            let nextVertex = null;
            
            for (const neighbor of neighbors) {
                if (neighbor !== previous && !visited.has(neighbor)) {
                    nextVertex = neighbor;
                    break;
                }
            }
            
            if (!nextVertex) {
                // Dead end - this path doesn't lead to target
                return null;
            }
            
            previous = current;
            current = nextVertex;
        }
        
        // Add the target vertex
        pathVertices.push(target);
        
        // Convert to path format expected by other functions
        return pathVertices;
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
     * Finalize the split - COMPLETELY FIXED VERSION
     */
    performSplit(graphData) {
        AppState.emit('app:exitDrawingMode');

        this.isProcessingSplit = true;
        try {
            // Find the original polygon that's being split
            const originalPolygon = graphData.connectedPolygons[0]; 
            if (!originalPolygon) {
                throw new Error('No original polygon found to split');
            }
            
            console.log('🔪 SPLIT: Original polygon to split:', originalPolygon.label);
            console.log('🔪 SPLIT: Original polygon area:', originalPolygon.area.toFixed(1), 'sq ft');
            
            // CRITICAL: Remove original polygon from the drawn list IMMEDIATELY
            const originalIndex = AppState.drawnPolygons.findIndex(p => p.id === originalPolygon.id);
            if (originalIndex > -1) {
                AppState.drawnPolygons.splice(originalIndex, 1);
                console.log('🔪 SPLIT: Removed original polygon from drawnPolygons');
            }
            
            // Remove associated area label
            const removedLabels = AppState.placedElements.filter(el => 
                el.type === 'area_label' && el.linkedPolygonId === originalPolygon.id
            );
            AppState.placedElements = AppState.placedElements.filter(el => 
                !(el.type === 'area_label' && el.linkedPolygonId === originalPolygon.id)
            );
            console.log(`🔪 SPLIT: Removed ${removedLabels.length} area labels`);
            
            // Force immediate redraw to show original polygon is gone
            CanvasManager.redraw();
            
            const junctionVertices = this.findJunctionVertices(graphData);
            if (junctionVertices.length !== 2) {
                throw new Error(`Expected 2 junction vertices, found ${junctionVertices.length}`);
            }
            
            // Find the three paths between junctions
            const paths = this.findThreePathsBetweenJunctions(graphData, junctionVertices);
            if (paths.length !== 3) {
                throw new Error(`Expected 3 paths, found ${paths.length}`);
            }

            console.log('🔪 SPLIT: Found 3 paths between junctions');
            paths.forEach((path, i) => {
                console.log(`  Path ${i}: ${path.length} vertices`);
            });

            // Identify which path is the splitting path (the new path drawn by user)
            let splittingPathIndex = -1;
            
            // The splitting path is likely the one from the new path drawn by user
            const newPathVertices = new Set(graphData.newPath.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`));
            
            for (let i = 0; i < paths.length; i++) {
                const path = paths[i];
                // Convert path vertices to the same format for comparison
                const pathVertices = path.map(vertexKey => {
                    const vertex = graphData.vertices.get(vertexKey);
                    return `${vertex.x.toFixed(1)},${vertex.y.toFixed(1)}`;
                });
                
                // Check if most vertices in this path match the new path
                const matchingVertices = pathVertices.filter(v => newPathVertices.has(v)).length;
                const matchPercentage = matchingVertices / pathVertices.length;
                
                console.log(`  Path ${i} has ${matchingVertices}/${pathVertices.length} matching vertices (${(matchPercentage * 100).toFixed(1)}%)`);
                
                if (matchPercentage > 0.5) { // More than 50% match
                    splittingPathIndex = i;
                    break;
                }
            }
            
            if (splittingPathIndex === -1) {
                // Fallback: use the shortest path as splitting path
                splittingPathIndex = 0;
                let shortestLength = paths[0].length;
                for (let i = 1; i < paths.length; i++) {
                    if (paths[i].length < shortestLength) {
                        shortestLength = paths[i].length;
                        splittingPathIndex = i;
                    }
                }
                console.log('🔪 SPLIT: Using shortest path as splitting path (fallback)');
            }
            
            const splittingPath = paths[splittingPathIndex];
            const remainingPaths = paths.filter((_, i) => i !== splittingPathIndex);
            
            console.log(`🔪 SPLIT: Using path ${splittingPathIndex} as splitting path`);
            console.log(`🔪 SPLIT: Remaining paths have ${remainingPaths[0].length} and ${remainingPaths[1].length} vertices`);
            
            // Convert vertex keys back to actual coordinates
            const convertPathToCoordinates = (path) => {
                return path.map(vertexKey => {
                    const vertex = graphData.vertices.get(vertexKey);
                    return { x: vertex.x, y: vertex.y };
                });
            };
            
            const splittingCoords = convertPathToCoordinates(splittingPath);
            const path1Coords = convertPathToCoordinates(remainingPaths[0]);
            const path2Coords = convertPathToCoordinates(remainingPaths[1]);
            
            // Create two new polygons by combining each remaining path with the splitting path
            const polygon1 = [...path1Coords];
            const reverseSplittingPath = [...splittingCoords].reverse();
            // Skip first and last vertices of reverse splitting path to avoid duplicates
            for (let i = 1; i < reverseSplittingPath.length - 1; i++) {
                polygon1.push(reverseSplittingPath[i]);
            }
            
            const polygon2 = [...path2Coords];
            // Skip first and last vertices of splitting path to avoid duplicates
            for (let i = 1; i < splittingCoords.length - 1; i++) {
                polygon2.push(splittingCoords[i]);
            }
            
            // Calculate areas
            const area1 = this.calculateArea(polygon1);
            const area2 = this.calculateArea(polygon2);
            
            console.log(`🔪 SPLIT: Created two areas: ${area1.toFixed(1)} sq ft and ${area2.toFixed(1)} sq ft`);
            console.log(`🔪 SPLIT: Original area: ${originalPolygon.area.toFixed(1)} sq ft`);
            console.log(`🔪 SPLIT: Total new area: ${(area1 + area2).toFixed(1)} sq ft`);
            console.log(`🔪 SPLIT: Area difference: ${Math.abs(originalPolygon.area - (area1 + area2)).toFixed(1)} sq ft`);
            
            // Create polygon objects - but DON'T add them to drawnPolygons yet!
            const largerPolygon = this.createPolygonFromCycle(
                area1 > area2 ? polygon1 : polygon2,
                Math.max(area1, area2),
                'Area 1'
            );
            const smallerPolygon = this.createPolygonFromCycle(
                area1 < area2 ? polygon2 : polygon1,
                Math.min(area1, area2),
                'Area 2'
            );
            
            // Store both polygons for the modal workflow
            this.pendingFirstArea = largerPolygon;
            this.pendingSecondArea = smallerPolygon;
            AppState.currentPolygonPoints = [];
            AppState.currentPolygonCounter = 0;
            
            // Force redraw again to ensure original polygon stays gone
            CanvasManager.redraw();
            
            // Show the first area modal
            this.showFirstAreaModal(largerPolygon, largerPolygon.area);
            
        } catch (error) {
            console.error('🔥 SPLIT: Error during split:', error);
            this.isProcessingSplit = false;
        }
    }

    /**
     * Show first area modal - FIXED VERSION that doesn't add polygon yet
     */
    showFirstAreaModal(polygon, area) {
        // CRITICAL: DO NOT add the polygon to drawnPolygons here!
        
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
        
        console.log('📝 SPLIT: Showing first area modal (polygon NOT yet added to drawnPolygons)');
    }

    /**
     * Handle first area save - FIXED VERSION
     */
    handleFirstAreaSave(polygon) {
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        
        polygon.label = nameInput.value.trim() || 'Area 1';
        polygon.type = typeSelect.value;
        polygon.glaType = parseInt(selectedOption.getAttribute('data-gla'), 10);
        
        // NOW add the first polygon to drawnPolygons
        AppState.drawnPolygons.push(polygon);
        
        console.log('✅ SPLIT: First area configured and added:', polygon.label);
        
        modal.classList.add('hidden');
        this.showSecondAreaModal();
    }

    /**
     * Show second area modal - FIXED VERSION
     */
    showSecondAreaModal() {
        if (!this.pendingSecondArea) {
            console.error('🔥 SPLIT: No second area to configure');
            this.finalizeSplit();
            return;
        }
        
        // CRITICAL: DO NOT add the second polygon here either!
        
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
        
        const defaultType = 'garage';
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
        
        console.log('📝 SPLIT: Showing second area modal (polygon NOT yet added to drawnPolygons)');
    }

    /**
     * Handle second area save - NEW METHOD
     */
    handleSecondAreaSave() {
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        
        this.pendingSecondArea.label = nameInput.value.trim() || 'Area 2';
        this.pendingSecondArea.type = typeSelect.value;
        this.pendingSecondArea.glaType = parseInt(selectedOption.getAttribute('data-gla'), 10);
        
        // NOW add the second polygon to drawnPolygons
        AppState.drawnPolygons.push(this.pendingSecondArea);
        
        console.log('✅ SPLIT: Second area configured and added:', this.pendingSecondArea.label);
        
        modal.classList.add('hidden');
        this.finalizeSplit();
    }

    /**
     * Handle split cancellation - NEW METHOD
     */
    handleSplitCancel() {
        console.log('❌ SPLIT: Split cancelled by user');
        
        const modal = document.getElementById('polygonModal');
        modal.classList.add('hidden');
        
        this.cleanupSplit();
        CanvasManager.redraw();
    }

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

    // Add this helper function for showing single area modal
    showSingleAreaModal(newPolygonToClassify, area) {
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const includeInGLACheckbox = document.getElementById('includeInGLA');
        const modalTitle = modal.querySelector('h3');
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');

        modalTitle.textContent = `Classify Your New Area of ${area.toFixed(1)} sq ft`;
        const defaultType = 'garage'; // Default to garage for split areas
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
    }

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
        
        // Exit drawing mode if somehow still active.
        AppState.emit('app:exitDrawingMode');
        
        // Save and redraw.
        CanvasManager.saveAction();
        CanvasManager.redraw();
        
        this.cleanupSplit();
        console.log('✅ SPLIT: Split completed successfully.');
    }

    /**
     * Clean up after split - UPDATED
     */
    cleanupSplit() {
        this.isProcessingSplit = false;
        this.pendingFirstArea = null;    
        this.pendingSecondArea = null;
        
        const modal = document.getElementById('polygonModal');
        const modalTitle = modal.querySelector('h3');
        if (modalTitle) {
            modalTitle.textContent = 'Label Polygon';
        }
    }
}