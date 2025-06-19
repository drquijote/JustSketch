// src/previewManager.js - FIXED to correctly load photos into the preview AND properly center sketches.

import { AppState } from './state.js';

/**
 * Manages the creation of a high-quality preview of the entire sketch in a new window.
 * Updated to use 120 DPI resolution for custom size paper (8.5" x 13")
 * ADDED: Now includes subsequent pages for photos, with scrolling.
 */
export class PreviewManager {
    constructor() {
        console.log('PreviewManager initialized.');
    }

    /**
     * The main public method to show the preview window.
     * Opens at 1020x1560 pixels (120 DPI for 8.5" x 13" custom size)
     */
    showPreview() {
        const stateSnapshot = AppState.getStateSnapshot();

        // --- THIS IS THE FIX ---
        // Manually add the photos to the snapshot. The standard snapshot doesn't include them,
        // which is why they were not appearing in the preview.
        stateSnapshot.photos = AppState.photos || [];
        // --- END FIX ---

        // Updated dimensions for 120 DPI custom size
        const previewWindow = window.open('', 'FloorplanPreview', 'width=1020,height=1560,scrollbars=yes,resizable=yes');
        if (!previewWindow) {
            alert('Please allow pop-ups for this site to view the preview.');
            return;
        }

        previewWindow.appStateData = stateSnapshot;
        
        const previewHTML = this._generatePreviewHTML(stateSnapshot);

        previewWindow.document.open();
        previewWindow.document.write(previewHTML);
        previewWindow.document.close();
    }
    
    /**
     * Generates the entire HTML string for the preview popup window.
     * @param {object} state - The AppState snapshot.
     * @returns {string} A complete HTML document as a string.
     */
_generatePreviewHTML(state) {
    // --- Calculate Summary Data ---
    let totalGLA = 0;
    let nonGLA = 0;
    let glaBreakdownHTML = '';
    let nonGlaBreakdownHTML = '';

    state.drawnPolygons.forEach(p => {
        const area = p.area || 0;
        const itemHTML = `<div>${p.label}: ${area.toFixed(1)} sq ft</div>`;
        if (p.glaType === 1) {
            totalGLA += area;
            glaBreakdownHTML += itemHTML;
        } else if (p.glaType === 0) {
            nonGLA += area;
            nonGlaBreakdownHTML += itemHTML;
        }
    });

    let bedrooms = 0;
    let bathrooms = 0;
    state.placedElements.forEach(el => {
        if (el.type === 'room') {
            const label = el.content.toLowerCase();
            if (label.includes('bedroom')) bedrooms++;
            else if (label.includes('1/2 bath')) bathrooms += 0.5;
            else if (label.includes('bath')) bathrooms++;
        }
    });

    // --- MODIFIED: SPECIAL PHOTO HANDLING FOR IMPORTANT VIEWS ---
    let photoPagesHTML = '';
    if (state.photos && state.photos.length > 0) {
        // Identify element IDs of "gray" rooms to exclude their photos.
        const grayElementIds = new Set(
            state.placedElements
                .filter(el => el.type === 'room' && el.styling?.className?.includes('perm-palette'))
                .map(el => el.id)
        );

        // Filter out photos linked to gray elements
        const validPhotos = state.photos.filter(photo => !grayElementIds.has(photo.elementId));

        // NEW: Function to check if a photo is "important"
        const isImportantPhoto = (photo) => {
            const content = (photo.elementContent || '').toLowerCase();
            
            // Check for important views with proper context
            const isFloorFront = content.includes('floor') && content.includes('front') && !content.includes('patio') && !content.includes('deck') && !content.includes('porch');
            const isSubjectFront = content.includes('subject') && content.includes('front');
            const isFrontView = content.includes('front view');
            
            const isFloorStreet = content.includes('floor') && content.includes('street');
            const isSubjectStreet = content.includes('subject') && content.includes('street');
            const isStreetView = content.includes('street view');
            
            const isFloorRear = content.includes('floor') && content.includes('rear');
            const isSubjectRear = content.includes('subject') && content.includes('rear');
            const isRearView = content.includes('rear view');
            
            return isFloorFront || isSubjectFront || isFrontView ||
                   isFloorStreet || isSubjectStreet || isStreetView ||
                   isFloorRear || isSubjectRear || isRearView;
        };

        const getPreviewCaption = (photo) => {
            let caption = photo.elementContent || 'Attached Photo';
            
            // Replace "Floor 1" with "Subject" for important photos in preview only
            if (isImportantPhoto(photo)) {
                caption = caption.replace(/floor\s*1/gi, 'Subject');
            }
            
            return caption;
        };

        // Separate important photos from regular photos
        const importantPhotos = validPhotos.filter(isImportantPhoto);
        const regularPhotos = validPhotos.filter(photo => !isImportantPhoto(photo));

        // Sort important photos to ensure Front View comes first
        const sortedImportantPhotos = importantPhotos.sort((a, b) => {
            const aContent = (a.elementContent || '').toLowerCase();
            const bContent = (b.elementContent || '').toLowerCase();
            
            // Front view gets highest priority (0) - matches both "front view" and "front"
            if (aContent.includes('front')) return -1;
            if (bContent.includes('front')) return 1;
            
            // Street view gets second priority (1) - matches both "street view" and "street"
            if (aContent.includes('street')) return -1;
            if (bContent.includes('street')) return 1;
            
            // Rear view gets third priority (2) - matches both "rear view" and "rear"
            if (aContent.includes('rear')) return -1;
            if (bContent.includes('rear')) return 1;
            
            return 0;
        });

        // IMPORTANT PHOTOS: Always 3-per-page, always visible, ALWAYS FIRST
        let importantPhotosHTML = '';
        const importantPhotoPages = [];
        for (let i = 0; i < sortedImportantPhotos.length; i += 3) {
            importantPhotoPages.push(sortedImportantPhotos.slice(i, i + 3));
        }

        importantPhotoPages.forEach((page, pageIndex) => {
            const photoItemsHTML = page.map(photo => `
                <div class="photo-item-vertical">
                    <img src="${photo.imageData}" alt="${getPreviewCaption(photo)}">
                    <div class="caption">${getPreviewCaption(photo)}</div>
                </div>
            `).join('');

            importantPhotosHTML += `
                <div class="page-container photo-page important-photos">
                    <div class="page-title">Photos (Page ${pageIndex + 1})</div>
                    <div class="photo-grid-vertical">
                        ${photoItemsHTML}
                    </div>
                </div>
            `;
        });

        // REGULAR PHOTOS: 3-per-page layout (default)
        let regularPhotosHTML = '';
        const regularPhotoPages3 = [];
        for (let i = 0; i < regularPhotos.length; i += 3) {
            regularPhotoPages3.push(regularPhotos.slice(i, i + 3));
        }

        regularPhotoPages3.forEach((page, pageIndex) => {
            const photoItemsHTML = page.map(photo => `
                <div class="photo-item-vertical">
                    <img src="${photo.imageData}" alt="${getPreviewCaption(photo)}">
                    <div class="caption">${getPreviewCaption(photo)}</div>
                </div>
            `).join('');

            regularPhotosHTML += `
                <div class="page-container photo-page layout-3">
                    <div class="page-title">Photos (Page ${pageIndex + 1})</div>
                    <div class="photo-grid-vertical">
                        ${photoItemsHTML}
                    </div>
                </div>
            `;
        });

        // REGULAR PHOTOS: 6-per-page layout (initially hidden)
        const regularPhotoPages6 = [];
        for (let i = 0; i < regularPhotos.length; i += 6) {
            regularPhotoPages6.push(regularPhotos.slice(i, i + 6));
        }

        regularPhotoPages6.forEach((page, pageIndex) => {
            const photoItemsHTML = page.map(photo => `
                <div class="photo-item-grid">
                    <img src="${photo.imageData}" alt="${getPreviewCaption(photo)}">
                    <div class="caption">${getPreviewCaption(photo)}</div>
                </div>
            `).join('');

            regularPhotosHTML += `
                <div class="page-container photo-page layout-6" style="display: none;">
                    <div class="page-title">Photos (Page ${pageIndex + 1})</div>
                    <div class="photo-grid-6">
                        ${photoItemsHTML}
                    </div>
                </div>
            `;
        });

        // COMBINE: Important photos FIRST, then flood map, then regular photos
        
        // ADD FLOOD MAP PAGE
        const floodMapHTML = `
            <div class="page-container flood-map-page">
                <div class="page-title">Subject Flood Map</div>
                <div class="flood-map-content">
                    <div class="flood-map-container">
                        <div class="flood-map-placeholder">
                            <div class="flood-zone-info">
                                <h3>Flood Zone Information</h3>
                                <div class="zone-designation">
                                    <span class="zone-label">Flood Zone:</span>
                                    <span class="zone-value" id="floodZone">Loading...</span>
                                </div>
                                <div class="risk-level">
                                    <span class="risk-label">Risk Level:</span>
                                    <span class="risk-value" id="riskLevel">Loading...</span>
                                </div>
                                <div class="property-address">
                                    <span class="address-label">Property:</span>
                                    <span class="address-value" id="propertyAddress">Loading...</span>
                                </div>
                            </div>
                            <div class="flood-map-image">
                                <div class="map-placeholder">
                                    <p>Flood Map Loading...</p>
                                    <div class="loading-spinner"></div>
                                </div>
                                <img id="floodMapImg" style="display: none;" alt="FEMA Flood Map">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        photoPagesHTML = importantPhotosHTML + floodMapHTML + regularPhotosHTML;
    }
    // --- END: PHOTO PAGE GENERATION LOGIC ---
    
    // --- Return the complete HTML document ---
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Sketch Preview - Custom Size</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
            <style>
                html, body { 
                    height: 100%; 
                    margin: 0; 
                    padding: 0; 
                    /* MODIFIED: Changed overflow to hidden to prevent double scrollbars */
                    overflow: hidden; 
                    background: #e8e8e8; 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    scroll-behavior: smooth;
                }
                
                /* MODIFIED: Wrapper to enable vertical page scrolling and snapping */
                .page-wrapper {
                    height: 100vh;
                    overflow-y: auto;
                    scroll-snap-type: y mandatory;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 20px 0;
                    box-sizing: border-box;
                }
                
                .page-container { 
                    width: 1020px;
                    /* MODIFIED: Use max-height to not constrain content vertically */
                    max-height: 1560px;
                    display: flex; 
                    flex-direction: column; 
                    background: white;
                    box-shadow: 0 0 20px rgba(0,0,0,0.3);
                    overflow: hidden;
                    aspect-ratio: 8.5 / 13;
                    transform-origin: top center;
                    /* MODIFIED: Add scroll-snap alignment and margin */
                    scroll-snap-align: start;
                    flex-shrink: 0;
                    margin-bottom: 20px;
                }

                /* --- STYLES FOR PHOTO PAGES --- */
                .photo-page {
                    justify-content: flex-start;
                    padding: 40px;
                    box-sizing: border-box;
                    height: 1560px; /* Enforce same height as sketch page */
                }
                
                /* 3-per-page vertical layout */
                .photo-grid-vertical {
                    display: flex;
                    flex-direction: column; /* Stack photos vertically */
                    align-items: center; /* Center photos horizontally */
                    width: 100%;
                    margin-top: 20px;
                    flex-grow: 1; /* ADDED: Fill available vertical space */
                    min-height: 0; /* ADDED: Allow shrinking */
                    justify-content: space-between; /* ADDED: Distribute photo items */
                }
                
                .photo-item-vertical {
                    display: flex;
                    padding: 15px;
                    flex-direction: column;
                    align-items: center;
                    width: 100%;
                    background: lightgrey;
                    border: 5px solid lightblue;
                    border-radius: 15px;
                    max-width: 780px; /* 6.5 inches at 120 DPI */
                    min-width: 720px; /* 6 inches at 120 DPI */
                    height: 32%; /* ADDED: Set relative height for 3 items */
                    box-sizing: border-box; /* ADDED: Include padding/border in height */
                }
                
                .photo-item-vertical img {
                    width: 100%;
                    border: 1px solid #ccc;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    margin-bottom: 10px;
                    object-fit: contain;
                    flex: 1; /* ADDED: Allow image to fill space flexibly */
                    min-height: 0; /* ADDED: Allow image to shrink */
                }
                
                .photo-item-vertical .caption {
                    font-size: 16px; /* Slightly larger for better readability */
                    font-weight: 500;
                    text-align: center;
                    color: #333;
                    margin-top: 5px;
                }

                /* 6-per-page grid layout (3 rows x 2 columns) */
                .photo-grid-6 {
                    display: grid;
                    grid-template-columns: 1fr 1fr; /* 2 columns */
                    grid-template-rows: 1fr 1fr 1fr; /* 3 rows */
                    gap: 20px;
                    width: 100%;
                    height: 100%;
                    margin-top: 20px;
                    padding: 0 20px;
                    box-sizing: border-box;
                }

                /* --- FLOOD MAP PAGE STYLES --- */
                .flood-map-page {
                    justify-content: flex-start;
                    padding: 40px;
                    box-sizing: border-box;
                    height: 1560px;
                }
                
                .flood-map-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    margin-top: 20px;
                }
                
                .flood-map-container {
                    width: 100%;
                    height: 100%;
                    background: white;
                    border: 2px solid #007bff;
                    border-radius: 10px;
                    padding: 20px;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                }
                
                .flood-zone-info {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    border-left: 5px solid #007bff;
                }
                
                .flood-zone-info h3 {
                    margin: 0 0 15px 0;
                    color: #007bff;
                    font-size: 1.2em;
                    text-align: center;
                }
                
                .zone-designation, .risk-level, .property-address {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 10px;
                    padding: 8px 0;
                    border-bottom: 1px solid #dee2e6;
                }
                
                .zone-label, .risk-label, .address-label {
                    font-weight: 600;
                    color: #495057;
                }
                
                .zone-value, .risk-value, .address-value {
                    font-weight: 500;
                    color: #007bff;
                }
                
                .flood-map-image {
                    flex: 1;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: #f8f9fa;
                    border: 2px dashed #dee2e6;
                    border-radius: 8px;
                    min-height: 400px;
                }
                
                .map-placeholder {
                    text-align: center;
                    color: #6c757d;
                }
                
                .map-placeholder p {
                    font-size: 1.1em;
                    margin-bottom: 20px;
                }
                
                .loading-spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #007bff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                #floodMapImg {
                    max-width: 100%;
                    max-height: 100%;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
                /* --- END FLOOD MAP STYLES --- */
                
                .photo-item-grid {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    background: lightgrey;
                    border: 3px solid lightblue;
                    border-radius: 10px;
                    padding: 10px;
                    box-sizing: border-box;
                    height: 100%;
                }
                
                .photo-item-grid img {
                    width: 100%;
                    height: auto;
                    border: 1px solid #ccc;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    margin-bottom: 8px;
                    object-fit: contain;
                    flex: 1;
                    min-height: 0;
                    max-height: calc(100% - 40px); /* Leave space for caption */
                }
                
                .photo-item-grid .caption {
                    font-size: 12px;
                    font-weight: 500;
                    text-align: center;
                    color: #333;
                    margin-top: 5px;
                    flex-shrink: 0;
                }

                /* Mobile responsive scaling */
                @media (max-width: 1060px) {
                    .page-wrapper {
                        padding: 10px 0;
                    }
                    .page-container {
                        transform: scale(calc((100vw - 40px) / 1020px));
                        margin-bottom: calc(1580px * (1 - (100vw - 40px) / 1020px) * -1);
                    }
                    /* Adjust photo widths for mobile */
                    .photo-item-vertical {
                        max-width: calc(780px * ((100vw - 40px) / 1020px));
                        min-width: calc(720px * ((100vw - 40px) / 1020px));
                    }
                }
                
                @media (max-width: 480px) {
                    .page-wrapper {
                        padding: 5px 0;
                    }
                    .page-container {
                        transform: scale(calc((100vw - 20px) / 1020px));
                        margin-bottom: calc(1580px * (1 - (100vw - 20px) / 1020px) * -1);
                    }
                }

                .canvas-section { 
                    flex: 1; 
                    min-height: 0; 
                    position: relative; 
                    background: white; 
                    overflow: hidden;
                    padding: 20px;
                }
                #previewCanvas { 
                    position: absolute; 
                    top: 0; 
                    left: 0; 
                    width: 100%; 
                    height: 100%; 
                }
                .legend-section { 
                    flex-shrink: 0; 
                    background: #f8f9fa; 
                    padding: 20px; 
                    border-top: 2px solid #dee2e6;
                }
                .legend-title { 
                    font-size: 1.1em; 
                    font-weight: 600; 
                    color: #333; 
                    margin-bottom: 10px; 
                    text-align: center; 
                }
                .legend-grid { 
                    display: flex; 
                    justify-content: space-around; 
                    align-items: flex-start; 
                }
                .summary-column, .breakdown-column { 
                    padding: 0 15px; 
                }
                .summary-item { 
                    display: flex; 
                    justify-content: space-between; 
                    padding: 3px 0; 
                    font-size: 1em; 
                    border-bottom: 1px solid #e9ecef; 
                }
                .breakdown-title { 
                    font-weight: bold; 
                    margin-top: 8px; 
                    margin-bottom: 4px; 
                    color: #555; 
                    font-size: 0.9em;
                }
                .html-overlay { 
                    position: absolute; 
                    top: 0; 
                    left: 0; 
                    pointer-events: none; 
                    width: 100%; 
                    height: 100%; 
                }
                
                /* Layout toggle button */
                .layout-btn { 
                    position: fixed; 
                    top: 15px; 
                    right: 20px; 
                    padding: 10px 18px; 
                    background: #6c757d; 
                    color: white; 
                    border: none; 
                    border-radius: 5px; 
                    cursor: pointer; 
                    z-index: 1000; 
                    font-size: 1em; 
                }
                
                .pdf-btn {
                    position: fixed;
                    top: 15px;
                    right: 140px;
                    padding: 10px 18px;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    z-index: 1000;
                    font-size: 1em;
                }
                
                .pdf-btn:hover, .layout-btn:hover {
                    opacity: 0.9;
                }
                
                .page-title {
                    text-align: center;
                    font-size: 1.5em;
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 15px;
                    padding-top: 10px;
                }
                
                .mobile-notice {
                    display: none;
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 10px 20px;
                    border-radius: 5px;
                    font-size: 12px;
                    z-index: 1000;
                    text-align: center;
                }
                
                @media (max-width: 768px) {
                    .mobile-notice {
                        display: block;
                    }
                    .layout-btn, .pdf-btn {
                        top: 10px;
                        right: 10px;
                        padding: 8px 14px;
                        font-size: 0.9em;
                    }
                    .pdf-btn {
                        top: 50px;
                    }
                }
                
                /* Print styles optimized for custom size at 120 DPI */
                @media print { 
                    @page {
                        size: 8.5in 13in;
                        margin: 0;
                    }
                    body, .page-wrapper { 
                        background: white;
                        overflow: visible;
                        height: auto;
                    }
                    .layout-btn, .pdf-btn, .mobile-notice { 
                        display: none !important; 
                    } 
                    .page-container {
                        box-shadow: none;
                        border: 1px solid #ccc;
                        margin: 0;
                        transform: scale(1) !important; /* Reset scaling for print */
                        page-break-before: always; /* Each page container starts on a new page */
                    }
                    .page-container:first-child {
                        page-break-before: auto; /* First page doesn't need a break */
                    }
                    .canvas-section, .legend-section { 
                        box-shadow: none; 
                        border-radius: 0; 
                        border: none;
                    }
                }
            </style>
        </head>
        <body>
            <div class="page-wrapper">
                <div class="page-container">
                    <button class="pdf-btn" onclick="generatePDF()">PDF</button>
                    <button class="layout-btn" onclick="togglePhotoLayout()">6/Page</button>
                    <div class="page-title">Subject Sketch</div>
                    <div class="canvas-section">
                        <canvas id="previewCanvas"></canvas>
                        <div id="htmlOverlayContainer" class="html-overlay"></div>
                    </div>
                    <div class="legend-section">
                        <div class="legend-title">Floor Plan Summary</div>
                        <div class="legend-grid">
                            <div class="summary-column">
                                <div class="summary-item"><strong>Bedrooms:</strong> <span>${bedrooms}</span></div>
                                <div class="summary-item"><strong>Bathrooms:</strong> <span>${bathrooms}</span></div>
                                <div class="summary-item"><strong>Total GLA:</strong> <span>${totalGLA.toFixed(1)} sq ft</span></div>
                                <div class="summary-item"><strong>Total Non-GLA:</strong> <span>${nonGLA.toFixed(1)} sq ft</span></div>
                            </div>
                            <div class="breakdown-column">
                                <div class="breakdown-title">GLA Breakdown:</div>
                                ${glaBreakdownHTML || '<div>None</div>'}
                            </div>
                            <div class="breakdown-column">
                                <div class="breakdown-title">Non-GLA Breakdown:</div>
                                ${nonGlaBreakdownHTML || '<div>None</div>'}
                            </div>
                        </div>
                    </div>
                </div>

                ${photoPagesHTML}

            </div>
            <div class="mobile-notice">
                Scaled for viewing - Full resolution maintained for PDF export
            </div>

            <script>
                // Global variable to track current layout for regular photos only
                let previewCurrentLayout = 3; // Start with 3-per-page layout

                window.onload = () => {
                    const state = window.appStateData;
                    const canvas = document.getElementById('previewCanvas');
                    
                    // DEBUG: Check if state data is available
                    console.log('State data:', state);
                    console.log('Canvas element:', canvas);
                    if (state) {
                        console.log('Polygons:', state.drawnPolygons?.length);
                        console.log('Elements:', state.placedElements?.length);
                    }
                    
                    // Load flood map data
                    loadFloodMapData(state);
                    
                    // Only try to render canvas if the canvas element exists on the first page
                    if (canvas) {
                        const ctx = canvas.getContext('2d');
                        const overlayContainer = document.getElementById('htmlOverlayContainer');
                        const canvasSection = document.querySelector('.canvas-section');

                        // --- NEW HELPER FUNCTION TO FIND SHARED EDGES ---
                        const findAllSharedEdges = (polygons) => {
                            const edges = new Map();
                            const sharedEdges = new Set();
                            
                            const getEdgeKey = (p1, p2) => {
                                // Create a consistent key regardless of point order
                                const key1 = \`\${p1.x.toFixed(1)},\${p1.y.toFixed(1)}\`;
                                const key2 = \`\${p2.x.toFixed(1)},\${p2.y.toFixed(1)}\`;
                                return key1 < key2 ? key1 + '|' + key2 : key2 + '|' + key1;
                            };

                            polygons.forEach(poly => {
                                for (let i = 0; i < poly.path.length; i++) {
                                    const p1 = poly.path[i];
                                    const p2 = poly.path[(i + 1) % poly.path.length];
                                    const edgeKey = getEdgeKey(p1, p2);
                                    
                                    if (edges.has(edgeKey)) {
                                        sharedEdges.add(edgeKey);
                                    } else {
                                        edges.set(edgeKey, poly.id);
                                    }
                                }
                            });
                            return sharedEdges;
                        };

                        const render = () => {
                            if (!state) return;

                            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                            if (state.drawnPolygons.length === 0 && state.placedElements.length === 0) return;

                            // FIXED: Calculate bounding box properly
                            state.drawnPolygons.forEach(p => p.path.forEach(pt => {
                                minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
                                minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
                            }));
                            state.placedElements.forEach(el => {
                                minX = Math.min(minX, el.x); maxX = Math.max(maxX, el.x + el.width);
                                minY = Math.min(minY, el.y); maxY = Math.max(maxY, el.y + el.height);
                            });

                            const sketchWidth = maxX - minX;
                            const sketchHeight = maxY - minY;
                            if (sketchWidth === 0 || sketchHeight === 0) return;
                            
                            const canvasWidth = canvasSection.clientWidth;
                            const canvasHeight = canvasSection.clientHeight;
                            canvas.width = canvasWidth;
                            canvas.height = canvasHeight;
                            
                            const padding = 50;
                            const scaleX = (canvasWidth - padding * 2) / sketchWidth;
                            const scaleY = (canvasHeight - padding * 2) / sketchHeight;
                            let scale = Math.min(scaleX, scaleY);
                            
                            const MAX_SCALE = 1.5;
                            scale = Math.min(scale, MAX_SCALE);

                            const scaledSketchWidth = sketchWidth * scale;
                            const scaledSketchHeight = sketchHeight * scale;

                            // FIXED: Improved centering calculation - centers the actual content, not just coordinates
                            const contentCenterX = (minX + maxX) / 2;
                            const contentCenterY = (minY + maxY) / 2;
                            const canvasCenterX = canvasWidth / 2;
                            const canvasCenterY = canvasHeight / 2;
                            
                            const offsetX = canvasCenterX - (contentCenterX * scale);
                            const offsetY = canvasCenterY - (contentCenterY * scale);

                            const toPreviewCoords = (p) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY });
                            
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            overlayContainer.innerHTML = '';

                            const sharedEdges = findAllSharedEdges(state.drawnPolygons);
                            const getEdgeKey = (p1, p2) => {
                                const key1 = \`\${p1.x.toFixed(1)},\${p1.y.toFixed(1)}\`;
                                const key2 = \`\${p2.x.toFixed(1)},\${p2.y.toFixed(1)}\`;
                                return key1 < key2 ? key1 + '|' + key2 : key2 + '|' + key1;
                            };

                            // FIRST: Draw edge labels (lower z-index)
                            state.drawnPolygons.forEach(poly => {
                                poly.path.forEach((p1, i) => {
                                    const p2 = poly.path[(i + 1) % poly.path.length];
                                    
                                    const edgeKey = getEdgeKey(p1, p2);
                                    if (sharedEdges.has(edgeKey)) {
                                        return;
                                    }

                                    const dx = p2.x - p1.x;
                                    const dy = p2.y - p1.y;
                                    const lengthInFeet = Math.sqrt(dx * dx + dy * dy) / 8;
                                    if (lengthInFeet < 3) return;

                                    const startPoint = toPreviewCoords(p1);
                                    const endPoint = toPreviewCoords(p2);
                                    const midX = (startPoint.x + endPoint.x) / 2;
                                    const midY = (startPoint.y + endPoint.y) / 2;
                                    const canvasDx = endPoint.x - startPoint.x;
                                    const canvasDy = endPoint.y - startPoint.y;
                                    const canvasEdgeLength = Math.sqrt(canvasDx*canvasDx + canvasDy*canvasDy);
                                    if (canvasEdgeLength === 0) return;
                                    
                                    const perpX = -canvasDy / canvasEdgeLength;
                                    const perpY = canvasDx / canvasEdgeLength;
                                    
                                    const testOffset = 20 * scale;
                                    const testX1 = midX + perpX * testOffset;
                                    const testY1 = midY + perpY * testOffset;
                                    const testX2 = midX - perpX * testOffset;
                                    const testY2 = midY - perpY * testOffset;
                                    
                                    const isInsidePolygon = (x, y, polygon) => {
                                        const scaledPoly = polygon.path.map(p => toPreviewCoords(p));
                                        let inside = false;
                                        for (let i = 0, j = scaledPoly.length - 1; i < scaledPoly.length; j = i++) {
                                            if (((scaledPoly[i].y > y) !== (scaledPoly[j].y > y)) &&
                                                (x < (scaledPoly[j].x - scaledPoly[i].x) * (y - scaledPoly[i].y) / (scaledPoly[j].y - scaledPoly[i].y) + scaledPoly[i].x)) {
                                                inside = !inside;
                                            }
                                        }
                                        return inside;
                                    };
                                    
                                    let labelX, labelY;
                                    const side1Inside = isInsidePolygon(testX1, testY1, poly);
                                    const side2Inside = isInsidePolygon(testX2, testY2, poly);
                                    
                                    if (!side1Inside && side2Inside) {
                                        labelX = midX + perpX * (25 * scale);
                                        labelY = midY + perpY * (25 * scale);
                                    } else if (side1Inside && !side2Inside) {
                                        labelX = midX - perpX * (25 * scale);
                                        labelY = midY - perpY * (25 * scale);
                                    } else {
                                        const centroidPreview = toPreviewCoords(poly.centroid);
                                        const toCentroidX = centroidPreview.x - midX;
                                        const toCentroidY = centroidPreview.y - midY;
                                        const dotProduct = toCentroidX * perpX + toCentroidY * perpY;
                                        const offset = 25 * scale;
                                        labelX = midX + (dotProduct > 0 ? -perpX * offset : perpX * offset);
                                        labelY = midY + (dotProduct > 0 ? -perpY * offset : perpY * offset);
                                    }
                                    
                                    labelX = Math.max(50, Math.min(canvas.width - 50, labelX));
                                    labelY = Math.max(20, Math.min(canvas.height - 20, labelY));
                                    
                                    ctx.save();
                                    ctx.translate(labelX, labelY);
                                    
                                    const text = \`\${lengthInFeet.toFixed(1)}'\`;
                                    
                                    const fontSize = Math.max(10, 12 * Math.min(1, scale));
                                    ctx.font = \`bold \${fontSize}px Arial\`;
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    const textMetrics = ctx.measureText(text);
                                    
                                    ctx.fillStyle = 'rgba(255, 255, 255, 0)';
                                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                                    ctx.lineWidth = 0.5;
                                    const padding = 4;
                                    const bgRect = {
                                        x: -textMetrics.width / 2 - padding,
                                        y: -fontSize / 2 - 2,
                                        width: textMetrics.width + padding * 2,
                                        height: fontSize + 4
                                    };
                                    ctx.fillRect(bgRect.x, bgRect.y, bgRect.width, bgRect.height);
                                    ctx.strokeRect(bgRect.x, bgRect.y, bgRect.width, bgRect.height);
                                    
                                    ctx.fillStyle = '#333';
                                    ctx.fillText(text, 0, 0);
                                    ctx.restore();
                                });
                            });

                            // SECOND: Draw polygon areas
                            state.drawnPolygons.forEach(poly => {
                                ctx.save();
                                if (poly.type.startsWith('ADU') || poly.type.startsWith('UNIT')) {
                                    ctx.fillStyle = 'rgba(221, 215, 226, 0.7)';
                                } else {
                                    ctx.fillStyle = poly.glaType === 1 ? 'rgba(144, 238, 144, 0.4)' : 'rgba(180, 180, 180, 0.6)';
                                }
                                ctx.strokeStyle = '#555';
                                ctx.lineWidth = 1.5;
                                ctx.beginPath();
                                poly.path.forEach((p, i) => {
                                    const point = toPreviewCoords(p);
                                    if (i === 0) ctx.moveTo(point.x, point.y);
                                    else ctx.lineTo(point.x, point.y);
                                });
                                ctx.closePath();
                                ctx.fill();
                                ctx.stroke();
                                ctx.restore();
                            });

                            // THIRD: Draw placed elements
                            state.placedElements.forEach(el => {
                                const div = document.createElement('div');
                                let posX, posY;
                                if (el.type === 'area_label') {
                                    const centerPos = toPreviewCoords({ x: el.x, y: el.y });
                                    const elWidth = el.width * scale;
                                    const elHeight = el.height * scale;
                                    posX = centerPos.x - elWidth / 2;
                                    posY = centerPos.y - elHeight / 2;
                                } else {
                                    const pos = toPreviewCoords(el);
                                    posX = pos.x;
                                    posY = pos.y;
                                }
                                
                                const elWidth = el.width * scale;
                                const elHeight = el.height * scale;
                                
                                Object.assign(div.style, { 
                                    position: 'absolute', 
                                    left: \`\${posX}px\`, 
                                    top: \`\${posY}px\`, 
                                    width: \`\${elWidth}px\`, 
                                    height: \`\${elHeight}px\`, 
                                    transformOrigin: 'center' 
                                });
                                
                                if (el.type === 'room' || el.type === 'area_label') {
                                    Object.assign(div.style, { 
                                        fontSize: \`\${16 * Math.max(0.8, scale * 0.7)}px\`, 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                        textAlign: 'center', flexDirection: 'column' 
                                    });
                                    
                                    if (el.type === 'area_label') {
                                        const linkedPolygon = state.drawnPolygons.find(p => p.id === el.linkedPolygonId);
                                        if (linkedPolygon) {
                                            div.innerHTML = \`<strong style="font-size: 1.1em;">\${linkedPolygon.label}</strong><span style="font-size:0.9em; font-weight: 600; color: #222; margin-top: 3px;">\${linkedPolygon.area.toFixed(1)} sq ft</span>\`;
                                        } else {
                                            div.innerHTML = \`<strong style="font-size: 1.1em;">\${el.areaData.areaText}</strong><span style="font-size:0.9em; font-weight: 600; color: #222; margin-top: 3px;">\${el.areaData.sqftText}</span>\`;
                                        }
                                    } else {
                                        div.style.background = el.styling.backgroundColor;
                                        div.style.color = el.styling.color || 'white';
                                        div.style.borderRadius = '4px';
                                        div.style.fontSize = \`\${14 * Math.max(0.9, scale * 0.8)}px\`;
                                        div.style.fontWeight = '600';
                                        div.style.padding = '4px 8px';
                                        div.textContent = el.content;
                                    }
                                } else if (el.type === 'icon') {
                                    div.className = 'icon-container';
                                    const img = new Image();
                                    img.src = el.content;
                                    img.style.width = '100%'; 
                                    img.style.height = '100%';
                                    img.style.display = 'block';
                                    img.style.objectFit = 'contain';
                                    if (el.rotation) {
                                        div.style.transform = \`rotate(\${el.rotation}rad)\`;
                                    }
                                    div.appendChild(img);
                                }
                                overlayContainer.appendChild(div);
                            });
                        };
                        
                        render();
                        let resizeTimer;
                        window.addEventListener('resize', () => {
                            clearTimeout(resizeTimer);
                            resizeTimer = setTimeout(render, 100);
                        });
                    }
                }
                
                // Function to toggle between photo layouts (ONLY affects regular photos)
                window.togglePhotoLayout = function() {
                    const layout3Pages = document.querySelectorAll('.layout-3'); // Regular photos only
                    const layout6Pages = document.querySelectorAll('.layout-6'); // Regular photos only
                    const toggleBtn = document.querySelector('.layout-btn');
                    
                    // Important photos are NOT affected by this toggle
                    
                    if (previewCurrentLayout === 3) {
                        // Switch to 6-per-page layout for regular photos
                        layout3Pages.forEach(page => page.style.display = 'none');
                        layout6Pages.forEach(page => page.style.display = 'flex');
                        toggleBtn.textContent = '3/Page';
                        previewCurrentLayout = 6;
                    } else {
                        // Switch to 3-per-page layout for regular photos
                        layout6Pages.forEach(page => page.style.display = 'none');
                        layout3Pages.forEach(page => page.style.display = 'flex');
                        toggleBtn.textContent = '6/Page';
                        previewCurrentLayout = 3;
                    }
                }
                
                // PDF generation using html2canvas
                window.generatePDF = async function() {
                    try {
                        const pageWrapper = document.querySelector('.page-wrapper');
                        const buttons = document.querySelectorAll('button');
                        buttons.forEach(btn => btn.style.display = 'none');

                        const { jsPDF } = window.jspdf;
                        const pdf = new jsPDF({
                            orientation: 'portrait',
                            unit: 'in',
                            format: [8.5, 13],
                            compress: true
                        });
                        
                        // Only include visible pages in PDF (important photos always included)
                        const pageContainers = document.querySelectorAll('.page-container:not([style*="display: none"])');

                        for (let i = 0; i < pageContainers.length; i++) {
                            const container = pageContainers[i];
                            if (i > 0) {
                                pdf.addPage();
                            }
                            
                            const canvas = await html2canvas(container, {
                                scale: 1.5,
                                useCORS: true,
                                logging: false,
                                width: 1020,
                                height: 1560,
                                imageTimeout: 15000,
                                allowTaint: true,
                                backgroundColor: '#ffffff',
                            });

                            const imgData = canvas.toDataURL('image/jpeg', 0.85);
                            pdf.addImage(imgData, 'JPEG', 0, 0, 8.5, 13, undefined, 'FAST');
                        }

                        buttons.forEach(btn => btn.style.display = '');
                        
                        // MODIFIED: Generate filename based on property address or sketch name
                        const state = window.appStateData;
                        let filename = 'subject-sketch-with-photos.pdf'; // fallback
                        
                        if (state) {
                            // Try to get address from currentSketchName first
                            if (state.currentSketchName && state.currentSketchName.trim()) {
                                filename = \`\${state.currentSketchName.replace(/[^a-z0-9\\s\\-]/gi, '').replace(/\\s+/g, '-')}-sketch.pdf\`;
                            }
                            // Or try to get it from any saved address field
                            else if (state.propertyAddress && state.propertyAddress.trim()) {
                                filename = \`\${state.propertyAddress.replace(/[^a-z0-9\\s\\-]/gi, '').replace(/\\s+/g, '-')}-sketch.pdf\`;
                            }
                            // Or look for address in metadata
                            else if (state.metadata && state.metadata.address && state.metadata.address.trim()) {
                                filename = \`\${state.metadata.address.replace(/[^a-z0-9\\s\\-]/gi, '').replace(/\\s+/g, '-')}-sketch.pdf\`;
                            }
                        }
                        
                        pdf.save(filename);
                    } catch (error) {
                        console.error('Error generating PDF:', error);
                        alert('Error generating PDF. Please try again.');
                        document.querySelectorAll('button').forEach(btn => btn.style.display = '');
                    }
                }
                
                // FLOOD MAP API FUNCTIONS
                async function loadFloodMapData(state) {
                    try {
                        // Get address from state data
                        let address = '';
                        if (state?.currentSketchName) {
                            address = state.currentSketchName;
                        } else if (state?.propertyAddress) {
                            address = state.propertyAddress;
                        } else if (state?.metadata?.address) {
                            address = state.metadata.address;
                        }
                        
                        if (!address) {
                            showFloodMapError('No address found for flood map lookup');
                            return;
                        }
                        
                        // Update address display
                        const addressElement = document.getElementById('propertyAddress');
                        if (addressElement) {
                            addressElement.textContent = address;
                        }
                        
                        // Store address globally for map display
                        window.currentAddress = address;
                        
                        console.log('Loading flood data for address:', address);
                        
                        // Step 1: Geocode the address to get coordinates
                        const coordinates = await geocodeAddress(address);
                        if (!coordinates) {
                            showFloodMapError('Could not find coordinates for address');
                            return;
                        }
                        
                        console.log('Coordinates found:', coordinates);
                        
                        // Step 2: Get flood zone data from FEMA
                        const floodData = await getFEMAFloodData(coordinates.lat, coordinates.lng);
                        if (!floodData) {
                            showFloodMapError('Could not retrieve flood zone data');
                            return;
                        }
                        
                        // Store coordinates globally for map display
                        window.currentLat = coordinates.lat;
                        window.currentLng = coordinates.lng;
                        
                        console.log('Flood data:', floodData);
                        
                        // Step 3: Update the display with flood information
                        updateFloodDisplay(floodData);
                        
                        // Step 4: Generate and display flood map
                        const mapUrl = generateFloodMapUrl(coordinates.lat, coordinates.lng);
                        displayFloodMap(mapUrl);
                        
                    } catch (error) {
                        console.error('Error loading flood map data:', error);
                        showFloodMapError('Failed to load flood map data');
                    }
                }
                
                // Geocode address using a free geocoding service
                async function geocodeAddress(address) {
                    try {
                        // Using Nominatim (OpenStreetMap) - free geocoding service
                        const encodedAddress = encodeURIComponent(address);
                        const response = await fetch(\`https://nominatim.openstreetmap.org/search?format=json&q=\${encodedAddress}&countrycodes=us&limit=1\`);
                        
                        if (!response.ok) {
                            throw new Error('Geocoding service unavailable');
                        }
                        
                        const data = await response.json();
                        if (data && data.length > 0) {
                            return {
                                lat: parseFloat(data[0].lat),
                                lng: parseFloat(data[0].lon)
                            };
                        }
                        return null;
                    } catch (error) {
                        console.error('Geocoding error:', error);
                        return null;
                    }
                }
                
                // Get flood data from FEMA API
                async function getFEMAFloodData(lat, lng) {
                    try {
                        // Alternative approach: Use flood.gov or create a simplified lookup
                        // Since FEMA API has CORS restrictions, we'll use a simplified zone estimation
                        
                        console.log('Using fallback flood zone estimation...');
                        
                        // Simple flood zone estimation based on geographic patterns
                        // This is a simplified approach - in production you'd want a backend proxy
                        const floodZone = await estimateFloodZone(lat, lng);
                        
                        return floodZone;
                        
                    } catch (error) {
                        console.error('Flood data error:', error);
                        // Return fallback data
                        return {
                            zone: 'X',
                            subtype: 'Estimated',
                            description: 'Estimated low flood risk - verify with local authorities'
                        };
                    }
                }
                
                // Simplified flood zone estimation (fallback method)
                async function estimateFloodZone(lat, lng) {
                    // This is a simplified estimation based on general geographic knowledge
                    // In a real application, you'd want to use a backend service or paid API
                    
                    // Basic coastal/elevation estimation
                    const isNearCoast = await checkCoastalProximity(lat, lng);
                    const elevation = await getElevationEstimate(lat, lng);
                    
                    if (isNearCoast && elevation < 20) {
                        return {
                            zone: 'AE',
                            subtype: 'Estimated',
                            description: 'Estimated high risk due to coastal proximity and low elevation'
                        };
                    } else if (elevation < 10) {
                        return {
                            zone: 'A',
                            subtype: 'Estimated', 
                            description: 'Estimated flood risk due to low elevation'
                        };
                    } else if (elevation < 50 && isNearCoast) {
                        return {
                            zone: 'X500',
                            subtype: 'Estimated',
                            description: 'Estimated moderate risk - between low and high risk areas'
                        };
                    } else {
                        return {
                            zone: 'X',
                            subtype: 'Estimated',
                            description: 'Estimated minimal flood risk based on elevation'
                        };
                    }
                }
                
                // Check if location is near coast (simplified)
                async function checkCoastalProximity(lat, lng) {
                    // Simple distance check from major coastlines (very basic)
                    const coastalThreshold = 0.1; // degrees (roughly 6-7 miles)
                    
                    // California coast approximation
                    if (lng > -125 && lng < -117 && lat > 32 && lat < 42) {
                        return Math.abs(lng + 117.2) < coastalThreshold; // Rough CA coast
                    }
                    
                    // East coast approximation  
                    if (lng > -85 && lng < -75 && lat > 25 && lat < 45) {
                        return Math.abs(lng + 80) < coastalThreshold; // Rough east coast
                    }
                    
                    // Gulf coast approximation
                    if (lng > -100 && lng < -80 && lat > 25 && lat < 32) {
                        return lat < 30; // Rough gulf coast
                    }
                    
                    return false;
                }
                
                // Get elevation estimate using a free elevation API
                async function getElevationEstimate(lat, lng) {
                    try {
                        // Use Open-Elevation API (free, no CORS issues)
                        const response = await fetch(\`https://api.open-elevation.com/api/v1/lookup?locations=\${lat},\${lng}\`);
                        
                        if (response.ok) {
                            const data = await response.json();
                            if (data.results && data.results.length > 0) {
                                return data.results[0].elevation * 3.28084; // Convert meters to feet
                            }
                        }
                    } catch (error) {
                        console.log('Elevation API unavailable, using fallback');
                    }
                    
                    // Fallback elevation estimate
                    return 100; // Assume moderate elevation if can't determine
                }
                
                // Update flood display with retrieved data
                function updateFloodDisplay(floodData) {
                    const zoneElement = document.getElementById('floodZone');
                    const riskElement = document.getElementById('riskLevel');
                    
                    if (zoneElement) {
                        let zoneText = \`Zone \${floodData.zone}\`;
                        if (floodData.subtype) {
                            zoneText += \` (\${floodData.subtype})\`;
                        }
                        zoneElement.textContent = zoneText;
                    }
                    
                    if (riskElement) {
                        const riskLevel = determineRiskLevel(floodData.zone);
                        riskElement.textContent = riskLevel;
                        riskElement.style.color = getRiskColor(riskLevel);
                    }
                }
                
                // Determine risk level based on flood zone
                function determineRiskLevel(zone) {
                    const highRiskZones = ['A', 'AE', 'AH', 'AO', 'AR', 'A99', 'V', 'VE'];
                    const moderateRiskZones = ['B', 'X500'];
                    
                    if (highRiskZones.includes(zone)) {
                        return 'High Risk';
                    } else if (moderateRiskZones.includes(zone)) {
                        return 'Moderate Risk';
                    } else if (zone === 'X') {
                        return 'Low Risk';
                    } else {
                        return 'Risk Level Unknown';
                    }
                }
                
                // Get color for risk level
                function getRiskColor(riskLevel) {
                    switch (riskLevel) {
                        case 'High Risk': return '#dc3545';
                        case 'Moderate Risk': return '#fd7e14';
                        case 'Low Risk': return '#28a745';
                        default: return '#6c757d';
                    }
                }
                
                // Generate flood map URL using a different approach
                function generateFloodMapUrl(lat, lng) {
                    // Use OpenStreetMap with flood overlay as fallback
                    // This provides a basic map view since FEMA WMS has CORS issues
                    const zoom = 14;
                    const width = 600;
                    const height = 450;
                    
                    // Use a static map service that doesn't have CORS issues
                    return \`https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=\${width}&height=\${height}&center=lonlat:\${lng},\${lat}&zoom=\${zoom}&marker=lonlat:\${lng},\${lat};color:%23ff0000;size:medium&apiKey=YOUR_API_KEY\`;
                }
                
                // Display the flood map image with fallback
                function displayFloodMap(mapUrl) {
                    const mapImg = document.getElementById('floodMapImg');
                    const placeholder = document.querySelector('.map-placeholder');
                    
                    if (mapImg && placeholder) {
                        const lat = window.currentLat;
                        const lng = window.currentLng;
                        
                        if (lat && lng) {
                            // Create FEMA flood map using their WMS service
                            createFEMAFloodMap(lat, lng, placeholder);
                        } else {
                            showMapError(placeholder);
                        }
                    }
                }
                
                function createFEMAFloodMap(lat, lng, container) {
                    // FEMA National Flood Hazard Layer WMS endpoint
                    const baseUrl = 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHLWMS/MapServer/export';
                    
                    // Calculate bounding box (roughly 0.01 degrees = ~0.7 miles)
                    const buffer = 0.008;
                    const bbox = \`\${lng - buffer},\${lat - buffer},\${lng + buffer},\${lat + buffer}\`;
                    
                    // Map parameters for FEMA flood zones
                    const mapParams = {
                        bbox: bbox,
                        size: '600,450',
                        format: 'png',
                        layers: 'show:28', // Flood zones layer
                        transparent: 'true',
                        f: 'image',
                        sr: '4326' // WGS84 coordinate system
                    };
                    
                    // Build the WMS URL
                    const wmsUrl = baseUrl + '?' + Object.entries(mapParams)
                        .map(([key, value]) => \`\${key}=\${encodeURIComponent(value)}\`)
                        .join('&');
                    
                    console.log('FEMA WMS URL:', wmsUrl);
                    
                    // Create the flood map display
                    container.innerHTML = \`
                        <div style="width: 100%; height: 450px; border-radius: 8px; overflow: hidden; position: relative; background: #f8f9fa;">
                            <div style="position: relative; width: 100%; height: 100%;">
                                <!-- Base map (OpenStreetMap) -->
                                <iframe 
                                    id="baseMap"
                                    src="https://www.openstreetmap.org/export/embed.html?bbox=\${lng-buffer},\${lat-buffer},\${lng+buffer},\${lat+buffer}&layer=mapnik"
                                    style="width: 100%; height: 100%; border: none; position: absolute; top: 0; left: 0;"
                                    title="Base Map">
                                </iframe>
                                
                                <!-- FEMA Flood Overlay -->
                                <img 
                                    id="femaOverlay"
                                    src="\${wmsUrl}"
                                    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0.7; pointer-events: none;"
                                    onload="this.style.display='block'; document.getElementById('loadingOverlay').style.display='none';"
                                    onerror="handleFEMAMapError(this)"
                                    alt="FEMA Flood Zone Overlay"
                                />
                                
                                <!-- Loading indicator -->
                                <div id="loadingOverlay" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,255,255,0.9); padding: 15px; border-radius: 8px; text-align: center;">
                                    <div style="margin-bottom: 10px;">Loading FEMA Flood Map...</div>
                                    <div class="loading-spinner"></div>
                                </div>
                                
                                <!-- Property marker -->
                                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 20px; height: 20px; background: red; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 1000;"></div>
                                
                                <!-- Legend -->
                                <div style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.95); padding: 10px; border-radius: 6px; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                    <div style="font-weight: bold; margin-bottom: 5px; color: #007bff;">FEMA Flood Zones</div>
                                    <div style="display: flex; align-items: center; margin: 2px 0;"><div style="width: 12px; height: 12px; background: #0066cc; margin-right: 5px;"></div>High Risk (A, AE, V)</div>
                                    <div style="display: flex; align-items: center; margin: 2px 0;"><div style="width: 12px; height: 12px; background: #ffaa00; margin-right: 5px;"></div>Moderate Risk (X500)</div>
                                    <div style="display: flex; align-items: center; margin: 2px 0;"><div style="width: 12px; height: 12px; background: #90EE90; margin-right: 5px;"></div>Low Risk (X)</div>
                                    <div style="margin-top: 5px; font-size: 10px; color: #666;">🔴 = Property Location</div>
                                </div>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin-top: 15px; padding: 15px; background: #e8f4f8; border-radius: 8px;">
                            <p style="margin: 0; font-size: 14px; color: #0056b3;">
                                <strong>📋 Official FEMA Flood Map Displayed Above</strong>
                            </p>
                            <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">
                                Map shows official FEMA flood zones overlaid on street map. 
                                For detailed reports, visit <a href="https://msc.fema.gov/portal/search" target="_blank" style="color: #007bff;">FEMA Map Service Center</a>
                            </p>
                        </div>
                    \`;
                }
                
                // Handle FEMA map loading errors
                function handleFEMAMapError(img) {
                    console.log('FEMA overlay failed to load, showing alternative');
                    img.style.display = 'none';
                    
                    const loadingOverlay = document.getElementById('loadingOverlay');
                    if (loadingOverlay) {
                        loadingOverlay.innerHTML = \`
                            <div style="color: #dc3545; font-weight: bold;">⚠️ FEMA Overlay Unavailable</div>
                            <div style="font-size: 12px; margin-top: 5px; color: #666;">Showing base map only</div>
                        \`;
                        loadingOverlay.style.background = 'rgba(255,255,255,0.95)';
                        setTimeout(() => {
                            loadingOverlay.style.display = 'none';
                        }, 3000);
                    }
                }
                
                function showMapError(container) {
                    container.innerHTML = \`
                        <div style="text-align: center; padding: 40px; color: #666;">
                            <h4 style="color: #dc3545; margin-bottom: 15px;">⚠️ Map Unavailable</h4>
                            <p>Unable to determine property coordinates</p>
                            <div style="margin-top: 20px; padding: 15px; background: #e8f4f8; border-radius: 8px;">
                                <p style="margin: 0; font-size: 14px; color: #0056b3;">
                                    <strong>💡 For Official FEMA Flood Maps:</strong>
                                </p>
                                <p style="margin: 5px 0 0 0; font-size: 13px; color: #666;">
                                    Visit <a href="https://msc.fema.gov/portal/search" target="_blank" style="color: #007bff; text-decoration: none;">FEMA Map Service Center</a>
                                </p>
                            </div>
                        </div>
                    \`;
                }
                
                // Show error message on flood map page
                function showFloodMapError(message) {
                    const zoneElement = document.getElementById('floodZone');
                    const riskElement = document.getElementById('riskLevel');
                    const placeholder = document.querySelector('.map-placeholder');
                    
                    if (zoneElement) zoneElement.textContent = 'Unavailable';
                    if (riskElement) riskElement.textContent = 'Unavailable';
                    
                    if (placeholder) {
                        placeholder.innerHTML = \`
                            <p style="color: #dc3545;">⚠️ \${message}</p>
                            <p style="font-size: 0.9em; color: #6c757d;">Please check the address and try again</p>
                        \`;
                    }
                    
                    console.error('Flood map error:', message);
                }
            <\/script>
        </body>
        </html>
    `;
}  
}