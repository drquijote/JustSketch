// src/modules/Persistence/ExportManager.js - NEW MODULAR VERSION

import { AppState } from '../../core/AppState.js';
import { EventBus } from '../../core/EventBus.js';

/**
 * Handles preview generation and export functionality
 * This is a complete rewrite that doesn't depend on old files
 */
export class ExportManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        console.log('ExportManager: Initialized (modular version)');
    }

    /**
     * Initialize the ExportManager
     */
    init() {
        this.setupEventListeners();
        console.log('ExportManager: Initialized');
    }

    /**
     * Set up event listeners for export-related UI elements
     */
    setupEventListeners() {
        // Preview button handler
        const previewBtn = this.findPreviewButton();
        if (previewBtn) {
            previewBtn.addEventListener('click', () => this.showPreview());
        }

        // Export dropdown handlers
        this.setupExportDropdown();

        // Listen for export events from other modules
        this.eventBus.on('export:preview', () => this.showPreview());
        this.eventBus.on('export:json', () => this.exportJSON());
        this.eventBus.on('export:svg', () => this.exportSVG());
        this.eventBus.on('export:png', () => this.exportPNG());
        this.eventBus.on('export:pdf', () => this.exportPDF());

        console.log('ExportManager: Event listeners set up');
    }

    /**
     * Find the preview button in the UI
     */
    findPreviewButton() {
        // Look for preview button in finish buttons
        const finishButtons = document.querySelectorAll('.control-btn.finish-btn');
        for (const btn of finishButtons) {
            if (btn.textContent.trim().toLowerCase() === 'preview') {
                return btn;
            }
        }
        return null;
    }

    /**
     * Set up export dropdown functionality
     */
    setupExportDropdown() {
        const exportBtn = document.querySelector('.export-dropdown > button');
        const exportMenu = document.getElementById('exportMenu');

        if (exportBtn && exportMenu) {
            exportBtn.addEventListener('click', () => {
                exportMenu.classList.toggle('hidden');
            });

            // Handle export menu clicks
            exportMenu.addEventListener('click', (e) => {
                const option = e.target.textContent.trim();
                
                switch (option) {
                    case 'JSON Data':
                        this.exportJSON();
                        break;
                    case 'SVG Vector':
                        this.exportSVG();
                        break;
                    case 'PNG':
                        this.exportPNG();
                        break;
                    case 'PDF':
                        this.exportPDF();
                        break;
                    case 'LaTeX/TikZ':
                        this.exportLaTeX();
                        break;
                }
                
                exportMenu.classList.add('hidden');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
                    exportMenu.classList.add('hidden');
                }
            });
        }
    }

    /**
     * Show the preview window
     */
    showPreview() {
        console.log('ExportManager: Showing preview');
        
        const state = AppState.getState();
        const previewWindow = window.open('', 'FloorplanPreview', 'width=1200,height=850,scrollbars=yes,resizable=yes');
        
        if (!previewWindow) {
            alert('Please allow pop-ups for this site to view the preview.');
            return;
        }

        // Pass state data to preview window
        previewWindow.appStateData = this.createPreviewData(state);
        
        const previewHTML = this.generatePreviewHTML(state);

        previewWindow.document.open();
        previewWindow.document.write(previewHTML);
        previewWindow.document.close();

        // Emit preview shown event
        this.eventBus.emit('export:previewShown');
    }

    /**
     * Create preview data from current state
     */
    createPreviewData(state) {
        return {
            drawnPolygons: state.drawnPolygons || [],
            placedElements: state.placedElements || [],
            viewportTransform: state.viewportTransform || { x: 0, y: 0, scale: 1 }
        };
    }

    /**
     * Generate HTML for preview window
     */
    generatePreviewHTML(state) {
        const summaryData = this.calculateSummaryData(state);
        
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Sketch Preview</title>
            <style>
                html, body { 
                    height: 100%; 
                    margin: 0; 
                    padding: 0; 
                    overflow: hidden; 
                    background: #e8e8e8; 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                }
                .page-container { 
                    display: flex; 
                    flex-direction: column; 
                    height: 100%; 
                    padding: 20px; 
                    box-sizing: border-box; 
                }
                .canvas-section { 
                    flex: 1; 
                    min-height: 0; 
                    position: relative; 
                    background: white; 
                    border-radius: 8px 8px 0 0; 
                    box-shadow: 0 0 10px rgba(0,0,0,0.1); 
                    overflow: hidden; 
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
                    padding: 15px 20px; 
                    border-radius: 0 0 8px 8px; 
                    box-shadow: 0 5px 10px rgba(0,0,0,0.1); 
                    border-top: 1px solid #dee2e6; 
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
                            <div class="summary-item"><strong>Bedrooms:</strong> <span>${summaryData.bedrooms}</span></div>
                            <div class="summary-item"><strong>Bathrooms:</strong> <span>${summaryData.bathrooms}</span></div>
                            <div class="summary-item"><strong>Total GLA:</strong> <span>${summaryData.totalGLA.toFixed(1)} sq ft</span></div>
                            <div class="summary-item"><strong>Total Non-GLA:</strong> <span>${summaryData.nonGLA.toFixed(1)} sq ft</span></div>
                        </div>
                        <div class="breakdown-column">
                            <div class="breakdown-title">GLA Breakdown:</div>
                            ${summaryData.glaBreakdownHTML || '<div>None</div>'}
                        </div>
                        <div class="breakdown-column">
                            <div class="breakdown-title">Non-GLA Breakdown:</div>
                            ${summaryData.nonGlaBreakdownHTML || '<div>None</div>'}
                        </div>
                    </div>
                </div>
            </div>

            <script>
                ${this.generatePreviewScript()}
            </script>
        </body>
        </html>
        `;
    }

    /**
     * Calculate summary data for preview
     */
    calculateSummaryData(state) {
        let totalGLA = 0;
        let nonGLA = 0;
        let glaBreakdownHTML = '';
        let nonGlaBreakdownHTML = '';

        // Calculate polygon areas
        (state.drawnPolygons || []).forEach(p => {
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

        // Count bedrooms and bathrooms
        let bedrooms = 0;
        let bathrooms = 0;
        
        (state.placedElements || []).forEach(el => {
            if (el.type === 'room') {
                const label = el.content.toLowerCase();
                if (label.includes('bedroom')) {
                    bedrooms++;
                } else if (label.includes('1/2 bath')) {
                    bathrooms += 0.5;
                } else if (label.includes('bath')) {
                    bathrooms++;
                }
            }
        });

        return {
            totalGLA,
            nonGLA,
            bedrooms,
            bathrooms,
            glaBreakdownHTML,
            nonGlaBreakdownHTML
        };
    }

    /**
     * Generate JavaScript for preview window
     */
    generatePreviewScript() {
        return `
            window.onload = () => {
                const state = window.appStateData;
                const canvas = document.getElementById('previewCanvas');
                const ctx = canvas.getContext('2d');
                const overlayContainer = document.getElementById('htmlOverlayContainer');
                const canvasSection = document.querySelector('.canvas-section');

                // Find all shared edges helper function
                const findAllSharedEdges = (polygons) => {
                    const edges = new Map();
                    const sharedEdges = new Set();
                    
                    const getEdgeKey = (p1, p2) => {
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
                    if (!state || !state.drawnPolygons) return;

                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    
                    if (state.drawnPolygons.length === 0 && state.placedElements.length === 0) return;

                    // Calculate bounds
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

                    // Identify shared edges
                    const sharedEdges = findAllSharedEdges(state.drawnPolygons);
                    const getEdgeKey = (p1, p2) => {
                        const key1 = \`\${p1.x.toFixed(1)},\${p1.y.toFixed(1)}\`;
                        const key2 = \`\${p2.x.toFixed(1)},\${p2.y.toFixed(1)}\`;
                        return key1 < key2 ? key1 + '|' + key2 : key2 + '|' + key1;
                    };

                    // Draw polygons
                    state.drawnPolygons.forEach(poly => {
                        ctx.save();
                        
                        // Set fill color based on type
                        if (poly.type && (poly.type.startsWith('ADU') || poly.type.startsWith('UNIT'))) {
                            ctx.fillStyle = 'rgba(221, 215, 226, 0.7)';
                        } else {
                            ctx.fillStyle = poly.glaType === 1 ? 'rgba(144, 238, 144, 0.4)' : 'rgba(180, 180, 180, 0.6)';
                        }
                        
                        ctx.strokeStyle = '#555';
                        ctx.lineWidth = 1.5;
                        
                        // Draw polygon
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

                        // Draw edge labels (skip shared edges)
                        poly.path.forEach((p1, i) => {
                            const p2 = poly.path[(i + 1) % poly.path.length];
                            const edgeKey = getEdgeKey(p1, p2);
                            
                            if (sharedEdges.has(edgeKey)) return;

                            const dx = p2.x - p1.x;
                            const dy = p2.y - p1.y;
                            const lengthInFeet = Math.sqrt(dx * dx + dy * dy) / 8;
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
                            
                            let angle = Math.atan2(canvasDy, canvasDx);
                            if (angle < -Math.PI / 2 || angle > Math.PI / 2) {
                                angle += Math.PI;
                            }
                            ctx.rotate(angle);
                            
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

                    // Draw placed elements
                    state.placedElements.forEach(el => {
                        const div = document.createElement('div');
                        const pos = toPreviewCoords(el);
                        const elWidth = el.width * scale;
                        const elHeight = el.height * scale;
                        
                        Object.assign(div.style, { 
                            position: 'absolute', 
                            left: \`\${pos.x}px\`, 
                            top: \`\${pos.y}px\`, 
                            width: \`\${elWidth}px\`, 
                            height: \`\${elHeight}px\`, 
                            transformOrigin: 'top left' 
                        });
                        
                        if (el.type === 'room' || el.type === 'area_label') {
                            Object.assign(div.style, { 
                                fontSize: \`\${12 * Math.max(0.6, scale * 0.5)}px\`, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                textAlign: 'center', 
                                flexDirection: 'column' 
                            });
                            
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
            };
        `;
    }

    /**
     * Export current sketch as JSON
     */
    exportJSON() {
        console.log('ExportManager: Exporting as JSON');
        
        const state = AppState.getState();
        const exportData = {
            version: '1.0',
            createdAt: new Date().toISOString(),
            name: state.currentSketchName || 'Floor Plan',
            data: this.createExportSnapshot(state)
        };

        this.downloadFile(
            JSON.stringify(exportData, null, 2),
            `${state.currentSketchName || 'floor-plan'}-${Date.now()}.json`,
            'application/json'
        );

        this.eventBus.emit('export:completed', { type: 'JSON' });
    }

    /**
     * Export current sketch as SVG
     */
    exportSVG() {
        console.log('ExportManager: Exporting as SVG');
        
        const state = AppState.getState();
        const svg = this.generateSVG(state);
        
        this.downloadFile(
            svg,
            `${state.currentSketchName || 'floor-plan'}-${Date.now()}.svg`,
            'image/svg+xml'
        );

        this.eventBus.emit('export:completed', { type: 'SVG' });
    }

    /**
     * Export current sketch as PNG
     */
    exportPNG() {
        console.log('ExportManager: Exporting as PNG');
        
        const canvas = this.createExportCanvas();
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const state = AppState.getState();
            
            a.href = url;
            a.download = `${state.currentSketchName || 'floor-plan'}-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.eventBus.emit('export:completed', { type: 'PNG' });
        });
    }

    /**
     * Export current sketch as PDF
     */
    exportPDF() {
        console.log('ExportManager: PDF export not yet implemented');
        alert('PDF export will be implemented in a future update.');
    }

    /**
     * Export current sketch as LaTeX/TikZ
     */
    exportLaTeX() {
        console.log('ExportManager: LaTeX export not yet implemented');
        alert('LaTeX/TikZ export will be implemented in a future update.');
    }

    /**
     * Create an export snapshot of the current state
     */
    createExportSnapshot(state) {
        return {
            drawnPolygons: state.drawnPolygons || [],
            placedElements: state.placedElements || [],
            viewportTransform: state.viewportTransform || { x: 0, y: 0, scale: 1 }
        };
    }

    /**
     * Generate SVG content from current state
     */
    generateSVG(state) {
        const bounds = this.calculateBounds(state);
        const width = bounds.width + 100; // Add padding
        const height = bounds.height + 100;
        
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
        
        // Add background
        svg += `<rect width="100%" height="100%" fill="white"/>`;
        
        // Draw polygons
        (state.drawnPolygons || []).forEach(poly => {
            const pathData = poly.path.map((p, i) => 
                `${i === 0 ? 'M' : 'L'} ${p.x - bounds.minX + 50} ${p.y - bounds.minY + 50}`
            ).join(' ') + ' Z';
            
            const fillColor = poly.glaType === 1 ? 'rgba(144, 238, 144, 0.4)' : 'rgba(180, 180, 180, 0.6)';
            
            svg += `<path d="${pathData}" fill="${fillColor}" stroke="#555" stroke-width="1.5"/>`;
        });
        
        svg += '</svg>';
        return svg;
    }

    /**
     * Create a canvas for export
     */
    createExportCanvas() {
        const state = AppState.getState();
        const bounds = this.calculateBounds(state);
        
        const canvas = document.createElement('canvas');
        canvas.width = bounds.width + 100;
        canvas.height = bounds.height + 100;
        
        const ctx = canvas.getContext('2d');
        
        // Fill white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw polygons
        (state.drawnPolygons || []).forEach(poly => {
            ctx.save();
            
            ctx.fillStyle = poly.glaType === 1 ? 'rgba(144, 238, 144, 0.4)' : 'rgba(180, 180, 180, 0.6)';
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1.5;
            
            ctx.beginPath();
            poly.path.forEach((p, i) => {
                const x = p.x - bounds.minX + 50;
                const y = p.y - bounds.minY + 50;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            ctx.restore();
        });
        
        return canvas;
    }

    /**
     * Calculate bounds of all drawn elements
     */
    calculateBounds(state) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        // Check polygons
        (state.drawnPolygons || []).forEach(p => {
            p.path.forEach(pt => {
                minX = Math.min(minX, pt.x);
                maxX = Math.max(maxX, pt.x);
                minY = Math.min(minY, pt.y);
                maxY = Math.max(maxY, pt.y);
            });
        });
        
        // Check placed elements
        (state.placedElements || []).forEach(el => {
            minX = Math.min(minX, el.x);
            maxX = Math.max(maxX, el.x + el.width);
            minY = Math.min(minY, el.y);
            maxY = Math.max(maxY, el.y + el.height);
        });
        
        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Helper to download a file
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}