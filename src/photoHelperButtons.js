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
        
        // --- Define button groups by position ---
        this.frontGroupTypes = ['Front', 'AddressVerification', 'StreetView'];
        this.rearGroupTypes = ['RearView', 'BackYard'];
        this.leftGroupTypes = ['ExteriorLeft'];
        this.rightGroupTypes = ['ExteriorRight'];
        this.utilityGroupTypes = ['SmokeAlarm', 'C02Alarm', 'WaterHtr'];
        this.fhaGroupTypes = ['CrawlSpace', 'AtticSpace', 'FireOn', 'WaterOn'];
        // --- NEW: Define the interior button type ---
        this.interiorGroupTypes = ['Interior'];
    }

    initializePhotoHelpers() {
        console.log('Initializing photo helper buttons...');
        this.clearAllHelperButtons();
        
        const isFHA = AppState.reportTypes?.fha === true;
        console.log('Is this an FHA file?', isFHA);

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
            const targetPolygons = eachArea ? polygons : [this.findFirstNumberedPolygon(polygons)].filter(Boolean);

            targetPolygons.forEach(poly => {
                let leftSideAnchor = null;
                let rightSideAnchor = null;

                const allGroups = [
                    { types: this.frontGroupTypes, position: 'front' },
                    { types: this.rearGroupTypes, position: 'rear' },
                    { types: this.leftGroupTypes, position: 'left' },
                    { types: this.rightGroupTypes, position: 'right' },
                    { types: this.interiorGroupTypes, position: 'interior' } // Added interior group
                ];

                allGroups.forEach(group => {
                    const requiredButtons = group.types.filter(picType => typeOption.getAttribute(`data-pic-${picType}`) === '1');
                    if (requiredButtons.length > 0) {
                        const createdButtons = this.createAndAddButtonGroup(poly, requiredButtons, group.position);
                        if (group.position === 'left' && createdButtons.length > 0)   leftSideAnchor = createdButtons[0];
                        if (group.position === 'right' && createdButtons.length > 0) rightSideAnchor = createdButtons[0];
                    }
                });

                // Handle dependent stacks
                const requiredUtilityButtons = this.utilityGroupTypes.filter(picType => typeOption.getAttribute(`data-pic-${picType}`) === '1');
                if (requiredUtilityButtons.length > 0) {
                    this.createAndAddButtonGroup(poly, requiredUtilityButtons, 'right-stack', rightSideAnchor);
                }

                if (isFHA) {
                    const requiredFhaButtons = this.fhaGroupTypes.filter(picType => typeOption.getAttribute(`data-pic-${picType}`) === '1');
                    if (requiredFhaButtons.length > 0) {
                        this.createAndAddButtonGroup(poly, requiredFhaButtons, 'left-stack', leftSideAnchor);
                    }
                }
            });
        }
        
        this.resolveOverlaps();
        CanvasManager.redraw();
    }
    
    // --- CONSOLIDATED a new group of buttons ---
    createAndAddButtonGroup(polygon, pictureTypes, position, anchorButton = null) {
        if (!this.helperButtons.has(polygon.id)) this.helperButtons.set(polygon.id, []);
        const buttonGroupOnPolygon = this.helperButtons.get(polygon.id);

        const isVertical = position.endsWith('-stack');
        const bounds = this.getPolygonBounds(polygon);
        const centroid = polygon.centroid || this.calculateCentroid(polygon.path);
        const offset = 15;

        const buttonDetails = pictureTypes.map(picType => ({ picType, width: this.calculateButtonWidth(picType) }));

        let currentX, currentY;
        
        if (isVertical) {
            const stackWidth = Math.max(...buttonDetails.map(b => b.width));
            const totalHeight = (this.BUTTON_HEIGHT * pictureTypes.length) + (this.BUTTON_SPACING * Math.max(0, pictureTypes.length - 1));
            
            if (anchorButton) {
                currentX = anchorButton.x + (anchorButton.width / 2) - (stackWidth / 2);
                currentY = anchorButton.y + anchorButton.height + this.BUTTON_SPACING;
            } else {
                currentY = centroid.y - (totalHeight / 2);
                currentX = (position === 'left-stack') ? bounds.minX - stackWidth - offset : bounds.maxX + offset;
            }
        } else { // Horizontal groups
            const totalWidth = buttonDetails.reduce((sum, b) => sum + b.width, 0) + (this.BUTTON_SPACING * Math.max(0, pictureTypes.length - 1));
            switch(position) {
                case 'front': currentX = centroid.x - (totalWidth / 2); currentY = bounds.maxY + offset; break;
                case 'rear': currentX = centroid.x - (totalWidth / 2); currentY = bounds.minY - offset - this.BUTTON_HEIGHT; break;
                case 'left': currentX = bounds.minX - offset - totalWidth; currentY = centroid.y - (this.BUTTON_HEIGHT / 2); break;
                case 'right': currentX = bounds.maxX + offset; currentY = centroid.y - (this.BUTTON_HEIGHT / 2); break;
                // --- NEW: Position logic for the interior button ---
                case 'interior': currentX = centroid.x - (totalWidth / 2); currentY = centroid.y - (this.BUTTON_HEIGHT / 2); break;
            }
        }
        
        const createdButtons = buttonDetails.map(({ picType, width }) => {
            let buttonX = isVertical ? currentX + (Math.max(...buttonDetails.map(b => b.width)) - width) / 2 : currentX;
            const button = this.createHelperButton(polygon, picType, buttonX, width, currentY);
            if (!isVertical) currentX += width + this.BUTTON_SPACING;
            else currentY += this.BUTTON_HEIGHT + this.BUTTON_SPACING;
            return button;
        });

        buttonGroupOnPolygon.push(...createdButtons);
        return createdButtons;
    }

    createHelperButton(polygon, pictureType, x, width, y) {
        return {
            id: `${polygon.id}_${pictureType}`, polygonId: polygon.id, pictureType: pictureType,
            label: this.formatButtonLabel(pictureType), x: x, y: y, width: width, height: this.BUTTON_HEIGHT,
            taken: this.isPhotoTaken(polygon.id, pictureType),
        };
    }
    
    // --- The rest of the functions remain the same ---
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
                    if (buttonA.polygonId === buttonB.polygonId) continue;

                    const overlapX = buttonA.x < buttonB.x + buttonB.width && buttonA.x + buttonA.width > buttonB.x;
                    const overlapY = buttonA.y < buttonB.y + buttonB.height && buttonA.y + buttonA.height > buttonB.y;

                    if (overlapX && overlapY) {
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