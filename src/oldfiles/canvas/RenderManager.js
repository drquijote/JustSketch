// src/canvas/RenderManager.js - Orchestrates all rendering
import { eventBus } from '../core/EventBus.js';

export class RenderManager {
    constructor() {
        this.initialized = false;
        this.renderQueue = [];
        this.isRendering = false;
        this.lastRenderTime = 0;
        this.renderFPS = 60;
        this.minFrameTime = 1000 / this.renderFPS;
    }

    static getInstance() {
        if (!RenderManager.instance) {
            RenderManager.instance = new RenderManager();
        }
        return RenderManager.instance;
    }

    static init() {
        const manager = RenderManager.getInstance();
        if (manager.initialized) return manager;
        
        console.log('RenderManager: Initializing rendering system');
        
        // Set up render layer listeners
        manager.setupRenderLayers();
        
        // Set up performance monitoring
        manager.setupPerformanceMonitoring();
        
        manager.initialized = true;
        console.log('RenderManager: Initialized');
        
        eventBus.emit('render:initialized');
        return manager;
    }

    setupRenderLayers() {
        // Background layer (grid, etc.)
        eventBus.on('canvas:redraw:background', (data) => {
            this.renderBackground(data);
        });

        // Polygons layer (completed areas)
        eventBus.on('canvas:redraw:polygons', (data) => {
            this.renderPolygons(data);
        });

        // Lines layer (individual lines)
        eventBus.on('canvas:redraw:lines', (data) => {
            this.renderLines(data);
        });

        // Elements layer (room labels, icons)
        eventBus.on('canvas:redraw:elements', (data) => {
            this.renderElements(data);
        });

        // UI overlays layer (edit handles, etc.)
        eventBus.on('canvas:redraw:ui', (data) => {
            this.renderUIOverlays(data);
        });

        // Drawing overlay layer (current drawing elements)
        eventBus.on('canvas:redraw:drawing-overlay', (data) => {
            this.renderDrawingOverlay(data);
        });

        // Listen for render requests
        eventBus.on('render:request', (data) => {
            this.queueRender(data);
        });
    }

    setupPerformanceMonitoring() {
        this.performanceMetrics = {
            frameCount: 0,
            totalRenderTime: 0,
            averageRenderTime: 0,
            lastFrameTime: 0
        };

        // Reset metrics every 5 seconds
        setInterval(() => {
            if (this.performanceMetrics.frameCount > 0) {
                this.performanceMetrics.averageRenderTime = 
                    this.performanceMetrics.totalRenderTime / this.performanceMetrics.frameCount;
                
                eventBus.emit('render:performance', { ...this.performanceMetrics });
                
                // Reset for next interval
                this.performanceMetrics.frameCount = 0;
                this.performanceMetrics.totalRenderTime = 0;
            }
        }, 5000);
    }

    renderBackground(data) {
        if (!this.canRender(data)) return;
        
        this.withPerformanceTracking('background', () => {
            // Delegate to specific background renderers
            eventBus.emit('render:background:grid', data);
            eventBus.emit('render:background:patterns', data);
        });
    }

    renderPolygons(data) {
        if (!this.canRender(data)) return;
        
        this.withPerformanceTracking('polygons', () => {
            // Delegate to polygon rendering systems
            eventBus.emit('render:polygons:areas', data);
            eventBus.emit('render:polygons:borders', data);
            eventBus.emit('render:polygons:labels', data);
        });
    }

    renderLines(data) {
        if (!this.canRender(data)) return;
        
        this.withPerformanceTracking('lines', () => {
            // Delegate to line rendering systems
            eventBus.emit('render:lines:individual', data);
            eventBus.emit('render:lines:construction', data);
        });
    }

    renderElements(data) {
        if (!this.canRender(data)) return;
        
        this.withPerformanceTracking('elements', () => {
            // Delegate to element rendering systems
            eventBus.emit('render:elements:rooms', data);
            eventBus.emit('render:elements:icons', data);
            eventBus.emit('render:elements:photos', data);
            eventBus.emit('render:elements:labels', data);
        });
    }

    renderUIOverlays(data) {
        if (!this.canRender(data)) return;
        
        this.withPerformanceTracking('ui', () => {
            // Delegate to UI overlay rendering
            eventBus.emit('render:ui:edithandles', data);
            eventBus.emit('render:ui:selection', data);
            eventBus.emit('render:ui:highlights', data);
        });
    }

    renderDrawingOverlay(data) {
        if (!this.canRender(data)) return;
        
        this.withPerformanceTracking('drawing', () => {
            // Delegate to drawing overlay rendering
            eventBus.emit('render:drawing:current', data);
            eventBus.emit('render:drawing:helpers', data);
            eventBus.emit('render:drawing:preview', data);
            eventBus.emit('render:drawing:snaps', data);
        });
    }

    // Utility method to check if rendering is safe
    canRender(data) {
        return data && data.ctx && data.canvas;
    }

    // Utility method to save/restore context for isolated rendering
    withContext(renderFunction, data) {
        if (!this.canRender(data)) {
            console.warn('RenderManager: Cannot render - invalid data provided');
            return;
        }

        data.ctx.save();
        try {
            renderFunction(data.ctx, data.canvas, data.viewport);
        } finally {
            data.ctx.restore();
        }
    }

    // Performance tracking wrapper
    withPerformanceTracking(layerName, renderFunction) {
        const startTime = performance.now();
        
        try {
            renderFunction();
        } finally {
            const endTime = performance.now();
            const renderTime = endTime - startTime;
            
            this.performanceMetrics.frameCount++;
            this.performanceMetrics.totalRenderTime += renderTime;
            this.performanceMetrics.lastFrameTime = renderTime;
            
            // Log slow renders
            if (renderTime > 16) { // Slower than 60fps
                console.warn(`RenderManager: Slow render detected in ${layerName}: ${renderTime.toFixed(2)}ms`);
            }
        }
    }

    // Method to queue a render for next animation frame
    queueRender(data = {}) {
        if (this.renderQueued) return;
        
        this.renderQueued = true;
        requestAnimationFrame(() => {
            this.renderQueued = false;
            this.executeQueuedRender(data);
        });
    }

    executeQueuedRender(data) {
        const now = performance.now();
        
        // Throttle renders to maintain target FPS
        if (now - this.lastRenderTime < this.minFrameTime) {
            this.queueRender(data);
            return;
        }
        
        this.lastRenderTime = now;
        eventBus.emit('canvas:redraw:complete', data);
    }

    // Method to force an immediate render
    static forceRender(data = {}) {
        const manager = RenderManager.getInstance();
        if (!manager.initialized) {
            console.warn('RenderManager: Not initialized, cannot force render');
            return;
        }
        
        console.log('RenderManager: Force render requested');
        eventBus.emit('canvas:redraw:complete', data);
    }

    // Method to set render quality (affects performance vs quality)
    static setRenderQuality(quality) {
        const manager = RenderManager.getInstance();
        
        switch (quality) {
            case 'high':
                manager.renderFPS = 60;
                manager.minFrameTime = 1000 / 60;
                break;
            case 'medium':
                manager.renderFPS = 30;
                manager.minFrameTime = 1000 / 30;
                break;
            case 'low':
                manager.renderFPS = 15;
                manager.minFrameTime = 1000 / 15;
                break;
            default:
                console.warn('RenderManager: Invalid quality setting:', quality);
                return;
        }
        
        console.log(`RenderManager: Render quality set to ${quality} (${manager.renderFPS} FPS)`);
        eventBus.emit('render:quality:changed', { quality, fps: manager.renderFPS });
    }

    // Method to get performance metrics
    static getPerformanceMetrics() {
        const manager = RenderManager.getInstance();
        return { ...manager.performanceMetrics };
    }

    // Method to enable/disable render layers
    static setLayerEnabled(layerName, enabled) {
        const manager = RenderManager.getInstance();
        
        if (!manager.layerStates) {
            manager.layerStates = {};
        }
        
        manager.layerStates[layerName] = enabled;
        
        console.log(`RenderManager: Layer ${layerName} ${enabled ? 'enabled' : 'disabled'}`);
        eventBus.emit('render:layer:toggled', { layer: layerName, enabled });
    }

    // Method to check if layer is enabled
    static isLayerEnabled(layerName) {
        const manager = RenderManager.getInstance();
        return manager.layerStates ? manager.layerStates[layerName] !== false : true;
    }

    // Method to clear render cache (if implemented)
    static clearRenderCache() {
        const manager = RenderManager.getInstance();
        if (manager.renderCache) {
            manager.renderCache.clear();
        }
        eventBus.emit('render:cache:cleared');
        console.log('RenderManager: Render cache cleared');
    }

    // Method to get render statistics
    static getRenderStats() {
        const manager = RenderManager.getInstance();
        return {
            initialized: manager.initialized,
            renderFPS: manager.renderFPS,
            isRendering: manager.isRendering,
            queueLength: manager.renderQueue.length,
            layerStates: manager.layerStates || {},
            performance: manager.performanceMetrics
        };
    }
}
