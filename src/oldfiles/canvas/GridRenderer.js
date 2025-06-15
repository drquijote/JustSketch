// src/canvas/GridRenderer.js - Background grid rendering
import { eventBus } from '../core/EventBus.js';

export class GridRenderer {
    constructor() {
        this.gridSize = 40; // The spacing of the grid lines in pixels (5 feet * 8 pixels/foot)
        this.gridColor = '#dcdcdc'; // Light gray for grid lines
        this.gridLineWidth = 1;
        this.visible = true;
        this.initialized = false;
        this.pixelsPerFoot = 8;
        this.feetPerGridSquare = 5;
    }

    static getInstance() {
        if (!GridRenderer.instance) {
            GridRenderer.instance = new GridRenderer();
        }
        return GridRenderer.instance;
    }

    static init() {
        const renderer = GridRenderer.getInstance();
        if (renderer.initialized) return renderer;
        
        console.log('GridRenderer: Initializing grid rendering');
        
        // Listen for grid rendering requests
        eventBus.on('render:background:grid', (data) => {
            renderer.renderGrid(data);
        });

        // Listen for grid configuration changes
        eventBus.on('grid:configure', (data) => {
            renderer.configure(data);
        });

        // Listen for grid visibility changes
        eventBus.on('grid:toggle', (data) => {
            renderer.setVisible(data.visible);
        });
        
        renderer.initialized = true;
        console.log('GridRenderer: Initialized with grid size:', renderer.gridSize, 'px');
        
        eventBus.emit('grid:initialized', {
            gridSize: renderer.gridSize,
            pixelsPerFoot: renderer.pixelsPerFoot,
            feetPerGridSquare: renderer.feetPerGridSquare
        });
        
        return renderer;
    }

    renderGrid(data) {
        if (!this.visible || !data || !data.ctx || !data.canvas) return;

        const { ctx, canvas, viewport } = data;

        ctx.save();
        
        try {
            ctx.beginPath();
            ctx.strokeStyle = this.gridColor;
            ctx.lineWidth = this.gridLineWidth;
            ctx.globalAlpha = this.calculateGridOpacity(viewport);

            // Optimize grid rendering based on zoom level
            const effectiveGridSize = this.getEffectiveGridSize(viewport);
            
            if (effectiveGridSize < 2) {
                // Grid too small to render meaningfully
                ctx.restore();
                return;
            }

            // Calculate visible area to optimize rendering
            const visibleBounds = this.calculateVisibleBounds(canvas, viewport);
            
            // Draw vertical lines
            const startX = Math.floor(visibleBounds.left / effectiveGridSize) * effectiveGridSize;
            const endX = Math.ceil(visibleBounds.right / effectiveGridSize) * effectiveGridSize;
            
            for (let x = startX; x <= endX; x += effectiveGridSize) {
                if (x >= 0 && x <= canvas.width) {
                    ctx.moveTo(x, Math.max(0, visibleBounds.top));
                    ctx.lineTo(x, Math.min(canvas.height, visibleBounds.bottom));
                }
            }

            // Draw horizontal lines
            const startY = Math.floor(visibleBounds.top / effectiveGridSize) * effectiveGridSize;
            const endY = Math.ceil(visibleBounds.bottom / effectiveGridSize) * effectiveGridSize;
            
            for (let y = startY; y <= endY; y += effectiveGridSize) {
                if (y >= 0 && y <= canvas.height) {
                    ctx.moveTo(Math.max(0, visibleBounds.left), y);
                    ctx.lineTo(Math.min(canvas.width, visibleBounds.right), y);
                }
            }

            ctx.stroke();
            
            // Draw grid origin indicator if at appropriate zoom level
            if (viewport && viewport.scale > 0.5) {
                this.drawOriginIndicator(ctx, canvas, viewport);
            }
            
        } finally {
            ctx.restore();
        }
    }

    calculateVisibleBounds(canvas, viewport) {
        if (!viewport) {
            return {
                left: 0,
                top: 0,
                right: canvas.width,
                bottom: canvas.height
            };
        }

        const scale = viewport.scale || 1;
        const viewportElement = document.getElementById('canvasViewport');
        const viewportWidth = viewportElement ? viewportElement.clientWidth : canvas.width;
        const viewportHeight = viewportElement ? viewportElement.clientHeight : canvas.height;

        return {
            left: Math.max(0, -viewport.x / scale),
            top: Math.max(0, -viewport.y / scale),
            right: Math.min(canvas.width, (-viewport.x + viewportWidth) / scale),
            bottom: Math.min(canvas.height, (-viewport.y + viewportHeight) / scale)
        };
    }

    getEffectiveGridSize(viewport) {
        const scale = viewport ? viewport.scale || 1 : 1;
        return this.gridSize * scale;
    }

    calculateGridOpacity(viewport) {
        const scale = viewport ? viewport.scale || 1 : 1;
        
        // Fade out grid when zoomed out too far
        if (scale < 0.2) return 0;
        if (scale < 0.5) return (scale - 0.2) / 0.3 * 0.5;
        
        // Fade out grid when zoomed in too far
        if (scale > 3) return Math.max(0, 1 - (scale - 3) / 2);
        
        return 1;
    }

    drawOriginIndicator(ctx, canvas, viewport) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        ctx.save();
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        
        // Draw cross at origin
        const size = 20;
        ctx.beginPath();
        ctx.moveTo(centerX - size, centerY);
        ctx.lineTo(centerX + size, centerY);
        ctx.moveTo(centerX, centerY - size);
        ctx.lineTo(centerX, centerY + size);
        ctx.stroke();
        
        ctx.restore();
    }

    configure(config) {
        if (config.gridSize && config.gridSize > 0) {
            this.gridSize = config.gridSize;
        }
        
        if (config.gridColor) {
            this.gridColor = config.gridColor;
        }
        
        if (config.lineWidth && config.lineWidth > 0) {
            this.gridLineWidth = config.lineWidth;
        }
        
        if (typeof config.visible === 'boolean') {
            this.visible = config.visible;
        }
        
        if (config.pixelsPerFoot && config.pixelsPerFoot > 0) {
            this.pixelsPerFoot = config.pixelsPerFoot;
            // Recalculate grid size if feet per grid square is set
            this.gridSize = this.pixelsPerFoot * this.feetPerGridSquare;
        }
        
        if (config.feetPerGridSquare && config.feetPerGridSquare > 0) {
            this.feetPerGridSquare = config.feetPerGridSquare;
            // Recalculate grid size
            this.gridSize = this.pixelsPerFoot * this.feetPerGridSquare;
        }
        
        console.log('GridRenderer: Configuration updated', {
            gridSize: this.gridSize,
            gridColor: this.gridColor,
            visible: this.visible,
            pixelsPerFoot: this.pixelsPerFoot,
            feetPerGridSquare: this.feetPerGridSquare
        });
        
        eventBus.emit('grid:configured', this.getConfiguration());
    }

    // Method to get current configuration
    getConfiguration() {
        return {
            gridSize: this.gridSize,
            gridColor: this.gridColor,
            lineWidth: this.gridLineWidth,
            visible: this.visible,
            pixelsPerFoot: this.pixelsPerFoot,
            feetPerGridSquare: this.feetPerGridSquare
        };
    }

    // Method to toggle grid visibility
    setVisible(visible) {
        this.visible = visible;
        console.log('GridRenderer: Grid visibility set to:', visible);
        eventBus.emit('grid:visibility:changed', { visible });
    }

    // Method to get grid snap position
    snapToGrid(x, y) {
        return {
            x: Math.round(x / this.gridSize) * this.gridSize,
            y: Math.round(y / this.gridSize) * this.gridSize
        };
    }

    // Method to snap to grid with custom tolerance
    snapToGridWithTolerance(x, y, tolerance = 10) {
        const snapped = this.snapToGrid(x, y);
        const dx = Math.abs(x - snapped.x);
        const dy = Math.abs(y - snapped.y);
        
        if (dx <= tolerance && dy <= tolerance) {
            return snapped;
        }
        
        return { x, y };
    }

    // Method to check if point is on grid intersection
    isOnGridIntersection(x, y, tolerance = 2) {
        const snapped = this.snapToGrid(x, y);
        const dx = Math.abs(x - snapped.x);
        const dy = Math.abs(y - snapped.y);
        return dx <= tolerance && dy <= tolerance;
    }

    // Method to get nearest grid lines
    getNearestGridLines(x, y) {
        return {
            vertical: Math.round(x / this.gridSize) * this.gridSize,
            horizontal: Math.round(y / this.gridSize) * this.gridSize
        };
    }

    // Method to convert pixels to feet
    pixelsToFeet(pixels) {
        return pixels / this.pixelsPerFoot;
    }

    // Method to convert feet to pixels
    feetToPixels(feet) {
        return feet * this.pixelsPerFoot;
    }

    // Method to get grid spacing in feet
    getGridSpacingInFeet() {
        return this.feetPerGridSquare;
    }

    // Method to get grid spacing in pixels
    getGridSpacingInPixels() {
        return this.gridSize;
    }

    // Method to calculate grid coordinates for a point
    getGridCoordinates(x, y) {
        return {
            gridX: Math.floor(x / this.gridSize),
            gridY: Math.floor(y / this.gridSize),
            offsetX: x % this.gridSize,
            offsetY: y % this.gridSize
        };
    }

    // Method to get real-world coordinates from grid coordinates
    gridToRealWorld(gridX, gridY) {
        return {
            x: gridX * this.gridSize,
            y: gridY * this.gridSize,
            feetX: gridX * this.feetPerGridSquare,
            feetY: gridY * this.feetPerGridSquare
        };
    }

    // Static methods for easy access
    static snapToGrid(x, y) {
        return GridRenderer.getInstance().snapToGrid(x, y);
    }

    static isOnGridIntersection(x, y, tolerance) {
        return GridRenderer.getInstance().isOnGridIntersection(x, y, tolerance);
    }

    static pixelsToFeet(pixels) {
        return GridRenderer.getInstance().pixelsToFeet(pixels);
    }

    static feetToPixels(feet) {
        return GridRenderer.getInstance().feetToPixels(feet);
    }

    static configure(config) {
        GridRenderer.getInstance().configure(config);
    }

    static getConfiguration() {
        return GridRenderer.getInstance().getConfiguration();
    }
}
