// src/photoHelperButtons.js
import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

export class PhotoHelperButtons {
    constructor() {
        this.helperButtons = new Map(); // Map to track buttons by polygon ID
        this.photoButtonStates = new Map(); // Track which photos have been taken
    }

    /**
     * Initialize photo helper buttons when entering photo mode
     */
    initializePhotoHelpers() {
        console.log('Initializing photo helper buttons...');
        
        // Clear any existing buttons
        this.clearAllHelperButtons();
        
        // Process each drawn polygon
        AppState.drawnPolygons.forEach((polygon, index) => {
            this.createHelperButtonsForPolygon(polygon, index);
        });
        
        // Redraw canvas to show the buttons
        CanvasManager.redraw();
    }

    /**
     * Create helper buttons for a specific polygon based on its type
     */
    createHelperButtonsForPolygon(polygon, polygonIndex) {
        // Find the polygon type in the select options to get data attributes
        const typeOption = this.findPolygonTypeOption(polygon.type);
        if (!typeOption) {
            console.log(`No type option found for polygon type: ${polygon.type}`);
            return;
        }

        // Check if this is the first area of its type
        const eachArea = typeOption.getAttribute('data-pics-EachArea') === '1';
        const isFirstOfType = this.isFirstPolygonOfType(polygon.type, polygonIndex);
        
        // Only add buttons if it's each area OR it's the first of its type
        if (!eachArea && !isFirstOfType) {
            console.log(`Skipping buttons for ${polygon.label} - not first of type ${polygon.type}`);
            return;
        }

        const buttons = [];
        
        // Process each data-pic attribute
        const attributes = typeOption.attributes;
        for (let i = 0; i < attributes.length; i++) {
            const attr = attributes[i];
            if (attr.name.startsWith('data-pic-') && attr.value === '1') {
                const pictureType = attr.name.replace('data-pic-', '');
                
                // Skip the EachArea attribute itself
                if (pictureType === 'EachArea') continue;
                
                const button = this.createHelperButton(polygon, pictureType);
                if (button) {
                    buttons.push(button);
                }
            }
        }

        // Store buttons for this polygon
        if (buttons.length > 0) {
            this.helperButtons.set(polygon.id, buttons);
            console.log(`Created ${buttons.length} helper buttons for ${polygon.label}`);
        }
    }

    /**
     * Find the option element for a polygon type
     */
    findPolygonTypeOption(polygonType) {
        const typeSelect = document.getElementById('polygonType');
        if (!typeSelect) return null;
        
        for (let option of typeSelect.options) {
            if (option.value === polygonType) {
                return option;
            }
        }
        return null;
    }

    /**
     * Check if this is the first polygon of its type
     */
    isFirstPolygonOfType(type, currentIndex) {
        for (let i = 0; i < currentIndex; i++) {
            if (AppState.drawnPolygons[i].type === type) {
                return false;
            }
        }
        return true;
    }

    /**
     * Create a single helper button
     */
    createHelperButton(polygon, pictureType) {
        const buttonId = `${polygon.id}_${pictureType}`;
        
        // Calculate button position based on picture type
        const position = this.calculateButtonPosition(polygon, pictureType);
        
        const button = {
            id: buttonId,
            polygonId: polygon.id,
            pictureType: pictureType,
            label: this.formatButtonLabel(pictureType),
            x: position.x,
            y: position.y,
            width: 80,
            height: 30,
            color: '#e74c3c', // Red initially
            taken: false
        };

        // Check if this photo was already taken
        if (this.isPhotoTaken(polygon.id, pictureType)) {
            button.color = '#95a5a6'; // Gray if taken
            button.taken = true;
        }

        return button;
    }

    /**
     * Calculate button position based on picture type and polygon
     */
    calculateButtonPosition(polygon, pictureType) {
        const bounds = this.getPolygonBounds(polygon);
        const centroid = polygon.centroid || this.calculateCentroid(polygon.path);
        
        let x, y;
        
        // Position based on picture type
        switch (pictureType.toLowerCase()) {
            case 'front':
                // Bottom edge center, 10 pixels below
                x = centroid.x - 40; // Center the 80px button
                y = bounds.maxY + 10;
                break;
                
            case 'back':
            case 'rear':
                // Top edge center, 10 pixels above
                x = centroid.x - 40;
                y = bounds.minY - 40;
                break;
                
            case 'exteriorleft':
            case 'left':
                // Left edge center
                x = bounds.minX - 90;
                y = centroid.y - 15;
                break;
                
            case 'exteriorright':
            case 'right':
                // Right edge center
                x = bounds.maxX + 10;
                y = centroid.y - 15;
                break;
                
            default:
                // All other buttons stack vertically on the right side
                // Find the rightmost edge including attached areas
                const rightmostX = this.findRightmostEdge(polygon);
                x = rightmostX + 100;
                
                // Stack vertically
                const otherButtons = this.countOtherButtons(polygon, pictureType);
                y = centroid.y - 100 + (otherButtons * 35);
                break;
        }
        
        return { x, y };
    }

    /**
     * Find the rightmost edge considering attached areas
     */
    findRightmostEdge(polygon) {
        let maxX = this.getPolygonBounds(polygon).maxX;
        
        // Check for adjacent polygons (like attached patios)
        const threshold = 5; // pixels
        AppState.drawnPolygons.forEach(otherPoly => {
            if (otherPoly.id === polygon.id) return;
            
            // Check if polygons share an edge
            if (this.polygonsShareEdge(polygon, otherPoly, threshold)) {
                const otherBounds = this.getPolygonBounds(otherPoly);
                maxX = Math.max(maxX, otherBounds.maxX);
            }
        });
        
        return maxX;
    }

    /**
     * Check if two polygons share an edge
     */
    polygonsShareEdge(poly1, poly2, threshold) {
        for (let edge1 of this.getPolygonEdges(poly1)) {
            for (let edge2 of this.getPolygonEdges(poly2)) {
                if (this.edgesOverlap(edge1, edge2, threshold)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Get all edges of a polygon
     */
    getPolygonEdges(polygon) {
        const edges = [];
        const path = polygon.path || polygon.lines;
        
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            edges.push({ start: p1, end: p2 });
        }
        
        return edges;
    }

    /**
     * Check if two edges overlap
     */
    edgesOverlap(edge1, edge2, threshold) {
        // Simple check - could be enhanced with proper line segment overlap detection
        const dist1 = this.pointToLineDistance(edge1.start, edge2.start, edge2.end);
        const dist2 = this.pointToLineDistance(edge1.end, edge2.start, edge2.end);
        
        return dist1 < threshold && dist2 < threshold;
    }

    /**
     * Calculate distance from point to line segment
     */
    pointToLineDistance(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }
        
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

    /**
     * Count other buttons for stacking
     */
    countOtherButtons(polygon, currentPictureType) {
        const nonPositionalTypes = ['front', 'back', 'rear', 'left', 'right', 'exteriorleft', 'exteriorright'];
        const currentLower = currentPictureType.toLowerCase();
        
        if (nonPositionalTypes.includes(currentLower)) {
            return 0;
        }
        
        // Count buttons that would be stacked
        let count = 0;
        const buttons = this.helperButtons.get(polygon.id) || [];
        
        for (let button of buttons) {
            const buttonTypeLower = button.pictureType.toLowerCase();
            if (!nonPositionalTypes.includes(buttonTypeLower) && 
                button.pictureType !== currentPictureType) {
                count++;
            }
        }
        
        return count;
    }

    /**
     * Get polygon bounds
     */
    getPolygonBounds(polygon) {
        const path = polygon.path || polygon.lines;
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        path.forEach(point => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        });
        
        return { minX, minY, maxX, maxY };
    }

    /**
     * Calculate centroid if not provided
     */
    calculateCentroid(path) {
        let sumX = 0, sumY = 0;
        path.forEach(point => {
            sumX += point.x;
            sumY += point.y;
        });
        
        return {
            x: sumX / path.length,
            y: sumY / path.length
        };
    }

    /**
     * Format button label from picture type
     */
    formatButtonLabel(pictureType) {
        // Convert camelCase to readable format
        return pictureType
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    /**
     * Check if a photo has been taken
     */
    isPhotoTaken(polygonId, pictureType) {
        const key = `${polygonId}_${pictureType}`;
        return this.photoButtonStates.get(key) === true;
    }

    /**
     * Mark a photo as taken
     */
    markPhotoTaken(polygonId, pictureType) {
        const key = `${polygonId}_${pictureType}`;
        this.photoButtonStates.set(key, true);
        
        // Update button color
        const buttons = this.helperButtons.get(polygonId);
        if (buttons) {
            const button = buttons.find(b => b.pictureType === pictureType);
            if (button) {
                button.color = '#95a5a6'; // Gray
                button.taken = true;
            }
        }
        
        CanvasManager.redraw();
    }

    /**
     * Draw all helper buttons
     */
    drawHelperButtons(ctx) {
        if (AppState.currentMode !== 'photos') return;
        
        ctx.save();
        
        this.helperButtons.forEach((buttons, polygonId) => {
            buttons.forEach(button => {
                this.drawButton(ctx, button);
            });
        });
        
        ctx.restore();
    }





drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}
    /**
     * Draw a single button
     */
   drawButton(ctx, button) {
    ctx.save();
    
    // Match the style of regular room labels
    const padding = 4;
    const borderRadius = 4;
    
    // Button background with rounded corners
    this.drawRoundedRect(ctx, button.x, button.y, button.width, button.height, borderRadius);
    ctx.fillStyle = button.color;
    ctx.fill();
    
    // White border like room labels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Button text - match room label font
    ctx.fillStyle = 'white';
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Text wrapping if needed
    const maxWidth = button.width - padding * 2;
    const words = button.label.split(' ');
    let line = '';
    let lines = [];
    
    for (let word of words) {
        const testLine = line + (line ? ' ' : '') + word;
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = testLine;
        }
    }
    lines.push(line);
    
    // Draw text lines
    const lineHeight = 14;
    const startY = button.y + button.height / 2 - (lines.length - 1) * lineHeight / 2;
    
    lines.forEach((line, index) => {
        ctx.fillText(line, button.x + button.width / 2, startY + index * lineHeight);
    });
    
    ctx.restore();
}


    /**
     * Handle click on helper buttons
     */
    handleButtonClick(x, y) {
        if (AppState.currentMode !== 'photos') return null;
        
        for (let [polygonId, buttons] of this.helperButtons) {
            for (let button of buttons) {
                if (x >= button.x && x <= button.x + button.width &&
                    y >= button.y && y <= button.y + button.height) {
                    return {
                        polygonId: polygonId,
                        pictureType: button.pictureType,
                        button: button
                    };
                }
            }
        }
        
        return null;
    }

    /**
     * Clear all helper buttons
     */
    clearAllHelperButtons() {
        this.helperButtons.clear();
    }

    /**
     * Export button states for saving
     */
    exportButtonStates() {
        return Array.from(this.photoButtonStates.entries());
    }

    /**
     * Import button states when loading
     */
    importButtonStates(states) {
        this.photoButtonStates.clear();
        if (states && Array.isArray(states)) {
            states.forEach(([key, value]) => {
                this.photoButtonStates.set(key, value);
            });
        }
    }
}

// Create singleton instance
export const photoHelperButtons = new PhotoHelperButtons();