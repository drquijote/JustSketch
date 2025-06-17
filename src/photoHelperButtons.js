// src/photoHelperButtons.js
import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

class PhotoHelperButtons {
    constructor() {
        this.helperButtons = new Map();
        this.photoButtonStates = new Map();
        
        // --- CONFIGURATION ---
        this.BUTTON_HEIGHT = 16;
        this.HORIZONTAL_PADDING = 8;
        this.BUTTON_SPACING = 5;
        this.FONT_STYLE = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        this.BORDER_RADIUS = 4;
        this.COLOR_DEFAULT_BG = '#e74c3c';
        this.COLOR_TAKEN_BG = '#9e9e9e';
        this.COLOR_DEFAULT_TEXT = 'white';
        this.COLOR_TAKEN_TEXT = '#f5f5f5';
        
        // --- NEW: Define button groups by position ---
        this.frontGroupTypes = ['Front', 'AddressVerification', 'StreetView'];
        this.rearGroupTypes = ['RearView', 'BackYard']; 
    }

    initializePhotoHelpers() {
        console.log('Initializing photo helper buttons...');
        this.clearAllHelperButtons();

        const polygonsByType = AppState.drawnPolygons.reduce((acc, poly) => {
            if (!acc[poly.type]) acc[poly.type] = [];
            acc[poly.type].push(poly);
            return acc;
        }, {});

        for (const type in polygonsByType) {
            const polygons = polygonsByType[type];
            const typeOption = this.findPolygonTypeOption(type);
            if (!typeOption) continue;

            const eachArea = typeOption.getAttribute('data-pics-EachArea') === '1';
            
            // --- MODIFIED LOGIC TO HANDLE MULTIPLE GROUPS ---
            const targetPolygons = eachArea ? polygons : [this.findFirstNumberedPolygon(polygons)].filter(Boolean);

            targetPolygons.forEach(poly => {
                // Check for and create the FRONT group (6 o'clock)
                const requiredFrontButtons = this.frontGroupTypes.filter(picType => 
                    typeOption.getAttribute(`data-pic-${picType}`) === '1'
                );
                if (requiredFrontButtons.length > 0) {
                    this.createAndAddButtonGroup(poly, requiredFrontButtons, 'front');
                }

                // Check for and create the REAR group (12 o'clock)
                const requiredRearButtons = this.rearGroupTypes.filter(picType => 
                    typeOption.getAttribute(`data-pic-${picType}`) === '1'
                );
                if (requiredRearButtons.length > 0) {
                    this.createAndAddButtonGroup(poly, requiredRearButtons, 'rear');
                }
            });
        }
        
        this.resolveOverlaps();
        CanvasManager.redraw();
    }
    
    // --- MODIFIED: Creates a group of buttons for a specific position ---
    createAndAddButtonGroup(polygon, pictureTypes, position) {
        if (!this.helperButtons.has(polygon.id)) {
            this.helperButtons.set(polygon.id, []);
        }
        const buttonGroup = this.helperButtons.get(polygon.id);

        let totalWidth = 0;
        const buttonDetails = pictureTypes.map(picType => {
            const width = this.calculateButtonWidth(picType);
            totalWidth += width;
            return { picType, width };
        });
        totalWidth += Math.max(0, pictureTypes.length - 1) * this.BUTTON_SPACING;

        let currentX = this.calculateGroupStartPosition(polygon, totalWidth);
        
        buttonDetails.forEach(({ picType, width }) => {
            const button = this.createHelperButton(polygon, picType, currentX, width, position);
            buttonGroup.push(button);
            currentX += width + this.BUTTON_SPACING;
        });
    }

    // --- MODIFIED: Creates a single button at a specific position ---
    createHelperButton(polygon, pictureType, x, width, position) {
        const buttonPos = this.calculateButtonPosition(polygon, x, position);
        
        return {
            id: `${polygon.id}_${pictureType}`,
            polygonId: polygon.id,
            pictureType: pictureType,
            label: this.formatButtonLabel(pictureType),
            x: buttonPos.x,
            y: buttonPos.y,
            width: width,
            height: this.BUTTON_HEIGHT,
            taken: this.isPhotoTaken(polygon.id, pictureType),
        };
    }
    
    calculateGroupStartPosition(polygon, totalWidth) {
        const centroid = polygon.centroid || this.calculateCentroid(polygon.path);
        return centroid.x - (totalWidth / 2);
    }

    // --- MODIFIED: Calculates Y position based on group ('front' or 'rear') ---
    calculateButtonPosition(polygon, x, position) {
        const bounds = this.getPolygonBounds(polygon);
        const offset = 15;
        let y = 0;

        switch (position) {
            case 'front': // 6 o'clock
                y = bounds.maxY + offset;
                break;
            case 'rear': // 12 o'clock
                y = bounds.minY - offset - this.BUTTON_HEIGHT;
                break;
        }
        return { x, y };
    }
    
    calculateButtonWidth(pictureType) {
        const tempCtx = AppState.ctx;
        tempCtx.font = this.FONT_STYLE;
        return tempCtx.measureText(this.formatButtonLabel(pictureType)).width + (this.HORIZONTAL_PADDING * 2);
    }

    resolveOverlaps() {
        const allButtons = Array.from(this.helperButtons.values()).flat();
        let changed;
        do {
            changed = false;
            for (let i = 0; i < allButtons.length; i++) {
                for (let j = i + 1; j < allButtons.length; j++) {
                    const buttonA = allButtons[i];
                    const buttonB = allButtons[j];

                    const overlapX = buttonA.x < buttonB.x + buttonB.width && buttonA.x + buttonA.width > buttonB.x;
                    const overlapY = buttonA.y < buttonB.y + buttonB.height && buttonA.y + buttonA.height > buttonB.y;

                    if (overlapX && overlapY) {
                        if (buttonA.polygonId === buttonB.polygonId) continue;
                        console.warn(`Overlap detected between buttons for polygon ${buttonA.polygonId} and ${buttonB.polygonId}. Adjusting...`);
                        
                        const groupToMove = (buttonA.y <= buttonB.y) ? this.helperButtons.get(buttonB.polygonId) : this.helperButtons.get(buttonA.polygonId);
                        const moveAmount = buttonA.height + 10;
                        groupToMove.forEach(btn => btn.y += moveAmount);
                        
                        changed = true; 
                    }
                }
            }
        } while (changed);
    }

    findFirstNumberedPolygon(polygons) {
        if (!polygons || polygons.length === 0) return null;
        if (polygons.length === 1) return polygons[0];
        const extractNumber = (label) => {
            const match = label.match(/\d+$/);
            return match ? parseInt(match[0], 10) : Infinity;
        };
        return [...polygons].sort((a, b) => extractNumber(a.label) - extractNumber(b.label))[0];
    }
    
    formatButtonLabel(pictureType) {
        return pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    }

    drawHelperButtons(ctx) {
        if (AppState.currentMode !== 'photos' || this.helperButtons.size === 0) return;
        ctx.save();
        this.helperButtons.forEach(buttons => {
            buttons.forEach(button => this.drawButton(ctx, button));
        });
        ctx.restore();
    }
    
    drawButton(ctx, button) {
        ctx.save();
        const bgColor = button.taken ? this.COLOR_TAKEN_BG : this.COLOR_DEFAULT_BG;
        const textColor = button.taken ? this.COLOR_TAKEN_TEXT : this.COLOR_DEFAULT_TEXT;
        
        this.drawRoundedRect(ctx, button.x, button.y, button.width, button.height, this.BORDER_RADIUS);
        ctx.fillStyle = bgColor;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = this.FONT_STYLE;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(button.label, button.x + button.width / 2, button.y + button.height / 2 + 1);
        ctx.restore();
    }

    handleButtonClick(x, y) {
        for (const buttons of this.helperButtons.values()) {
            for (const button of buttons) {
                if (x >= button.x && x <= button.x + button.width && y >= button.y && y <= button.y + button.height) {
                    return { polygonId: button.polygonId, pictureType: button.pictureType, button: button };
                }
            }
        }
        return null;
    }

    markPhotoTaken(polygonId, pictureType) {
        const key = `${polygonId}_${pictureType}`;
        this.photoButtonStates.set(key, true);
        const buttons = this.helperButtons.get(polygonId);
        if (buttons) {
            const button = buttons.find(b => b.pictureType === pictureType);
            if (button) button.taken = true;
        }
        CanvasManager.redraw();
    }

    isPhotoTaken(polygonId, pictureType) {
        return this.photoButtonStates.get(`${polygonId}_${pictureType}`) === true;
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

    getPolygonBounds(polygon) {
        const path = polygon.path || polygon.lines;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        path.forEach(point => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        });
        return { minX, minY, maxX, maxY };
    }

    findPolygonTypeOption(polygonType) {
        const typeSelect = document.getElementById('polygonType');
        if (!typeSelect) return null;
        for (let option of typeSelect.options) {
            if (option.value === polygonType) return option;
        }
        return null;
    }

    clearAllHelperButtons() {
        this.helperButtons.clear();
    }
}

export const photoHelperButtons = new PhotoHelperButtons();