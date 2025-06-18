// src/previewManager.js - Fixed with properly centered area labels

import { AppState } from './state.js';

/**
 * Manages the creation of a high-quality preview of the entire sketch in a new window.
 * Updated to use 120 DPI resolution for custom size paper (8.5" x 13")
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
    
    // --- Return the complete HTML document ---
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Sketch Preview - Custom Size</title>
            <!-- Include jsPDF library -->
            <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
            <!-- Include html2canvas library -->
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
            <style>
                html, body { 
                    height: 100%; 
                    margin: 0; 
                    padding: 0; 
                    overflow: auto; /* Changed from hidden to auto */
                    background: #e8e8e8; 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                }
                
                /* Wrapper to center the legal-sized container */
                .page-wrapper {
                    min-height: 100%;
                    display: flex;
                    justify-content: center;
                    align-items: flex-start;
                    padding: 20px;
                    box-sizing: border-box;
                }
                
                .page-container { 
                    width: 1020px;
                    height: 1560px;
                    display: flex; 
                    flex-direction: column; 
                    background: white;
                    box-shadow: 0 0 20px rgba(0,0,0,0.3);
                    overflow: hidden;
                    /* Enforce aspect ratio */
                    aspect-ratio: 8.5 / 13;
                    transform-origin: top center;
                }
                
                /* Mobile responsive scaling */
                @media (max-width: 1060px) {
                    .page-wrapper {
                        padding: 10px;
                    }
                    .page-container {
                        /* Scale down to fit viewport width with some padding */
                        transform: scale(calc((100vw - 40px) / 1020px));
                        /* Adjust wrapper height to accommodate scaled content */
                        margin-bottom: calc(1560px * (1 - (100vw - 40px) / 1020px) * -1);
                    }
                }
                
                /* For very small screens, add extra scaling */
                @media (max-width: 480px) {
                    .page-wrapper {
                        padding: 5px;
                    }
                    .page-container {
                        transform: scale(calc((100vw - 20px) / 1020px));
                        margin-bottom: calc(1560px * (1 - (100vw - 20px) / 1020px) * -1);
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
                .print-btn { 
                    position: fixed; 
                    top: 15px; 
                    right: 20px; 
                    padding: 10px 18px; 
                    background: #007bff; 
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
                
                .pdf-btn:hover, .print-btn:hover {
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
                
                /* Mobile notice */
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
                    .print-btn, .pdf-btn {
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
                    body { 
                        background: white; 
                    }
                    .print-btn { 
                        display: none; 
                    } 
                    .page-container { 
                        height: 13in;
                        width: 8.5in;
                        max-width: 8.5in;
                        max-height: 13in;
                        padding: 0.25in; /* 1/4 inch margins for print */
                    }
                    .canvas-section, .legend-section { 
                        box-shadow: none; 
                        border-radius: 0; 
                        border: 1px solid #ccc; 
                    }
                    .legend-section { 
                        page-break-before: avoid; /* Keep legend with canvas if possible */
                    }
                }
            </style>
        </head>
        <body>
            <div class="page-wrapper">
                <div class="page-container">
                    <button class="pdf-btn" onclick="generatePDF()">PDF</button>
                    <button class="print-btn" onclick="window.print()">Print</button>
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
            </div>
            <div class="mobile-notice">
                Scaled for viewing - Full resolution maintained for PDF export
            </div>

            <script>
                window.onload = () => {
                    const state = window.appStateData;
                    const canvas = document.getElementById('previewCanvas');
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
                        
                        // Add maximum scale limit to prevent small floor plans from being too zoomed in
                        const MAX_SCALE = 1.5; // This means 1 foot = max 12 pixels (8 * 1.5)
                        scale = Math.min(scale, MAX_SCALE);

                        const scaledSketchWidth = sketchWidth * scale;
                        const scaledSketchHeight = sketchHeight * scale;

                        const offsetX = (canvasWidth - scaledSketchWidth) / 2 - (minX * scale);
                        const offsetY = (canvasHeight - scaledSketchHeight) / 2 - (minY * scale);

                        const toPreviewCoords = (p) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY });
                        
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        overlayContainer.innerHTML = '';

                        // --- NEW: Identify shared edges before drawing ---
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
                                
                                // --- Check if the edge is shared and skip it if it is ---
                                const edgeKey = getEdgeKey(p1, p2);
                                if (sharedEdges.has(edgeKey)) {
                                    return; // This is an interior wall, so skip drawing the label.
                                }

                                const dx = p2.x - p1.x;
                                const dy = p2.y - p1.y;
                                const lengthInFeet = Math.sqrt(dx * dx + dy * dy) / 8;
                                if (lengthInFeet < 3) return; // Only show labels for edges 3+ feet

                                const startPoint = toPreviewCoords(p1);
                                const endPoint = toPreviewCoords(p2);
                                const midX = (startPoint.x + endPoint.x) / 2;
                                const midY = (startPoint.y + endPoint.y) / 2;
                                const canvasDx = endPoint.x - startPoint.x;
                                const canvasDy = endPoint.y - startPoint.y;
                                const canvasEdgeLength = Math.sqrt(canvasDx*canvasDx + canvasDy*canvasDy);
                                if (canvasEdgeLength === 0) return;
                                
                                // IMPROVED: Better algorithm to position labels outside polygons
                                // Calculate perpendicular direction
                                const perpX = -canvasDy / canvasEdgeLength;
                                const perpY = canvasDx / canvasEdgeLength;
                                
                                // Test both sides of the edge to find which is outside the polygon
                                const testOffset = 20 * scale;
                                const testX1 = midX + perpX * testOffset;
                                const testY1 = midY + perpY * testOffset;
                                const testX2 = midX - perpX * testOffset;
                                const testY2 = midY - perpY * testOffset;
                                
                                // Simple point-in-polygon test for the current polygon
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
                                
                                // Choose the side that's outside the polygon
                                let labelX, labelY;
                                const side1Inside = isInsidePolygon(testX1, testY1, poly);
                                const side2Inside = isInsidePolygon(testX2, testY2, poly);
                                
                                if (!side1Inside && side2Inside) {
                                    // Use side 1 (positive perpendicular)
                                    labelX = midX + perpX * (25 * scale);
                                    labelY = midY + perpY * (25 * scale);
                                } else if (side1Inside && !side2Inside) {
                                    // Use side 2 (negative perpendicular)
                                    labelX = midX - perpX * (25 * scale);
                                    labelY = midY - perpY * (25 * scale);
                                } else {
                                    // Fallback: use centroid-based positioning but with smaller offset
                                    const centroidPreview = toPreviewCoords(poly.centroid);
                                    const toCentroidX = centroidPreview.x - midX;
                                    const toCentroidY = centroidPreview.y - midY;
                                    const dotProduct = toCentroidX * perpX + toCentroidY * perpY;
                                    const offset = 25 * scale;
                                    labelX = midX + (dotProduct > 0 ? -perpX * offset : perpX * offset);
                                    labelY = midY + (dotProduct > 0 ? -perpY * offset : perpY * offset);
                                }
                                
                                // Ensure label stays within canvas bounds
                                labelX = Math.max(50, Math.min(canvas.width - 50, labelX));
                                labelY = Math.max(20, Math.min(canvas.height - 20, labelY));
                                
                                ctx.save();
                                ctx.translate(labelX, labelY);
                                
                                // No rotation - keep all text perfectly horizontal
                                // ctx.rotate(0); // No rotation applied
                                
                                const text = \`\${lengthInFeet.toFixed(1)}'\`;
                                
                                // Consistent, readable font size
                                const fontSize = Math.max(10, 12 * Math.min(1, scale));
                                ctx.font = \`bold \${fontSize}px Arial\`;
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                const textMetrics = ctx.measureText(text);
                                
                                // Clean white background with subtle border
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
                                
                                // Draw text
                                ctx.fillStyle = '#333';
                                ctx.fillText(text, 0, 0);
                                ctx.restore();
                            });
                        });

                        // SECOND: Draw polygon areas (higher z-index, on top of labels)
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

                        state.placedElements.forEach(el => {
                            const div = document.createElement('div');
                            
                            // FIX: Handle area_label centering differently
                            let posX, posY;
                            if (el.type === 'area_label') {
                                // For area labels, x and y represent the center position
                                const centerPos = toPreviewCoords({ x: el.x, y: el.y });
                                const elWidth = el.width * scale;
                                const elHeight = el.height * scale;
                                posX = centerPos.x - elWidth / 2;
                                posY = centerPos.y - elHeight / 2;
                            } else {
                                // For other elements, use top-left positioning
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
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    textAlign: 'center', 
                                    flexDirection: 'column' 
                                });
                                
                                if (el.type === 'area_label') {
                                    // Update area label with current polygon data
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
                                const img = new Image();
                                img.src = el.content;
                                img.style.width = '100%'; 
                                img.style.height = '100%';
                                if (el.rotation) img.style.transform = \`rotate(\${el.rotation}rad)\`;
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
                
                // PDF generation using html2canvas
                window.generatePDF = async function() {
                    try {
                        const pageContainer = document.querySelector('.page-container');
                        
                        // Hide buttons temporarily
                        const buttons = document.querySelectorAll('button');
                        buttons.forEach(btn => btn.style.display = 'none');
                        
                        // Generate canvas from HTML with optimized settings
                        const canvas = await html2canvas(pageContainer, {
                            scale: 1.5, // Reduced from 2 to 1.5 for smaller file size
                            useCORS: true,
                            logging: false,
                            width: 1020,
                            height: 1560,
                            imageTimeout: 0,
                            allowTaint: true,
                            backgroundColor: '#ffffff'
                        });
                        
                        // Show buttons again
                        buttons.forEach(btn => btn.style.display = '');
                        
                        // Convert canvas to JPEG for better compression
                        const imgData = canvas.toDataURL('image/jpeg', 0.8); // 80% quality JPEG
                        
                        // Create PDF with compression
                        const { jsPDF } = window.jspdf;
                        const pdf = new jsPDF({
                            orientation: 'portrait',
                            unit: 'in',
                            format: [8.5, 13],
                            compress: true // Enable PDF compression
                        });
                        
                        // Add image with compression
                        pdf.addImage(imgData, 'JPEG', 0, 0, 8.5, 13, undefined, 'FAST');
                        
                        // Download PDF
                        pdf.save('subject-sketch.pdf');
                    } catch (error) {
                        console.error('Error generating PDF:', error);
                        alert('Error generating PDF. Please try again.');
                    }
                }
            <\/script>
        </body>
        </html>
    `;
}
}