// src/modules/AreaManagement/AreaSplitter.js
// Polygon splitting logic - completely independent module

import { AppState } from '../../core/AppState.js';
import { eventBus } from '../../core/EventBus.js';
import { GeometryUtils } from '../../core/GeometryUtils.js';

export class AreaSplitter {
    constructor() {
        this.PIXELS_PER_FOOT = 8;
        this.isProcessingSplit = false;
        this.pendingSecondArea = null;
        this.originalPolygons = [];
        
        console.log('AreaSplitter: Initialized with modular architecture');
    }

    init() {
        // Listen for cycle completion to check for splits
        eventBus.on('drawing:cycleCompleted', (data) => this.checkForSplit(data));
        
        // Listen for split requests
        eventBus.on('area:splitRequested', (data) => this.performSplit(data));
        
        console.log('AreaSplitter: Event listeners initialized');
    }

    /**
     * Check if a completed cycle creates a split
     */
    checkForSplit(data) {
        const { path } = data;
        if (!path || path.length < 3) return false;

        console.log('AreaSplitter: Checking for potential split');

        // Build connected graph from new path and existing areas
        const connectedGraph = this.buildConnectedGraph(path);
        
        if (!connectedGraph) {
            console.log('AreaSplitter: No connected graph found');
            return false;
        }

        // Check if this forms a two-cycle pattern (area split)
        if (this.isTwoCyclePattern(connectedGraph)) {
            console.log('AreaSplitter: Two-cycle pattern detected - performing split');
            this.executeSplit(connectedGraph);
            return true; // Split handled
        }

        return false; // No split, continue with normal area creation
    }

    /**
     * Build connected graph from new path and existing areas
     */
    buildConnectedGraph(newPath) {
        // Find existing areas that share vertices with the new path
        const connectedAreas = this.findConnectedAreas(newPath);
        
        if (connectedAreas.length === 0) {
            console.log('AreaSplitter: New path not connected to existing areas');
            return null;
        }

        console.log('AreaSplitter: Found', connectedAreas.length, 'connected areas');
        
        // Build unified graph
        return this.buildUnifiedGraph(newPath, connectedAreas);
    }

    /**
     * Find existing areas that share vertices with new path
     */
    findConnectedAreas(newPath) {
        const connectedAreas = [];
        const tolerance = 5; // pixels

        for (const area of AppState.drawnPolygons) {
            for (const newVertex of newPath) {
                for (const areaVertex of area.path) {
                    const distance = GeometryUtils.distance(newVertex, areaVertex);
                    
                    if (distance <= tolerance) {
                        console.log(`AreaSplitter: Found connection to area "${area.label}"`);
                        connectedAreas.push(area);
                        break;
                    }
                }
                if (connectedAreas.includes(area)) break;
            }
        }

        return connectedAreas;
    }

    /**
     * Build unified graph from new path and connected areas
     */
    buildUnifiedGraph(newPath, connectedAreas) {
        const graph = new Map();
        const vertices = new Map();
        const tolerance = 5;

        // Helper to get coordinate key
        const getKey = (point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`;

        // Helper to add vertex
        const addVertex = (point, source) => {
            const key = getKey(point);
            
            // Check for nearby existing vertices
            for (const [existingKey, existingVertex] of vertices) {
                const [existingX, existingY] = existingKey.split(',').map(Number);
                const distance = GeometryUtils.distance(point, { x: existingX, y: existingY });
                
                if (distance <= tolerance) {
                    return existingKey; // Merge with existing
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
                if (!graph.get(key1).includes(key2)) {
                    graph.get(key1).push(key2);
                    graph.get(key2).push(key1);
                }
            }
        };

        // Add existing areas to graph
        connectedAreas.forEach((area, areaIndex) => {
            const areaVertexKeys = [];
            
            // Add vertices
            area.path.forEach(vertex => {
                const key = addVertex(vertex, `area_${areaIndex}`);
                areaVertexKeys.push(key);
            });
            
            // Add edges (area is a cycle)
            for (let i = 0; i < areaVertexKeys.length; i++) {
                const current = areaVertexKeys[i];
                const next = areaVertexKeys[(i + 1) % areaVertexKeys.length];
                addEdge(current, next);
            }
        });

        // Add new path to graph
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

        return {
            graph,
            vertices,
            connectedAreas,
            newPath
        };
    }

    /**
     * Check if graph represents two-cycle pattern
     */
    isTwoCyclePattern(graphData) {
        const { graph } = graphData;
        
        const V = graph.size;
        let E = 0;
        const degrees = [];

        // Count edges and degrees
        for (const [vertex, neighbors] of graph) {
            const degree = neighbors.length;
            degrees.push(degree);
            E += degree;
        }

        E = E / 2; // Each edge counted twice

        console.log(`AreaSplitter: Graph analysis - V:${V}, E:${E}, Expected E:${V + 1}`);

        // Two-cycle condition: |E| = |V| + 1
        if (E !== V + 1) {
            console.log('AreaSplitter: Edge count condition failed');
            return false;
        }

        // Degree condition: exactly two degree-3 vertices, rest degree-2
        const degreeCount = degrees.reduce((acc, deg) => {
            acc[deg] = (acc[deg] || 0) + 1;
            return acc;
        }, {});

        const hasTwoDegree3 = degreeCount[3] === 2;
        const restAreDegree2 = degreeCount[2] === V - 2;
        const noOtherDegrees = Object.keys(degreeCount).length === 2;

        if (hasTwoDegree3 && restAreDegree2 && noOtherDegrees) {
            console.log('AreaSplitter: Two-cycle pattern confirmed');
            return true;
        }

        console.log('AreaSplitter: Not a two-cycle pattern');
        return false;
    }

    /**
     * Execute the split operation
     */
    executeSplit(graphData) {
        if (this.isProcessingSplit) return;
        
        this.isProcessingSplit = true;
        this.originalPolygons = [...graphData.connectedAreas];

        try {
            // Remove original areas from state
            graphData.connectedAreas.forEach(area => {
                const index = AppState.drawnPolygons.indexOf(area);
                if (index > -1) {
                    AppState.drawnPolygons.splice(index, 1);
                }
            });

            // Remove associated label elements
            const areaIds = graphData.connectedAreas.map(a => a.id);
            AppState.placedElements = AppState.placedElements.filter(el => 
                !(el.type === 'area_label' && areaIds.includes(el.linkedPolygonId))
            );

            // Find junction vertices and paths
            const junctionVertices = this.findJunctionVertices(graphData);
            const paths = this.findPathsBetweenJunctions(graphData, junctionVertices);

            // Create two cycles from the three paths
            const cycles = this.createCyclesFromPaths(paths);
            
            // Sort by area to identify the correct two inner cycles
            const sortedCycles = cycles
                .map(cycle => ({
                    path: cycle,
                    area: this.calculateArea(cycle)
                }))
                .sort((a, b) => b.area - a.area);

            // Take the two smaller cycles (inner areas)
            const finalCycle1 = sortedCycles[1].path;
            const finalCycle2 = sortedCycles[2].path;

            // Check if either matches an original area
            const cycle1Matches = this.matchesOriginalArea(finalCycle1);
            const cycle2Matches = this.matchesOriginalArea(finalCycle2);

            if ((cycle1Matches && !cycle2Matches) || (!cycle1Matches && cycle2Matches)) {
                this.handleSingleNewArea(finalCycle1, finalCycle2, cycle1Matches, cycle2Matches);
            } else {
                this.handleTwoNewAreas(finalCycle1, finalCycle2);
            }

        } catch (error) {
            console.error('AreaSplitter: Error during split:', error);
            this.cleanupSplit();
        }
    }

    /**
     * Find junction vertices (degree 3)
     */
    findJunctionVertices(graphData) {
        const junctions = [];
        
        for (const [vertex, neighbors] of graphData.graph) {
            if (neighbors.length === 3) {
                junctions.push(vertex);
            }
        }

        return junctions;
    }

    /**
     * Find paths between junction vertices
     */
    findPathsBetweenJunctions(graphData, junctionVertices) {
        const [start, end] = junctionVertices;
        const allPaths = [];
        const visited = new Set();
        const currentPath = [];

        const dfs = (current) => {
            currentPath.push(current);
            visited.add(current);

            if (current === end && currentPath.length > 1) {
                // Convert to coordinate points
                const pathPoints = currentPath.map((vertexKey, index) => {
                    const vertex = graphData.vertices.get(vertexKey);
                    return {
                        x: vertex.x,
                        y: vertex.y,
                        name: `path${allPaths.length}_p${index}`
                    };
                });
                allPaths.push([...pathPoints]);
            } else if (current !== end) {
                const neighbors = graphData.graph.get(current) || [];
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        dfs(neighbor);
                    }
                }
            }

            currentPath.pop();
            visited.delete(current);
        };

        dfs(start);
        return allPaths;
    }

    /**
     * Create cycles from paths
     */
    createCyclesFromPaths(paths) {
        if (paths.length !== 3) {
            throw new Error(`Expected 3 paths, got ${paths.length}`);
        }

        const cycles = [];
        
        // Create all possible combinations of two paths
        for (let i = 0; i < paths.length; i++) {
            for (let j = i + 1; j < paths.length; j++) {
                const cycle = this.combinePaths(paths[i], paths[j]);
                cycles.push(cycle);
            }
        }

        return cycles;
    }

    /**
     * Combine two paths into a cycle
     */
    combinePaths(path1, path2) {
        const cycle = [...path1];
        
        // Add path2 in reverse, excluding junction vertices to avoid duplicates
        const reversedPath2 = [...path2].reverse();
        for (let i = 1; i < reversedPath2.length - 1; i++) {
            cycle.push(reversedPath2[i]);
        }

        return cycle;
    }

    /**
     * Check if cycle matches an original area
     */
    matchesOriginalArea(cycle) {
        const cycleId = this.getCanonicalPathId(cycle);
        
        return this.originalPolygons.some(area => {
            const areaId = this.getCanonicalPathId(area.path);
            return areaId === cycleId;
        });
    }

    /**
     * Get canonical path ID for comparison
     */
    getCanonicalPathId(path) {
        return path
            .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            .sort()
            .join(';');
    }

    /**
     * Handle case with single new area
     */
    handleSingleNewArea(cycle1, cycle2, cycle1Matches, cycle2Matches) {
        console.log('AreaSplitter: Single new area detected');

        // Restore the unchanged area
        const unchangedArea = cycle1Matches ? 
            this.originalPolygons.find(a => this.getCanonicalPathId(a.path) === this.getCanonicalPathId(cycle1)) :
            this.originalPolygons.find(a => this.getCanonicalPathId(a.path) === this.getCanonicalPathId(cycle2));

        if (unchangedArea) {
            AppState.drawnPolygons.push(unchangedArea);
            eventBus.emit('area:labelRequested', { area: unchangedArea });
        }

        // Create new area from the non-matching cycle
        const newCycle = cycle1Matches ? cycle2 : cycle1;
        const newArea = this.createAreaFromCycle(newCycle, 'New Area');
        AppState.drawnPolygons.push(newArea);

        // Show classification modal for new area
        this.showAreaClassificationModal(newArea);
    }

    /**
     * Handle case with two new areas
     */
    handleTwoNewAreas(cycle1, cycle2) {
        console.log('AreaSplitter: Two new areas detected');

        const area1 = this.createAreaFromCycle(cycle1, 'Area 1');
        const area2 = this.createAreaFromCycle(cycle2, 'Area 2');

        // Start with larger area first
        if (area1.area >= area2.area) {
            this.pendingSecondArea = area2;
            this.showFirstAreaModal(area1);
        } else {
            this.pendingSecondArea = area1;
            this.showFirstAreaModal(area2);
        }
    }

    /**
     * Create area object from cycle
     */
    createAreaFromCycle(cycle, label) {
        return {
            id: Date.now() + Math.random(),
            path: cycle.map((point, index) => ({
                x: point.x,
                y: point.y,
                name: `p${index}`
            })),
            label: label,
            type: 'living',
            glaType: 1,
            area: this.calculateArea(cycle),
            centroid: GeometryUtils.calculateCentroid(cycle)
        };
    }

    /**
     * Calculate area in square feet
     */
    calculateArea(cycle) {
        const areaInPixels = GeometryUtils.calculatePolygonArea(cycle);
        return areaInPixels / (this.PIXELS_PER_FOOT * this.PIXELS_PER_FOOT);
    }

    /**
     * Show area classification modal
     */
    showAreaClassificationModal(area) {
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const modalTitle = modal.querySelector('h3');
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');

        modalTitle.textContent = `Classify Your New Area of ${area.area.toFixed(1)} sq ft`;
        
        const defaultType = 'living';
        typeSelect.value = defaultType;
        nameInput.value = this.generateAreaLabel(defaultType);

        typeSelect.onchange = () => {
            nameInput.value = this.generateAreaLabel(typeSelect.value);
        };

        saveBtn.onclick = () => {
            const selectedOption = typeSelect.options[typeSelect.selectedIndex];
            area.label = nameInput.value.trim();
            area.type = typeSelect.value;
            area.glaType = parseInt(selectedOption.getAttribute('data-gla'), 10);
            
            modal.classList.add('hidden');
            this.finalizeSplit();
        };

        cancelBtn.onclick = () => this.cancelSplit();

        modal.classList.remove('hidden');
        nameInput.focus();
    }

    /**
     * Show first area modal for two-area split
     */
    showFirstAreaModal(area) {
        AppState.drawnPolygons.push(area);
        
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const modalTitle = modal.querySelector('h3');
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');

        modalTitle.textContent = `Classify your first area of ${area.area.toFixed(1)} sq ft`;
        
        const defaultType = 'living';
        typeSelect.value = defaultType;
        nameInput.value = this.generateAreaLabel(defaultType);

        typeSelect.onchange = () => {
            nameInput.value = this.generateAreaLabel(typeSelect.value);
        };

        saveBtn.onclick = () => {
            const selectedOption = typeSelect.options[typeSelect.selectedIndex];
            area.label = nameInput.value.trim();
            area.type = typeSelect.value;
            area.glaType = parseInt(selectedOption.getAttribute('data-gla'), 10);
            
            modal.classList.add('hidden');
            this.showSecondAreaModal();
        };

        cancelBtn.onclick = () => this.cancelSplit();

        modal.classList.remove('hidden');
        nameInput.focus();
    }

    /**
     * Show second area modal
     */
    showSecondAreaModal() {
        if (!this.pendingSecondArea) {
            this.finalizeSplit();
            return;
        }

        AppState.drawnPolygons.push(this.pendingSecondArea);
        
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const modalTitle = modal.querySelector('h3');
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');

        modalTitle.textContent = `Classify your second area of ${this.pendingSecondArea.area.toFixed(1)} sq ft`;
        
        const defaultType = 'living';
        typeSelect.value = defaultType;
        nameInput.value = this.generateAreaLabel(defaultType);

        typeSelect.onchange = () => {
            nameInput.value = this.generateAreaLabel(typeSelect.value);
        };

        saveBtn.onclick = () => {
            const selectedOption = typeSelect.options[typeSelect.selectedIndex];
            this.pendingSecondArea.label = nameInput.value.trim();
            this.pendingSecondArea.type = typeSelect.value;
            this.pendingSecondArea.glaType = parseInt(selectedOption.getAttribute('data-gla'), 10);
            
            modal.classList.add('hidden');
            this.finalizeSplit();
        };

        cancelBtn.onclick = () => this.cancelSplit();

        modal.classList.remove('hidden');
        nameInput.focus();
    }

    /**
     * Generate area label
     */
    generateAreaLabel(areaType) {
        const typeSelect = document.getElementById('polygonType');
        if (!typeSelect) return `Area ${AppState.drawnPolygons.length + 1}`;

        const targetOption = typeSelect.querySelector(`option[value="${areaType}"]`);
        if (!targetOption) return `Area ${AppState.drawnPolygons.length + 1}`;

        const baseName = targetOption.textContent.trim().replace(/\s*\([^)]*\)/g, '').trim();
        const existingCount = AppState.drawnPolygons.filter(a => a.type === areaType).length;

        return `${baseName} ${existingCount + 1}`;
    }

    /**
     * Cancel split operation
     */
    cancelSplit() {
        console.log('AreaSplitter: Split cancelled, reverting changes');
        
        // Remove any areas added during split
        AppState.drawnPolygons = AppState.drawnPolygons.filter(area => 
            !area.label.startsWith('Area ') && area.label !== 'New Area'
        );

        // Restore original areas
        this.originalPolygons.forEach(area => {
            AppState.drawnPolygons.push(area);
        });

        const modal = document.getElementById('polygonModal');
        modal.classList.add('hidden');
        
        this.cleanupSplit();
    }

    /**
     * Finalize split operation
     */
    finalizeSplit() {
        console.log('AreaSplitter: Finalizing split');

        // Create labels for all areas
        AppState.drawnPolygons.forEach(area => {
            const hasLabel = AppState.placedElements.some(el => 
                el.type === 'area_label' && el.linkedPolygonId === area.id
            );
            
            if (!hasLabel) {
                eventBus.emit('area:labelRequested', { area });
            }
        });

        // Notify systems
        eventBus.emit('drawing:exitRequested');
        eventBus.emit('legend:updateRequested');
        eventBus.emit('history:saveAction');
        
        this.cleanupSplit();
        console.log('AreaSplitter: Split completed successfully');
    }

    /**
     * Clean up split state
     */
    cleanupSplit() {
        this.isProcessingSplit = false;
        this.pendingSecondArea = null;
        this.originalPolygons = [];
        
        // Reset modal title
        const modal = document.getElementById('polygonModal');
        const modalTitle = modal.querySelector('h3');
        if (modalTitle) {
            modalTitle.textContent = 'Label Polygon';
        }
    }
}
