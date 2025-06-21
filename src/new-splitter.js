// new-splitter.js - Self-contained polygon splitting module
// This module handles all polygon splitting with minimal interaction with drawing.js
// CURRENTLY DISABLED - Safe placeholder for future development

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

export class NewPolygonSplitter {
    constructor() {
        this.isActive = false;
        this.sourcePolygon = null;
        this.startPoint = null;
        this.currentPath = [];
        this.SNAP_RADIUS = 15;
        
        console.log('NewPolygonSplitter: Initialized (DISABLED - Placeholder Mode)');
    }

    init() {
        // Listen for mode changes to detect when we should check for splits
        this.setupEventListeners();
        console.log('NewPolygonSplitter: Event listeners setup (DISABLED - No actions will be taken)');
    }

    setupEventListeners() {
        // DISABLED - Event listeners are registered but do nothing
        AppState.on('app:drawingPointAdded', (e) => this.onDrawingPointAdded(e));
        AppState.on('app:cycleClosed', (e) => this.onCycleClosed(e));
        
        // DISABLED - Keyboard shortcut does nothing
        document.addEventListener('keydown', (e) => {
            if (e.key === 's' && e.ctrlKey && !e.shiftKey) {
                // Do nothing - disabled
                console.log('NewPolygonSplitter: Split mode toggle disabled');
            }
        });
    }

    // Called when a new point is added during drawing
    onDrawingPointAdded(event) {
        // DISABLED - Do nothing
        return;
    }

    // Called when a cycle is closed
    onCycleClosed(event) {
        // DISABLED - Never detect splits, let normal area creation proceed
        return;
    }

    // Detect if a drawn path splits an existing polygon
    detectSplit(path) {
        // DISABLED - Always return false
        return false;
    }

    // Find which polygon (if any) a point connects to
    findPolygonConnection(point) {
        // DISABLED - Always return null
        return null;
    }

    // Execute the split operation
    executeSplit(splittingPath) {
        // DISABLED - Do nothing
        console.log('NewPolygonSplitter: executeSplit called but disabled');
        return;
    }

    // Create two polygons from the split
    createSplitPolygons(originalPolygon, splittingPath, startIdx, endIdx) {
        // DISABLED - Return empty array
        return [];
    }

    // Show modal to label split polygons
    showSplitPolygonModal(polygon1, polygon2) {
        // DISABLED - Do nothing
        return;
    }

    // Clean up associated elements (like area labels)
    cleanupAssociatedElements(polygonId) {
        // DISABLED - Do nothing
        return;
    }

    // Helper: Find vertex index in polygon path
    findVertexIndex(path, point) {
        // DISABLED - Always return -1 (not found)
        return -1;
    }

    // Helper: Calculate distance between two points
    getDistance(p1, p2) {
        // Keep this functional as other code might use it
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Helper: Calculate polygon area
    calculateArea(path) {
        // Keep this functional as other code might use it
        let area = 0;
        for (let i = 0; i < path.length; i++) {
            const j = (i + 1) % path.length;
            area += (path[i].x * path[j].y);
            area -= (path[j].x * path[i].y);
        }
        return Math.abs(area / 2) / 64; // Assuming 8 pixels per foot
    }

    // Helper: Calculate polygon centroid
    calculateCentroid(path) {
        // Keep this functional as other code might use it
        let x = 0, y = 0;
        for (const point of path) {
            x += point.x;
            y += point.y;
        }
        return {
            x: x / path.length,
            y: y / path.length
        };
    }

    // Toggle split mode (optional feature)
    toggleSplitMode() {
        // DISABLED - Do nothing but log
        console.log('NewPolygonSplitter: Split mode toggle is disabled');
        return;
    }

    // Reset splitter state
    reset() {
        // Keep this functional for safety
        this.sourcePolygon = null;
        this.startPoint = null;
        this.currentPath = [];
    }
}

// Create and export singleton instance
export const PolygonSplitter = new NewPolygonSplitter();