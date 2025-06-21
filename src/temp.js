// UPDATE: Add this method to photoHelperButtons.js (insert this method around line 160, after formatButtonLabel)

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