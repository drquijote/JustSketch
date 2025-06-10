// src/previewManager.js - UPGRADED with new styling

import { AppState } from './state.js';

/**
 * Manages the creation of a high-quality preview of the entire sketch in a new window.
 */
export class PreviewManager {
    constructor() {
        console.log('PreviewManager initialized.');
    }

    /**
     * The main public method to show the preview window.
     */
    showPreview() {
        const stateSnapshot = AppState.getStateSnapshot();

        const previewWindow = window.open('', 'FloorplanPreview', 'width=1200,height=850,scrollbars=yes,resizable=yes');
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
                <title>Sketch Preview</title>
                <style>
                    html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; background: #e8e8e8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                    .page-container { display: flex; flex-direction: column; height: 100%; padding: 20px; box-sizing: border-box; }
                    .canvas-section { flex: 1; min-height: 0; position: relative; background: white; border-radius: 8px 8px 0 0; box-shadow: 0 0 10px rgba(0,0,0,0.1); overflow: hidden; }
                    #previewCanvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
                    
                    /* CHANGE 2: Reduced padding to make legend less tall */
                    .legend-section { flex-shrink: 0; background: #f8f9fa; padding: 15px 20px; border-radius: 0 0 8px 8px; box-shadow: 0 5px 10px rgba(0,0,0,0.1); border-top: 1px solid #dee2e6; }
                    
                    /* CHANGE 1: Made title font smaller and reduced margin */
                    .legend-title { font-size: 1.1em; font-weight: 600; color: #333; margin-bottom: 10px; text-align: center; }

                    .legend-grid { display: flex; justify-content: space-around; align-items: flex-start; }
                    .summary-column, .breakdown-column { padding: 0 15px; }
                    .summary-item { display: flex; justify-content: space-between; padding: 3px 0; font-size: 1em; border-bottom: 1px solid #e9ecef; }
                    .breakdown-title { font-weight: bold; margin-top: 8px; margin-bottom: 4px; color: #555; font-size: 0.9em;}
                    .html-overlay { position: absolute; top: 0; left: 0; pointer-events: none; width: 100%; height: 100%; }
                    .print-btn { position: fixed; top: 15px; right: 20px; padding: 10px 18px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; z-index: 1000; font-size: 1em; }
                    @media print { 
                        body { background: white; }
                        .print-btn { display: none; } 
                        .page-container { height: auto; padding: 0; }
                        .canvas-section, .legend-section { box-shadow: none; border-radius: 0; border: 1px solid #ccc; }
                        .legend-section { page-break-before: always; }
                    }
                </style>
            </head>
            <body>
                <div class="page-container">
                    <button class="print-btn" onclick="window.print()">Print</button>
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

                <script>
                    window.onload = () => {
                        const state = window.appStateData;
                        const canvas = document.getElementById('previewCanvas');
                        const ctx = canvas.getContext('2d');
                        const overlayContainer = document.getElementById('htmlOverlayContainer');
                        const canvasSection = document.querySelector('.canvas-section');

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
                            const scale = Math.min(scaleX, scaleY);

                            const scaledSketchWidth = sketchWidth * scale;
                            const scaledSketchHeight = sketchHeight * scale;

                            const offsetX = (canvasWidth - scaledSketchWidth) / 2 - (minX * scale);
                            const offsetY = (canvasHeight - scaledSketchHeight) / 2 - (minY * scale);

                            const toPreviewCoords = (p) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY });
                            
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            overlayContainer.innerHTML = '';

                            state.drawnPolygons.forEach(poly => {
                                ctx.save();

                                // CHANGE 3: Added new fill color logic for ADUs and UNITs
                                if (poly.type.startsWith('ADU') || poly.type.startsWith('UNIT')) {
                                    ctx.fillStyle = 'rgba(221, 215, 226, 0.7)'; // Light grayish purple
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

                                poly.path.forEach((p1, i) => {
                                    const p2 = poly.path[(i + 1) % poly.path.length];
                                    const dx = p2.x - p1.x;
                                    const dy = p2.y - p1.y;
                                    const lengthInPixels = Math.sqrt(dx * dx + dy * dy);
                                    const PIXELS_PER_FOOT = 8;
                                    const lengthInFeet = lengthInPixels / PIXELS_PER_FOOT;
                                    if (lengthInFeet < 1) return;
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
                                    const centroidPreview = toPreviewCoords(poly.centroid);
                                    const toCentroidX = centroidPreview.x - midX;
                                    const toCentroidY = centroidPreview.y - midY;
                                    const dotProduct = toCentroidX * perpX + toCentroidY * perpY;
                                    const offset = 15;
                                    const labelX = midX + (dotProduct > 0 ? -perpX * offset : perpX * offset);
                                    const labelY = midY + (dotProduct > 0 ? -perpY * offset : perpY * offset);
                                    ctx.save();
                                    ctx.translate(labelX, labelY);
                                    ctx.rotate(Math.atan2(canvasDy, canvasDx));
                                    const text = \`\${lengthInFeet.toFixed(1)}'\`;
                                    ctx.font = \`bold \${Math.max(8, 10 * scale)}px Arial\`;
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    const textMetrics = ctx.measureText(text);
                                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                                    ctx.fillRect(-textMetrics.width / 2 - 3, -8, textMetrics.width + 6, 16);
                                    ctx.fillStyle = '#333';
                                    ctx.fillText(text, 0, 1);
                                    ctx.restore();
                                });
                            });

                            state.placedElements.forEach(el => {
                                const div = document.createElement('div');
                                const pos = toPreviewCoords(el);
                                const elWidth = el.width * scale;
                                const elHeight = el.height * scale;
                                Object.assign(div.style, { position: 'absolute', left: \`\${pos.x}px\`, top: \`\${pos.y}px\`, width: \`\${elWidth}px\`, height: \`\${elHeight}px\`, transformOrigin: 'top left' });
                                if (el.type === 'room' || el.type === 'area_label') {
                                    Object.assign(div.style, { fontSize: \`\${12 * Math.max(0.6, scale * 0.5)}px\`, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flexDirection: 'column' });
                                    if (el.type === 'area_label') {
                                        div.innerHTML = \`<strong>\${el.areaData.areaText}</strong><span style="font-size:0.8em">\${el.areaData.sqftText}</span>\`;
                                    } else {
                                        div.style.background = el.styling.backgroundColor;
                                        div.style.color = el.styling.color || 'white';
                                        div.style.borderRadius = '4px';
                                        div.textContent = el.content;
                                    }
                                } else if (el.type === 'icon') {
                                    const img = new Image();
                                    img.src = el.content;
                                    img.style.width = '100%'; img.style.height = '100%';
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
                <\/script>
            </body>
            </html>
        `;
    }
}