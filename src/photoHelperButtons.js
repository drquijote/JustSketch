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

        const buttonDetails = pictureTypes.map(picType => ({ picType, width: this.calculateButtonWidth(picType, polygon) }));

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

    /**
     * UPDATED: Create helper button with robust photo checking
     */
    createHelperButton(polygon, pictureType, x, width, y) {
        return {
            id: `${polygon.id}_${pictureType}`, 
            polygonId: polygon.id, 
            pictureType: pictureType,
            label: this.formatButtonLabel(pictureType, polygon), 
            x: x, y: y, width: width, height: this.BUTTON_HEIGHT,
            taken: this.isPhotoTakenBySignature(polygon, pictureType), // Use robust checking
        };
    }
    
    // --- UPDATED: calculateButtonWidth now takes polygon parameter ---
    calculateButtonWidth(pictureType, polygon) {
        const tempCtx = AppState.ctx;
        tempCtx.font = this.FONT_STYLE;
        return tempCtx.measureText(this.formatButtonLabel(pictureType, polygon)).width + (this.HORIZONTAL_PADDING * 2);
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
    
    // *** UPDATED: Enhanced formatButtonLabel with ABBREVIATED button text for Subject Floor areas ***
  formatButtonLabel(pictureType, polygon) {
        // Get the area name (polygon label)
        const areaName = polygon ? polygon.label : '';
        const isFloorArea = areaName && areaName.toLowerCase().includes('floor');
        const isADUArea = areaName && areaName.toLowerCase().includes('adu');
        const isUNITArea = areaName && areaName.toLowerCase().includes('unit');
        
        // *** NEW: For Floor areas, use ABBREVIATED labels for buttons ***
        if (isFloorArea) {
            switch (pictureType) {
                case 'Front':
                    return 'Front'; // Abbreviated from 'Subject Exterior Front'
                case 'AddressVerification':
                    return 'Address'; // Abbreviated from 'Subject Address Verification'
                case 'StreetView':
                    return 'Street View'; // Abbreviated from 'Subject Exterior Street View'
                case 'ExteriorLeft':
                    return 'Left'; // Abbreviated from 'Subject Exterior Left'
                case 'ExteriorRight':
                    return 'Right'; // Abbreviated from 'Subject Exterior Right'
                case 'RearView':
                    return 'Rear View'; // Abbreviated from 'Subject Exterior Rear View'
                case 'BackYard':
                    return 'Back Yard'; // Abbreviated from 'Subject Exterior Back Yard'
                case 'SmokeAlarm':
                    return 'Smoke Alarm'; // Abbreviated from 'Subject Safety Smoke Alarm'
                case 'C02Alarm':
                    return 'C02 Alarm'; // Abbreviated from 'Subject Safety C02 Alarm'
                case 'WaterHtr':
                    return 'Water Heater'; // Abbreviated from 'Subject Safety Water Heater'
                case 'Amenities':
                    return 'Amenities'; // Abbreviated from 'Subject Amenities'
                case 'Concerns':
                    return 'Concerns'; // Abbreviated from 'Subject Concerns'
                case 'CrawlSpace':
                    return 'Crawl Space'; // Abbreviated from 'Subject Crawl Space'
                case 'AtticSpace':
                    return 'Attic Space'; // Abbreviated from 'Subject Attic Space'
                case 'FireOn':
                    return 'Fire On'; // Abbreviated from 'Subject Fire On'
                case 'WaterOn':
                    return 'Water On'; // Abbreviated from 'Subject Water On'
                case 'Interior':
                    return 'Interior'; // Abbreviated from 'Subject Interior'
                default:
                    // For any other types, use the original formatting
                    return pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
            }
        }
        
        // For ADU areas, customize the labels with ADU prefix and categories
        if (isADUArea) {
            // Extract ADU number if present (e.g., "ADU 1", "ADU-1")
            const aduMatch = areaName.match(/adu\s*[-\s]*(\d+)/i);
            const aduPrefix = aduMatch ? `ADU-${aduMatch[1]}` : 'ADU';
            
            // Define exterior photo types
            const exteriorTypes = ['Front', 'AddressVerification', 'StreetView', 'ExteriorLeft', 'ExteriorRight', 'RearView', 'BackYard'];
            // Define safety photo types  
            const safetyTypes = ['SmokeAlarm', 'C02Alarm', 'WaterHtr'];
            // Define interior photo types
            const interiorTypes = ['Interior'];
            
            if (exteriorTypes.includes(pictureType)) {
                const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                return `${aduPrefix} Ext ${typeLabel}`;
            } else if (safetyTypes.includes(pictureType)) {
                switch (pictureType) {
                    case 'SmokeAlarm':
                        return `${aduPrefix} Smoke Alarm`;
                    case 'C02Alarm':
                        return `${aduPrefix} C02 Alarm`;
                    case 'WaterHtr':
                        return `${aduPrefix} Water Heater`;
                    default:
                        const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                        return `${aduPrefix} ${typeLabel}`;
                }
            } else if (interiorTypes.includes(pictureType)) {
                return `${aduPrefix} Interior`;
            } else {
                // For other types, add ADU prefix with original formatting
                const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                return `${aduPrefix} ${typeLabel}`;
            }
        }
        
        // For UNIT areas, customize the labels with UNIT prefix and categories  
        if (isUNITArea) {
            // Extract UNIT number if present (e.g., "UNIT 1", "UNIT-1")
            const unitMatch = areaName.match(/unit\s*[-\s]*(\d+)/i);
            const unitPrefix = unitMatch ? `UNIT-${unitMatch[1]}` : 'UNIT';
            
            // Define exterior photo types
            const exteriorTypes = ['Front', 'AddressVerification', 'StreetView', 'ExteriorLeft', 'ExteriorRight', 'RearView', 'BackYard'];
            // Define safety photo types
            const safetyTypes = ['SmokeAlarm', 'C02Alarm', 'WaterHtr'];
            // Define interior photo types
            const interiorTypes = ['Interior'];
            
            if (exteriorTypes.includes(pictureType)) {
                const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                return `${unitPrefix} Ext ${typeLabel}`;
            } else if (safetyTypes.includes(pictureType)) {
                switch (pictureType) {
                    case 'SmokeAlarm':
                        return `${unitPrefix} Smoke Alarm`;
                    case 'C02Alarm':
                        return `${unitPrefix} C02 Alarm`;
                    case 'WaterHtr':
                        return `${unitPrefix} Water Heater`;
                    default:
                        const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                        return `${unitPrefix} ${typeLabel}`;
                }
            } else if (interiorTypes.includes(pictureType)) {
                return `${unitPrefix} Interior`;
            } else {
                // For other types, add UNIT prefix with original formatting
                const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                return `${unitPrefix} ${typeLabel}`;
            }
        }
        
        // For non-Floor, non-ADU, non-UNIT areas, use original formatting
        return pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    }
    // *** NEW: Separate method for FULL photo labels (used when photos are taken) ***
    getFullPhotoLabel(pictureType, polygon) {
        // Get the area name (polygon label)
        const areaName = polygon ? polygon.label : '';
        const isFloorArea = areaName && areaName.toLowerCase().includes('floor');
        const isADUArea = areaName && areaName.toLowerCase().includes('adu');
        const isUNITArea = areaName && areaName.toLowerCase().includes('unit');
        
        // For Floor areas, return FULL labels for actual photos
        if (isFloorArea) {
            switch (pictureType) {
                case 'Front':
                    return 'Subject Exterior Front';
                case 'AddressVerification':
                    return 'Subject Address Verification';
                case 'StreetView':
                    return 'Subject Exterior Street View';
                case 'ExteriorLeft':
                    return 'Subject Exterior Left';
                case 'ExteriorRight':
                    return 'Subject Exterior Right';
                case 'RearView':
                    return 'Subject Exterior Rear View';
                case 'BackYard':
                    return 'Subject Exterior Back Yard';
                case 'SmokeAlarm':
                    return 'Subject Safety Smoke Alarm';
                case 'C02Alarm':
                    return 'Subject Safety C02 Alarm';
                case 'WaterHtr':
                    return 'Subject Safety Water Heater';
                case 'Amenities':
                    return 'Subject Amenities';
                case 'Concerns':
                    return 'Subject Concerns';
                case 'CrawlSpace':
                    return 'Subject Crawl Space';
                case 'AtticSpace':
                    return 'Subject Attic Space';
                case 'FireOn':
                    return 'Subject Fire On';
                case 'WaterOn':
                    return 'Subject Water On';
                case 'Interior':
                    return 'Subject Interior';
                default:
                    // For any other types, use the original formatting
                    return pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
            }
        }
        
        // For ADU areas, return full labels
        if (isADUArea) {
            // Extract ADU number if present (e.g., "ADU 1", "ADU-1")
            const aduMatch = areaName.match(/adu\s*[-\s]*(\d+)/i);
            const aduPrefix = aduMatch ? `ADU-${aduMatch[1]}` : 'ADU';
            
            // Define exterior photo types
            const exteriorTypes = ['Front', 'AddressVerification', 'StreetView', 'ExteriorLeft', 'ExteriorRight', 'RearView', 'BackYard'];
            // Define safety photo types  
            const safetyTypes = ['SmokeAlarm', 'C02Alarm', 'WaterHtr'];
            // Define interior photo types
            const interiorTypes = ['Interior'];
            
            if (exteriorTypes.includes(pictureType)) {
                const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                return `${aduPrefix} Exterior ${typeLabel}`;
            } else if (safetyTypes.includes(pictureType)) {
                switch (pictureType) {
                    case 'SmokeAlarm':
                        return `${aduPrefix} Safety Smoke Alarm`;
                    case 'C02Alarm':
                        return `${aduPrefix} Safety C02 Alarm`;
                    case 'WaterHtr':
                        return `${aduPrefix} Safety Water Heater`;
                    default:
                        const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                        return `${aduPrefix} Safety ${typeLabel}`;
                }
            } else if (interiorTypes.includes(pictureType)) {
                return `${aduPrefix} Interior`;
            } else {
                // For other types, add ADU prefix with original formatting
                const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                return `${aduPrefix} ${typeLabel}`;
            }
        }
        
        // For UNIT areas, return full labels
        if (isUNITArea) {
            // Extract UNIT number if present (e.g., "UNIT 1", "UNIT-1")
            const unitMatch = areaName.match(/unit\s*[-\s]*(\d+)/i);
            const unitPrefix = unitMatch ? `UNIT-${unitMatch[1]}` : 'UNIT';
            
            // Define exterior photo types
            const exteriorTypes = ['Front', 'AddressVerification', 'StreetView', 'ExteriorLeft', 'ExteriorRight', 'RearView', 'BackYard'];
            // Define safety photo types
            const safetyTypes = ['SmokeAlarm', 'C02Alarm', 'WaterHtr'];
            // Define interior photo types
            const interiorTypes = ['Interior'];
            
            if (exteriorTypes.includes(pictureType)) {
                const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                return `${unitPrefix} Exterior ${typeLabel}`;
            } else if (safetyTypes.includes(pictureType)) {
                switch (pictureType) {
                    case 'SmokeAlarm':
                        return `${unitPrefix} Safety Smoke Alarm`;
                    case 'C02Alarm':
                        return `${unitPrefix} Safety C02 Alarm`;
                    case 'WaterHtr':
                        return `${unitPrefix} Safety Water Heater`;
                    default:
                        const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                        return `${unitPrefix} Safety ${typeLabel}`;
                }
            } else if (interiorTypes.includes(pictureType)) {
                return `${unitPrefix} Interior`;
            } else {
                // For other types, add UNIT prefix with original formatting
                const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                return `${unitPrefix} ${typeLabel}`;
            }
        }
        
        // For non-Floor, non-ADU, non-UNIT areas, use original formatting
        return pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    }

    // *** NEW: Robust Photo Tracking System ***

    /**
     * Generate a stable signature for photo tracking that survives ID changes
     * Uses area type + number + photo type instead of polygon ID
     */
    generatePhotoSignature(polygon, pictureType) {
        if (!polygon || !polygon.label) return null;
        
        const label = polygon.label.toLowerCase();
        let areaSignature = '';
        
        // Extract area type and number for consistent signatures
        if (label.includes('floor')) {
            const floorMatch = label.match(/floor\s*(\d+)/i);
            areaSignature = floorMatch ? `floor_${floorMatch[1]}` : 'floor_1';
        } else if (label.includes('adu')) {
            const aduMatch = label.match(/adu\s*[-\s]*(\d+)/i);
            areaSignature = aduMatch ? `adu_${aduMatch[1]}` : 'adu_1';
        } else if (label.includes('unit')) {
            const unitMatch = label.match(/unit\s*[-\s]*(\d+)/i);
            areaSignature = unitMatch ? `unit_${unitMatch[1]}` : 'unit_1';
        } else {
            // For other area types, use the label directly (sanitized)
            areaSignature = label.replace(/[^a-z0-9]/g, '_');
        }
        
        return `${areaSignature}__${pictureType}`;
    }

    /**
     * Generate signature for room photos that survives room recreation
     */
    generateRoomPhotoSignature(roomElement, parentArea) {
        if (!roomElement || !parentArea) return null;
        
        const roomType = roomElement.content.replace(/[^a-zA-Z]/g, '').toLowerCase(); // "bath.m" becomes "bathm"
        const areaSignature = this.generatePhotoSignature(parentArea, 'dummy').replace('__dummy', '');
        
        return `${areaSignature}__room_${roomType}`;
    }

    /**
     * Mark photo taken using stable signature
     */
    markPhotoTakenBySignature(signature) {
        if (!signature) return;
        
        this.photoButtonStates.set(signature, true);
        console.log(`📸 Marked photo taken: ${signature}`);
        
        // Also update any matching buttons
        for (const buttons of this.helperButtons.values()) {
            for (const button of buttons) {
                const polygon = AppState.drawnPolygons.find(p => p.id === button.polygonId);
                if (polygon) {
                    const buttonSignature = this.generatePhotoSignature(polygon, button.pictureType);
                    if (buttonSignature === signature) {
                        button.taken = true;
                    }
                }
            }
        }
        
        CanvasManager.redraw();
    }

    /**
     * Check if photo is taken using stable signature
     */
    isPhotoTakenBySignature(polygon, pictureType) {
        const signature = this.generatePhotoSignature(polygon, pictureType);
        return signature ? this.photoButtonStates.get(signature) === true : false;
    }

    /**
     * Generate signature from photo content (reverse engineering)
     */
    generateSignatureFromPhotoContent(content) {
        if (!content) return null;
        
        const contentLower = content.toLowerCase();
        
        // Helper button photos (area-based) - UPDATED with more comprehensive matching
        if (contentLower.includes('subject exterior front')) {
            return 'floor_1__Front';
        }
        if (contentLower.includes('subject address verification')) {
            return 'floor_1__AddressVerification';
        }
        if (contentLower.includes('subject exterior street')) {
            return 'floor_1__StreetView';
        }
        if (contentLower.includes('subject exterior left')) {
            return 'floor_1__ExteriorLeft';
        }
        if (contentLower.includes('subject exterior right')) {
            return 'floor_1__ExteriorRight';
        }
        if (contentLower.includes('subject exterior rear')) {
            return 'floor_1__RearView';
        }
        if (contentLower.includes('subject exterior back')) {
            return 'floor_1__BackYard';
        }
        if (contentLower.includes('subject safety smoke')) {
            return 'floor_1__SmokeAlarm';
        }
        if (contentLower.includes('subject safety c02')) {
            return 'floor_1__C02Alarm';
        }
        if (contentLower.includes('subject safety water')) {
            return 'floor_1__WaterHtr';
        }
        if (contentLower.includes('subject crawl space')) {
            return 'floor_1__CrawlSpace';
        }
        if (contentLower.includes('subject attic space')) {
            return 'floor_1__AtticSpace';
        }
        if (contentLower.includes('subject fire on')) {
            return 'floor_1__FireOn';
        }
        if (contentLower.includes('subject water on')) {
            return 'floor_1__WaterOn';
        }
        if (contentLower.includes('subject interior') && !contentLower.includes('adu') && !contentLower.includes('unit')) {
            return 'floor_1__Interior';
        }
        
        // ADU photos
        if (contentLower.includes('adu') && contentLower.includes('exterior front')) {
            const aduMatch = content.match(/adu[-\s]*(\d+)/i);
            const aduNum = aduMatch ? aduMatch[1] : '1';
            return `adu_${aduNum}__Front`;
        }
        if (contentLower.includes('adu') && contentLower.includes('safety smoke')) {
            const aduMatch = content.match(/adu[-\s]*(\d+)/i);
            const aduNum = aduMatch ? aduMatch[1] : '1';
            return `adu_${aduNum}__SmokeAlarm`;
        }
        if (contentLower.includes('adu') && contentLower.includes('safety c02')) {
            const aduMatch = content.match(/adu[-\s]*(\d+)/i);
            const aduNum = aduMatch ? aduMatch[1] : '1';
            return `adu_${aduNum}__C02Alarm`;
        }
        
        // UNIT photos
        if (contentLower.includes('unit') && contentLower.includes('exterior front')) {
            const unitMatch = content.match(/unit[-\s]*(\d+)/i);
            const unitNum = unitMatch ? unitMatch[1] : '1';
            return `unit_${unitNum}__Front`;
        }
        if (contentLower.includes('unit') && contentLower.includes('safety smoke')) {
            const unitMatch = content.match(/unit[-\s]*(\d+)/i);
            const unitNum = unitMatch ? unitMatch[1] : '1';
            return `unit_${unitNum}__SmokeAlarm`;
        }
        
        // Room photos  
        if (contentLower.includes('interior')) {
            let areaSignature = '';
            let roomType = '';
            
            // Extract area info
            if (contentLower.includes('subject interior')) {
                areaSignature = 'floor_1'; // Default to floor 1 for subject
                roomType = content.replace(/subject\s+interior\s+/i, '').replace(/[^a-zA-Z]/g, '').toLowerCase();
            } else if (contentLower.includes('adu') && contentLower.includes('interior')) {
                const aduMatch = content.match(/adu[-\s]*(\d+)\s+interior/i);
                const aduNum = aduMatch ? aduMatch[1] : '1';
                areaSignature = `adu_${aduNum}`;
                roomType = content.replace(/adu[-\s]*\d+\s+interior\s+/i, '').replace(/[^a-zA-Z]/g, '').toLowerCase();
            } else if (contentLower.includes('unit') && contentLower.includes('interior')) {
                const unitMatch = content.match(/unit[-\s]*(\d+)\s+interior/i);
                const unitNum = unitMatch ? unitMatch[1] : '1';
                areaSignature = `unit_${unitNum}`;
                roomType = content.replace(/unit[-\s]*\d+\s+interior\s+/i, '').replace(/[^a-zA-Z]/g, '').toLowerCase();
            }
            
            if (areaSignature && roomType) {
                return `${areaSignature}__room_${roomType}`;
            }
        }
        
        return null;
    }

    /**
     * Enhanced sync that rebuilds signatures from existing photos
     */
    syncHelperButtonStatesRobust() {
        console.log('🔄 Syncing photo states with robust signatures...');
        
        if (!AppState.photos || AppState.photos.length === 0) return;
        
        // Clear existing states
        this.photoButtonStates.clear();
        
        AppState.photos.forEach(photo => {
            let signature = null;
            
            // Try to generate signature from photo content
            if (photo.elementContent) {
                signature = this.generateSignatureFromPhotoContent(photo.elementContent);
            }
            
            // If we got a signature, mark it as taken
            if (signature) {
                this.photoButtonStates.set(signature, true);
                console.log(`📸 Restored photo state: ${signature}`);
            }
        });
        
        // Update button states
        for (const buttons of this.helperButtons.values()) {
            for (const button of buttons) {
                const polygon = AppState.drawnPolygons.find(p => p.id === button.polygonId);
                if (polygon) {
                    button.taken = this.isPhotoTakenBySignature(polygon, button.pictureType);
                }
            }
        }
        
        CanvasManager.redraw();
    }

    // *** Legacy methods for backward compatibility ***

    markPhotoTaken(polygonId, pictureType) {
        const polygon = AppState.drawnPolygons.find(p => p.id === polygonId);
        if (polygon) {
            const signature = this.generatePhotoSignature(polygon, pictureType);
            if (signature) {
                this.markPhotoTakenBySignature(signature);
                return;
            }
        }
        
        // Fallback to old method
        const key = `${polygonId}_${pictureType}`;
        this.photoButtonStates.set(key, true);
        const buttons = this.helperButtons.get(polygonId);
        if (buttons) {
            const button = buttons.find(b => b.pictureType === pictureType);
            if (button) button.taken = true;
        }
        CanvasManager.redraw();
    }

    unmarkPhotoTaken(polygonId, pictureType) {
        const polygon = AppState.drawnPolygons.find(p => p.id === polygonId);
        if (polygon) {
            const signature = this.generatePhotoSignature(polygon, pictureType);
            if (signature) {
                this.photoButtonStates.set(signature, false);
            }
        }
        
        // Also handle legacy key
        const key = `${polygonId}_${pictureType}`;
        this.photoButtonStates.set(key, false);
        const buttons = this.helperButtons.get(polygonId);
        if (buttons) {
            const button = buttons.find(b => b.pictureType === pictureType);
            if (button) button.taken = false;
        }
        CanvasManager.redraw();
    }

    isPhotoTaken(polygonId, pictureType) {
        const polygon = AppState.drawnPolygons.find(p => p.id === polygonId);
        if (polygon) {
            const isRobustTaken = this.isPhotoTakenBySignature(polygon, pictureType);
            if (isRobustTaken) return true;
        }
        
        // Fallback to legacy method
        return this.photoButtonStates.get(`${polygonId}_${pictureType}`) === true;
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
    
    calculateCentroid(path) {
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

    // *** NEW: Clear all photo button states method for robust sync ***
    clearAllPhotoStates() {
        this.photoButtonStates.clear();
        console.log('🔄 Cleared all photo button states');
    }
}

export const photoHelperButtons = new PhotoHelperButtons();