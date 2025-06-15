// src/canvas/CanvasManager.js - Canvas setup, viewport, transforms
import { eventBus } from '../core/EventBus.js';

export class CanvasManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.viewportTransform = { x: 0, y: 0, scale: 1 };
        this.actionHistory = [];
        this.historyIndex = -1;
        this.isInitialized = false;
    }

    static getInstance() {
        if (!CanvasManager.instance) {
            CanvasManager.instance = new CanvasManager();
        }
        return CanvasManager.instance;
    }

    static init(canvasElement) {
        console.log('CanvasManager: Initializing canvas');
        
        const manager = CanvasManager.getInstance();
        manager.canvas = canvasElement;
        manager.ctx = canvasElement.getContext('2d');
        
        // Set a fixed canvas size of 10,000 x 10,000 pixels
        // for a consistently large drawing area on all devices.
        manager.canvas.width = 10000;
        manager.canvas.height = 10000;
        
        console.log('CanvasManager: Canvas initialized with fixed size:', manager.canvas.width, 'x', manager.canvas.height);

        // Set the initial viewport to the center of the large canvas for any new sketch.
        const viewport = document.getElementById('canvasViewport');
        if (viewport) {
            const viewportWidth = viewport.clientWidth;
            const viewportHeight = viewport.clientHeight;

            // This transform pans the canvas so its center aligns with the viewport's center.
            manager.viewportTransform.x = -(manager.canvas.width / 2) + (viewportWidth / 2);
            manager.viewportTransform.y = -(manager.canvas.height / 2) + (viewportHeight / 2);
            
            // Apply the initial transform to the canvas container element.
            CanvasManager.updateViewportTransform();
            console.log('CanvasManager: Initial viewport centered on canvas at:', manager.viewportTransform);
        }
        
        // ADDED: Call to set up event listeners for this module.
        manager.setupEventListeners();

        manager.isInitialized = true;
        eventBus.emit('canvas:initialized', { canvas: manager.canvas, ctx: manager.ctx });
        
        return manager;
    }

    // ADDED: This new method listens for the 'view:reset' event.
    setupEventListeners() {
        // Listen for the event from ControlsManager and call the existing resetViewport method.
        eventBus.on('view:reset', () => CanvasManager.resetViewport());
    }

    static getCanvas() {
        const manager = CanvasManager.getInstance();
        return manager.canvas;
    }

    static getContext() {
        const manager = CanvasManager.getInstance();
        return manager.ctx;
    }

    static getViewportTransform() {
        const manager = CanvasManager.getInstance();
        return { ...manager.viewportTransform };
    }

    static setViewportTransform(transform) {
        const manager = CanvasManager.getInstance();
        manager.viewportTransform = { ...transform };
        CanvasManager.updateViewportTransform();
        eventBus.emit('viewport:transformed', { transform: manager.viewportTransform });
    }

    static redraw() {
        const manager = CanvasManager.getInstance();
        if (!manager.isInitialized || !manager.ctx || !manager.canvas) {
            console.warn('CanvasManager: Canvas not initialized, skipping redraw');
            return;
        }
        
        // Clear canvas
        manager.ctx.clearRect(0, 0, manager.canvas.width, manager.canvas.height);
        
        // Save context state
        manager.ctx.save();
        
        // *** LAYER 1: Background elements (grid, etc.) ***
        eventBus.emit('canvas:redraw:background', { 
            ctx: manager.ctx, 
            canvas: manager.canvas,
            viewport: manager.viewportTransform
        });
        
        // *** LAYER 2: Drawn polygons (floor plan areas) ***
        eventBus.emit('canvas:redraw:polygons', { 
            ctx: manager.ctx, 
            canvas: manager.canvas,
            viewport: manager.viewportTransform
        });
        
        // *** LAYER 3: Drawn lines (individual lines) ***
        eventBus.emit('canvas:redraw:lines', { 
            ctx: manager.ctx, 
            canvas: manager.canvas,
            viewport: manager.viewportTransform
        });
        
        // *** LAYER 4: Placed elements (room labels & icons) ***
        eventBus.emit('canvas:redraw:elements', { 
            ctx: manager.ctx, 
            canvas: manager.canvas,
            viewport: manager.viewportTransform
        });
        
        // *** LAYER 5: UI overlays (edit handles, etc.) ***
        eventBus.emit('canvas:redraw:ui', { 
            ctx: manager.ctx, 
            canvas: manager.canvas,
            viewport: manager.viewportTransform
        });
        
        // *** LAYER 6 (TOP): Current drawing elements - ALWAYS ON TOP ***
        eventBus.emit('canvas:redraw:drawing-overlay', { 
            ctx: manager.ctx, 
            canvas: manager.canvas,
            viewport: manager.viewportTransform
        });
        
        // Restore context state
        manager.ctx.restore();
        
        eventBus.emit('canvas:redrawn', { timestamp: Date.now() });
    }

    static saveAction(stateSnapshot) {
        const manager = CanvasManager.getInstance();
        if (!manager.isInitialized) return;
        
        manager.historyIndex++;
        manager.actionHistory = manager.actionHistory.slice(0, manager.historyIndex);
        
        // Ensure viewport transform is included in the snapshot
        const snapshot = {
            ...stateSnapshot,
            viewportTransform: {
                x: manager.viewportTransform.x,
                y: manager.viewportTransform.y,
                scale: manager.viewportTransform.scale
            },
            timestamp: Date.now()
        };
        
        manager.actionHistory.push(snapshot);
        
        console.log('CanvasManager: Action saved, history length:', manager.actionHistory.length);
        eventBus.emit('history:saved', { 
            historyLength: manager.actionHistory.length,
            historyIndex: manager.historyIndex
        });
    }

    static undo() {
        const manager = CanvasManager.getInstance();
        if (!manager.isInitialized) return null;
        
        console.log('--- UNDO: Button Pressed ---');
        if (manager.historyIndex <= 0) {
            console.log('Undo: No more actions to undo.');
            manager.historyIndex = 0;
            const firstState = manager.actionHistory[0] || null;
            if (firstState && firstState.viewportTransform) {
                manager.viewportTransform = { ...firstState.viewportTransform };
                CanvasManager.updateViewportTransform();
            }
            eventBus.emit('history:undone', { state: firstState, atBeginning: true });
            return firstState;
        } else {
            manager.historyIndex--;
            const stateToRestore = manager.actionHistory[manager.historyIndex];
            if (stateToRestore) {
                // Restore viewport transform
                if (stateToRestore.viewportTransform) {
                    manager.viewportTransform = { ...stateToRestore.viewportTransform };
                    CanvasManager.updateViewportTransform();
                }
                console.log('Restored state to index:', manager.historyIndex);
                eventBus.emit('history:undone', { state: stateToRestore, index: manager.historyIndex });
            }
            return stateToRestore;
        }
    }
    
    static redo() {
        const manager = CanvasManager.getInstance();
        if (!manager.isInitialized) return null;
        
        if (manager.historyIndex < manager.actionHistory.length - 1) {
            manager.historyIndex++;
            const snapshot = manager.actionHistory[manager.historyIndex];
            
            // Restore viewport transform if it exists in the snapshot
            if (snapshot && snapshot.viewportTransform) {
                manager.viewportTransform = { ...snapshot.viewportTransform };
                CanvasManager.updateViewportTransform();
                console.log('CanvasManager: Restored viewport transform:', snapshot.viewportTransform);
            }

            console.log('CanvasManager: Redo performed');
            eventBus.emit('history:redone', { state: snapshot, index: manager.historyIndex });
            return snapshot;
        } else {
            console.log('CanvasManager: No more actions to redo');
            return null;
        }
    }
    
    // Helper method to convert screen coordinates to canvas coordinates
    static screenToCanvas(screenX, screenY) {
        const manager = CanvasManager.getInstance();
        const viewport = document.getElementById('canvasViewport');
        if (!viewport) return { x: screenX, y: screenY };
        
        const rect = viewport.getBoundingClientRect();
        
        return {
            x: (screenX - rect.left) - manager.viewportTransform.x,
            y: (screenY - rect.top) - manager.viewportTransform.y
        };
    }
    
    // Helper method to convert canvas coordinates to screen coordinates
    static canvasToScreen(canvasX, canvasY) {
        const manager = CanvasManager.getInstance();
        const viewport = document.getElementById('canvasViewport');
        if (!viewport) return { x: canvasX, y: canvasY };
        
        const rect = viewport.getBoundingClientRect();
        
        return {
            x: rect.left + canvasX + manager.viewportTransform.x,
            y: rect.top + canvasY + manager.viewportTransform.y
        };
    }
    
    // Helper method to update viewport transform
    static updateViewportTransform() {
        const manager = CanvasManager.getInstance();
        const container = document.getElementById('canvasContainer');
        if (container) {
            container.style.transform = `translate(${manager.viewportTransform.x}px, ${manager.viewportTransform.y}px) scale(${manager.viewportTransform.scale})`;
        }
        eventBus.emit('viewport:updated', { transform: manager.viewportTransform });
    }

    // Method to pan the viewport
    static panViewport(deltaX, deltaY) {
        const manager = CanvasManager.getInstance();
        manager.viewportTransform.x += deltaX;
        manager.viewportTransform.y += deltaY;
        CanvasManager.updateViewportTransform();
    }

    // Method to zoom the viewport
    static zoomViewport(scale, centerX = 0, centerY = 0) {
        const manager = CanvasManager.getInstance();
        const oldScale = manager.viewportTransform.scale;
        manager.viewportTransform.scale = Math.max(0.1, Math.min(5.0, scale));
        
        // Adjust position to zoom around the center point
        const scaleDelta = manager.viewportTransform.scale - oldScale;
        manager.viewportTransform.x -= centerX * scaleDelta;
        manager.viewportTransform.y -= centerY * scaleDelta;
        
        CanvasManager.updateViewportTransform();
    }

    // Method to reset viewport to default
    static resetViewport() {
        console.log('CanvasManager: resetViewport() called!'); // DEBUG
        const manager = CanvasManager.getInstance();
        const viewport = document.getElementById('canvasViewport');
        if (viewport && manager.canvas) {
            const viewportWidth = viewport.clientWidth;
            const viewportHeight = viewport.clientHeight;
            
            manager.viewportTransform = {
                x: -(manager.canvas.width / 2) + (viewportWidth / 2),
                y: -(manager.canvas.height / 2) + (viewportHeight / 2),
                scale: 1
            };
            
            CanvasManager.updateViewportTransform();
            // We need to trigger a redraw after resetting the view
            CanvasManager.redraw();
        }
    }

    // Method to fit content to viewport
    static fitToViewport(bounds) {
        const manager = CanvasManager.getInstance();
        const viewport = document.getElementById('canvasViewport');
        if (!viewport || !bounds) return;
        
        const viewportWidth = viewport.clientWidth;
        const viewportHeight = viewport.clientHeight;
        const padding = 50;
        
        const contentWidth = bounds.maxX - bounds.minX;
        const contentHeight = bounds.maxY - bounds.minY;
        
        const scaleX = (viewportWidth - padding * 2) / contentWidth;
        const scaleY = (viewportHeight - padding * 2) / contentHeight;
        const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%
        
        const centerX = bounds.minX + contentWidth / 2;
        const centerY = bounds.minY + contentHeight / 2;
        
        manager.viewportTransform = {
            x: (viewportWidth / 2) - (centerX * scale),
            y: (viewportHeight / 2) - (centerY * scale),
            scale: scale
        };
        
        CanvasManager.updateViewportTransform();
    }

    // Method to get current history info
    static getHistoryInfo() {
        const manager = CanvasManager.getInstance();
        return {
            length: manager.actionHistory.length,
            index: manager.historyIndex,
            canUndo: manager.historyIndex > 0,
            canRedo: manager.historyIndex < manager.actionHistory.length - 1
        };
    }

    // Method to clear history
    static clearHistory() {
        const manager = CanvasManager.getInstance();
        manager.actionHistory = [];
        manager.historyIndex = -1;
        eventBus.emit('history:cleared');
    }
}