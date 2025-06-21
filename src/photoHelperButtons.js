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
    
    // *** UPDATED: Enhanced formatButtonLabel with ABBREVIATED button text for all area types ***
  formatButtonLabel(pictureType, polygon) {
        // Get the area name (polygon label)
        const areaName = polygon ? polygon.label : '';
        const isFloorArea = areaName && areaName.toLowerCase().includes('floor');
        const isADUArea = areaName && areaName.toLowerCase().includes('adu');
        const isUNITArea = areaName && areaName.toLowerCase().includes('unit');
        const isPatioArea = areaName && areaName.toLowerCase().includes('patio');
        const isPorchArea = areaName && areaName.toLowerCase().includes('porch');
        const isDeckArea = areaName && areaName.toLowerCase().includes('deck');
        const isGarageArea = areaName && areaName.toLowerCase().includes('garage');
        const isCarportArea = areaName && areaName.toLowerCase().includes('carport');
        const isStorageArea = areaName && areaName.toLowerCase().includes('storage');
        const isUtilityArea = areaName && areaName.toLowerCase().includes('utility');
        
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
        
        // *** NEW: For PATIO areas (Covered Patio 1, Uncovered Patio 2, etc.) ***
        if (isPatioArea) {
            // Extract the area name and number: "Covered Patio 2" -> "Patio 2"
            const patioMatch = areaName.match(/(covered|uncovered)?\s*patio\s*(\d+)?/i);
            let patioPrefix = 'Patio';
            if (patioMatch && patioMatch[2]) {
                patioPrefix = `Patio ${patioMatch[2]}`;
            } else if (patioMatch) {
                patioPrefix = 'Patio 1'; // Default to 1 if no number found
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${patioPrefix} Front`;
                case 'Interior':
                    return `${patioPrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${patioPrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For PORCH areas (Covered Porch 1, Uncovered Porch 2, etc.) ***
        if (isPorchArea) {
            // Extract the area name and number: "Covered Porch 2" -> "Porch 2"
            const porchMatch = areaName.match(/(covered|uncovered)?\s*porch\s*(\d+)?/i);
            let porchPrefix = 'Porch';
            if (porchMatch && porchMatch[2]) {
                porchPrefix = `Porch ${porchMatch[2]}`;
            } else if (porchMatch) {
                porchPrefix = 'Porch 1'; // Default to 1 if no number found
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${porchPrefix} Front`;
                case 'Interior':
                    return `${porchPrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${porchPrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For DECK areas (Covered Deck 1, Uncovered Deck 2, etc.) ***
        if (isDeckArea) {
            // Extract the area name and number: "Covered Deck 2" -> "Deck 2"
            const deckMatch = areaName.match(/(covered|uncovered)?\s*deck\s*(\d+)?/i);
            let deckPrefix = 'Deck';
            if (deckMatch && deckMatch[2]) {
                deckPrefix = `Deck ${deckMatch[2]}`;
            } else if (deckMatch) {
                deckPrefix = 'Deck 1'; // Default to 1 if no number found
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${deckPrefix} Front`;
                case 'Interior':
                    return `${deckPrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${deckPrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For GARAGE areas ***
        if (isGarageArea) {
            const garageMatch = areaName.match(/garage\s*(\d+)?/i);
            let garagePrefix = 'Garage';
            if (garageMatch && garageMatch[1]) {
                garagePrefix = `Garage ${garageMatch[1]}`;
            } else if (garageMatch) {
                garagePrefix = 'Garage 1';
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${garagePrefix} Front`;
                case 'Interior':
                    return `${garagePrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${garagePrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For CARPORT areas ***
        if (isCarportArea) {
            const carportMatch = areaName.match(/carport\s*(\d+)?/i);
            let carportPrefix = 'Carport';
            if (carportMatch && carportMatch[1]) {
                carportPrefix = `Carport ${carportMatch[1]}`;
            } else if (carportMatch) {
                carportPrefix = 'Carport 1';
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${carportPrefix} Front`;
                case 'Interior':
                    return `${carportPrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${carportPrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For STORAGE areas ***
        if (isStorageArea) {
            const storageMatch = areaName.match(/storage\s*(\d+)?/i);
            let storagePrefix = 'Storage';
            if (storageMatch && storageMatch[1]) {
                storagePrefix = `Storage ${storageMatch[1]}`;
            } else if (storageMatch) {
                storagePrefix = 'Storage 1';
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${storagePrefix} Front`;
                case 'Interior':
                    return `${storagePrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${storagePrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For UTILITY areas ***
        if (isUtilityArea) {
            const utilityMatch = areaName.match(/utility\s*(\d+)?/i);
            let utilityPrefix = 'Utility';
            if (utilityMatch && utilityMatch[1]) {
                utilityPrefix = `Utility ${utilityMatch[1]}`;
            } else if (utilityMatch) {
                utilityPrefix = 'Utility 1';
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${utilityPrefix} Front`;
                case 'Interior':
                    return `${utilityPrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${utilityPrefix} ${typeLabel}`;
            }
        }
        
        // For all other areas, use original formatting
        return pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    }
    // *** UPDATED: Separate method for FULL photo labels (used when photos are taken) ***
    getFullPhotoLabel(pictureType, polygon) {
        // Get the area name (polygon label)
        const areaName = polygon ? polygon.label : '';
        const isFloorArea = areaName && areaName.toLowerCase().includes('floor');
        const isADUArea = areaName && areaName.toLowerCase().includes('adu');
        const isUNITArea = areaName && areaName.toLowerCase().includes('unit');
        const isPatioArea = areaName && areaName.toLowerCase().includes('patio');
        const isPorchArea = areaName && areaName.toLowerCase().includes('porch');
        const isDeckArea = areaName && areaName.toLowerCase().includes('deck');
        const isGarageArea = areaName && areaName.toLowerCase().includes('garage');
        const isCarportArea = areaName && areaName.toLowerCase().includes('carport');
        const isStorageArea = areaName && areaName.toLowerCase().includes('storage');
        const isUtilityArea = areaName && areaName.toLowerCase().includes('utility');
        
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
        
        // *** NEW: For PATIO areas - FULL labels for photos ***
        if (isPatioArea) {
            // Extract the area name and number: "Covered Patio 2" -> "Patio 2"
            const patioMatch = areaName.match(/(covered|uncovered)?\s*patio\s*(\d+)?/i);
            let patioPrefix = 'Patio';
            if (patioMatch && patioMatch[2]) {
                patioPrefix = `Patio ${patioMatch[2]}`;
            } else if (patioMatch) {
                patioPrefix = 'Patio 1'; // Default to 1 if no number found
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${patioPrefix} Exterior Front`;
                case 'Interior':
                    return `${patioPrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${patioPrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For PORCH areas - FULL labels for photos ***
        if (isPorchArea) {
            // Extract the area name and number: "Covered Porch 2" -> "Porch 2"
            const porchMatch = areaName.match(/(covered|uncovered)?\s*porch\s*(\d+)?/i);
            let porchPrefix = 'Porch';
            if (porchMatch && porchMatch[2]) {
                porchPrefix = `Porch ${porchMatch[2]}`;
            } else if (porchMatch) {
                porchPrefix = 'Porch 1'; // Default to 1 if no number found
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${porchPrefix} Exterior Front`;
                case 'Interior':
                    return `${porchPrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${porchPrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For DECK areas - FULL labels for photos ***
        if (isDeckArea) {
            // Extract the area name and number: "Covered Deck 2" -> "Deck 2"
            const deckMatch = areaName.match(/(covered|uncovered)?\s*deck\s*(\d+)?/i);
            let deckPrefix = 'Deck';
            if (deckMatch && deckMatch[2]) {
                deckPrefix = `Deck ${deckMatch[2]}`;
            } else if (deckMatch) {
                deckPrefix = 'Deck 1'; // Default to 1 if no number found
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${deckPrefix} Exterior Front`;
                case 'Interior':
                    return `${deckPrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${deckPrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For GARAGE areas - FULL labels for photos ***
        if (isGarageArea) {
            const garageMatch = areaName.match(/garage\s*(\d+)?/i);
            let garagePrefix = 'Garage';
            if (garageMatch && garageMatch[1]) {
                garagePrefix = `Garage ${garageMatch[1]}`;
            } else if (garageMatch) {
                garagePrefix = 'Garage 1';
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${garagePrefix} Exterior Front`;
                case 'Interior':
                    return `${garagePrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${garagePrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For CARPORT areas - FULL labels for photos ***
        if (isCarportArea) {
            const carportMatch = areaName.match(/carport\s*(\d+)?/i);
            let carportPrefix = 'Carport';
            if (carportMatch && carportMatch[1]) {
                carportPrefix = `Carport ${carportMatch[1]}`;
            } else if (carportMatch) {
                carportPrefix = 'Carport 1';
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${carportPrefix} Exterior Front`;
                case 'Interior':
                    return `${carportPrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${carportPrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For STORAGE areas - FULL labels for photos ***
        if (isStorageArea) {
            const storageMatch = areaName.match(/storage\s*(\d+)?/i);
            let storagePrefix = 'Storage';
            if (storageMatch && storageMatch[1]) {
                storagePrefix = `Storage ${storageMatch[1]}`;
            } else if (storageMatch) {
                storagePrefix = 'Storage 1';
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${storagePrefix} Exterior Front`;
                case 'Interior':
                    return `${storagePrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${storagePrefix} ${typeLabel}`;
            }
        }
        
        // *** NEW: For UTILITY areas - FULL labels for photos ***
        if (isUtilityArea) {
            const utilityMatch = areaName.match(/utility\s*(\d+)?/i);
            let utilityPrefix = 'Utility';
            if (utilityMatch && utilityMatch[1]) {
                utilityPrefix = `Utility ${utilityMatch[1]}`;
            } else if (utilityMatch) {
                utilityPrefix = 'Utility 1';
            }
            
            switch (pictureType) {
                case 'Front':
                    return `${utilityPrefix} Exterior Front`;
                case 'Interior':
                    return `${utilityPrefix} Interior`;
                default:
                    const typeLabel = pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                    return `${utilityPrefix} ${typeLabel}`;
            }
        }
        
        // For all other areas, use original formatting
        return pictureType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    }

    // *** FIXED: Robust Photo Tracking System ***

    /**
     * FIXED: Generate a stable signature for photo tracking that survives ID changes
     * Uses polygon ID + polygon label + photo type for unique identification
     */
    generatePhotoSignature(polygon, pictureType) {
        if (!polygon || !polygon.label) return null;
        
        // Use polygon ID + sanitized label + picture type for truly unique signatures
        const sanitizedLabel = polygon.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const polygonId = polygon.id;
        
        return `${polygonId}__${sanitizedLabel}__${pictureType}`;
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
     * FIXED: Generate signature from photo content (reverse engineering)
     * Uses more specific matching to avoid conflicts between similar areas
     */
    generateSignatureFromPhotoContent(content) {
        if (!content) return null;
        
        const contentLower = content.toLowerCase();
        
        // Find the polygon that matches this photo content
        for (const polygon of AppState.drawnPolygons) {
            const polygonLabel = polygon.label ? polygon.label.toLowerCase() : '';
            
            // Check if this polygon could be the source of this photo
            let couldMatch = false;
            
            // For Floor areas - check for "subject" content
            if (polygonLabel.includes('floor') && contentLower.includes('subject')) {
                couldMatch = true;
            }
            // For ADU areas  
            else if (polygonLabel.includes('adu') && contentLower.includes('adu')) {
                couldMatch = true;
            }
            // For UNIT areas
            else if (polygonLabel.includes('unit') && contentLower.includes('unit')) {
                couldMatch = true;
            }
            // For Patio areas - check for patio content (not subject/adu/unit)
            else if (polygonLabel.includes('patio') && contentLower.includes('patio') && 
                     !contentLower.includes('subject') && !contentLower.includes('adu') && !contentLower.includes('unit')) {
                couldMatch = true;
            }
            // For Porch areas - check for porch content (not subject/adu/unit)
            else if (polygonLabel.includes('porch') && contentLower.includes('porch') && 
                     !contentLower.includes('subject') && !contentLower.includes('adu') && !contentLower.includes('unit')) {
                couldMatch = true;
            }
            // For Deck areas - check for deck content (not subject/adu/unit)
            else if (polygonLabel.includes('deck') && contentLower.includes('deck') && 
                     !contentLower.includes('subject') && !contentLower.includes('adu') && !contentLower.includes('unit')) {
                couldMatch = true;
            }
            // For Garage areas
            else if (polygonLabel.includes('garage') && contentLower.includes('garage') && 
                     !contentLower.includes('subject') && !contentLower.includes('adu') && !contentLower.includes('unit')) {
                couldMatch = true;
            }
            // For Carport areas
            else if (polygonLabel.includes('carport') && contentLower.includes('carport') && 
                     !contentLower.includes('subject') && !contentLower.includes('adu') && !contentLower.includes('unit')) {
                couldMatch = true;
            }
            // For Storage areas
            else if (polygonLabel.includes('storage') && contentLower.includes('storage') && 
                     !contentLower.includes('subject') && !contentLower.includes('adu') && !contentLower.includes('unit')) {
                couldMatch = true;
            }
            // For Utility areas
            else if (polygonLabel.includes('utility') && contentLower.includes('utility') && 
                     !contentLower.includes('subject') && !contentLower.includes('adu') && !contentLower.includes('unit')) {
                couldMatch = true;
            }
            
            if (couldMatch) {
                // Try to determine picture type from content
                let pictureType = null;
                
                if (contentLower.includes('front') && !contentLower.includes('address') && !contentLower.includes('street')) {
                    pictureType = 'Front';
                }
                else if (contentLower.includes('address verification')) {
                    pictureType = 'AddressVerification';
                }
                else if (contentLower.includes('street')) {
                    pictureType = 'StreetView';
                }
                else if (contentLower.includes('exterior left') || contentLower.includes('ext left')) {
                    pictureType = 'ExteriorLeft';
                }
                else if (contentLower.includes('exterior right') || contentLower.includes('ext right')) {
                    pictureType = 'ExteriorRight';
                }
                else if (contentLower.includes('rear')) {
                    pictureType = 'RearView';
                }
                else if (contentLower.includes('back yard')) {
                    pictureType = 'BackYard';
                }
                else if (contentLower.includes('smoke alarm')) {
                    pictureType = 'SmokeAlarm';
                }
                else if (contentLower.includes('c02 alarm')) {
                    pictureType = 'C02Alarm';
                }
                else if (contentLower.includes('water heater')) {
                    pictureType = 'WaterHtr';
                }
                else if (contentLower.includes('crawl space')) {
                    pictureType = 'CrawlSpace';
                }
                else if (contentLower.includes('attic space')) {
                    pictureType = 'AtticSpace';
                }
                else if (contentLower.includes('fire on')) {
                    pictureType = 'FireOn';
                }
                else if (contentLower.includes('water on')) {
                    pictureType = 'WaterOn';
                }
                else if (contentLower.includes('interior')) {
                    pictureType = 'Interior';
                }
                
                if (pictureType) {
                    return this.generatePhotoSignature(polygon, pictureType);
                }
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