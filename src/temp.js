// This is just the PDF export functionality to add to your existing previewManager.js
// Add this method to your PreviewManager class, keeping all your existing code unchanged

// First, update just the HTML generation to add the PDF button and libraries
// In your existing _generatePreviewHTML method, make these minimal changes:

// 1. Add these two script tags in the <head> section after your existing styles:
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

// 2. Replace your existing print button:
        // REPLACE: <button class="print-btn" onclick="window.print()">Print</button>
        // WITH: <button class="print-btn" onclick="generatePDF()">Export PDF</button>

// 3. Add this PDF generation function in the <script> section before your existing window.onload:
        <script>
            // PDF generation function - single page layout
            async function generatePDF() {
                const button = document.querySelector('.print-btn');
                const originalText = button.textContent;
                button.disabled = true;
                button.textContent = 'Generating PDF...';
                
                try {
                    console.log('Starting PDF generation...');
                    
                    const { jsPDF } = window.jspdf;
                    
                    // Capture the canvas section
                    const canvasSection = document.querySelector('.canvas-section');
                    const canvasImage = await html2canvas(canvasSection, {
                        scale: 2,
                        backgroundColor: '#ffffff',
                        logging: false,
                        allowTaint: true,
                        useCORS: true
                    });
                    
                    // Capture the legend section
                    const legendSection = document.querySelector('.legend-section');
                    const legendImage = await html2canvas(legendSection, {
                        scale: 2,
                        backgroundColor: '#ffffff',
                        logging: false
                    });
                    
                    // Detect best orientation
                    const canvasAspectRatio = canvasImage.width / canvasImage.height;
                    const orientation = canvasAspectRatio > 1.2 ? 'landscape' : 'portrait';
                    
                    const pdf = new jsPDF({
                        orientation: orientation,
                        unit: 'mm',
                        format: 'letter'
                    });
                    
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const margin = 10;
                    
                    const availableWidth = pageWidth - (2 * margin);
                    const availableHeight = pageHeight - (2 * margin);
                    
                    const legendAspectRatio = legendImage.width / legendImage.height;
                    
                    if (orientation === 'landscape') {
                        // Landscape: floor plan left, legend right
                        const floorPlanWidth = availableWidth * 0.65;
                        const legendWidth = availableWidth * 0.33;
                        const gap = availableWidth * 0.02;
                        
                        let fpWidth = floorPlanWidth;
                        let fpHeight = fpWidth / canvasAspectRatio;
                        
                        if (fpHeight > availableHeight) {
                            fpHeight = availableHeight;
                            fpWidth = fpHeight * canvasAspectRatio;
                        }
                        
                        let lgWidth = legendWidth;
                        let lgHeight = lgWidth / legendAspectRatio;
                        
                        if (lgHeight > availableHeight * 0.6) {
                            lgHeight = availableHeight * 0.6;
                            lgWidth = lgHeight * legendAspectRatio;
                        }
                        
                        const fpX = margin;
                        const fpY = margin + (availableHeight - fpHeight) / 2;
                        
                        const lgX = margin + floorPlanWidth + gap;
                        const lgY = margin + (availableHeight - lgHeight) / 2;
                        
                        pdf.addImage(canvasImage.toDataURL('image/png'), 'PNG', fpX, fpY, fpWidth, fpHeight);
                        pdf.addImage(legendImage.toDataURL('image/png'), 'PNG', lgX, lgY, lgWidth, lgHeight);
                        
                    } else {
                        // Portrait: floor plan top, legend bottom
                        const floorPlanHeight = availableHeight * 0.65;
                        const legendHeight = availableHeight * 0.33;
                        const gap = availableHeight * 0.02;
                        
                        let fpHeight = floorPlanHeight;
                        let fpWidth = fpHeight * canvasAspectRatio;
                        
                        if (fpWidth > availableWidth) {
                            fpWidth = availableWidth;
                            fpHeight = fpWidth / canvasAspectRatio;
                        }
                        
                        let lgHeight = legendHeight;
                        let lgWidth = lgHeight * legendAspectRatio;
                        
                        if (lgWidth > availableWidth) {
                            lgWidth = availableWidth;
                            lgHeight = lgWidth / legendAspectRatio;
                        }
                        
                        const fpX = margin + (availableWidth - fpWidth) / 2;
                        const fpY = margin;
                        
                        const lgX = margin + (availableWidth - lgWidth) / 2;
                        const lgY = margin + floorPlanHeight + gap;
                        
                        pdf.addImage(canvasImage.toDataURL('image/png'), 'PNG', fpX, fpY, fpWidth, fpHeight);
                        pdf.addImage(legendImage.toDataURL('image/png'), 'PNG', lgX, lgY, lgWidth, lgHeight);
                    }
                    
                    const timestamp = new Date().toISOString().slice(0, 10);
                    const filename = `floor-plan-${timestamp}.pdf`;
                    
                    pdf.save(filename);
                    console.log('PDF generated successfully:', filename);
                    
                } catch (error) {
                    console.error('Error generating PDF:', error);
                    alert('Error generating PDF: ' + error.message);
                } finally {
                    button.disabled = false;
                    button.textContent = originalText;
                }
            }
            
            // Your existing window.onload code goes here...
        </script>