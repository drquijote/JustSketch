// src/areaManager.js

// REPLACE this function
// Moves the area properties icon to the dead center of the polygon.
drawAreaEditIcon(ctx, polygon) {
    const iconSize = 24;
    
    // Position the icon at the polygon's centroid (dead center)
    const iconCenterX = polygon.centroid.x;
    const iconCenterY = polygon.centroid.y;
    
    const iconX = iconCenterX - iconSize / 2;
    const iconY = iconCenterY - iconSize / 2;

    this.pencilClickAreas.set(polygon.id, {
        x: iconX, y: iconY,
        width: iconSize, height: iconSize,
        polygon: polygon
    });
    
    const editIcon = AppState.imageCache['public/edit.svg'];
    if (editIcon) {
        ctx.drawImage(editIcon, iconX, iconY, iconSize, iconSize);
    } else {
        // Fallback drawing
        ctx.save();
        ctx.fillStyle = 'rgba(52, 152, 219, 0.8)';
        ctx.beginPath();
        ctx.arc(iconCenterX, iconCenterY, iconSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// REPLACE this function
// This is the main drawing function that now renders the new line icons.
drawCompletedAreas() {
    const { ctx } = AppState;
    if (!ctx || AppState.drawnPolygons.length === 0) return;

    const sharedEdges = this.findAllSharedEdges();
    this.lineIconClickAreas.clear(); // Clear old icon positions

    AppState.drawnPolygons.forEach((poly) => {
        ctx.save();
        
        // Unchanged polygon fill and stroke logic...
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        let fillOpacity = 0.4;
        if (AppState.currentMode === 'edit' && AppState.editSubMode === 'labels') {
            fillOpacity = 0.1;
        }
        if (poly.glaType === 1) { ctx.fillStyle = `rgba(144, 238, 144, ${fillOpacity})`; }
        else if (poly.type === 'ADU') { ctx.fillStyle = `rgba(173, 255, 173, ${fillOpacity + 0.1})`; }
        else if (poly.glaType === 0) { ctx.fillStyle = `rgba(180, 180, 180, ${fillOpacity + 0.2})`; }
        else { ctx.fillStyle = `rgba(220, 220, 220, ${fillOpacity - 0.1})`; }
        
        ctx.beginPath();
        ctx.moveTo(poly.path[0].x, poly.path[0].y);
        for (let i = 1; i < poly.path.length; i++) { ctx.lineTo(poly.path[i].x, poly.path[i].y); }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // --- NEW DRAWING LOGIC ---
        if (this.isEditModeActive) {
            // Draw the main area properties icon in the center
            this.drawAreaEditIcon(ctx, poly);

            const editIcon = AppState.imageCache['public/edit.svg'];
            const deleteIcon = AppState.imageCache['public/delete.svg'];
            const iconSize = 20;

            for (let i = 0; i < poly.path.length; i++) {
                const p1 = poly.path[i];
                const p2 = poly.path[(i + 1) % poly.path.length];
                
                // --- Highlight the active line ---
                if (this.activeLineEdit && this.activeLineEdit.polygon.id === poly.id && this.activeLineEdit.edgeStartIndex === i) {
                    ctx.save();
                    ctx.strokeStyle = 'rgba(52, 152, 219, 0.9)'; // Bright blue for active
                    ctx.lineWidth = 6;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                    ctx.restore();
                }

                // Calculate 1/3 and 2/3 points on the line
                const editPointX = p1.x + (p2.x - p1.x) / 3;
                const editPointY = p1.y + (p2.y - p1.y) / 3;
                const deletePointX = p1.x + (p2.x - p1.x) * 2 / 3;
                const deletePointY = p1.y + (p2.y - p1.y) * 2 / 3;

                // Draw Edit Icon at 1/3 point
                if (editIcon) {
                    ctx.drawImage(editIcon, editPointX - iconSize/2, editPointY - iconSize/2, iconSize, iconSize);
                }
                
                // Draw Delete Icon at 2/3 point
                if (deleteIcon) {
                    ctx.drawImage(deleteIcon, deletePointX - iconSize/2, deletePointY - iconSize/2, iconSize, iconSize);
                }
                
                // Store click areas for both icons
                const editKey = `edit-${poly.id}-${i}`;
                const deleteKey = `delete-${poly.id}-${i}`;
                const edgeInfo = { polygon: poly, edgeStartIndex: i, edgeEndIndex: (i + 1) % poly.path.length };
                
                this.lineIconClickAreas.set(editKey, {
                    x: editPointX - iconSize / 2, y: editPointY - iconSize / 2,
                    width: iconSize, height: iconSize, action: 'edit', edgeInfo: edgeInfo
                });
                this.lineIconClickAreas.set(deleteKey, {
                    x: deletePointX - iconSize / 2, y: deletePointY - iconSize / 2,
                    width: iconSize, height: iconSize, action: 'delete', edgeInfo: edgeInfo
                });
            }
        }
        
        // Draw external wall length labels (unchanged)
        for (let i = 0; i < poly.path.length; i++) {
            const p1 = poly.path[i];
            const p2 = poly.path[(i + 1) % poly.path.length];
            const edgeKey = this.getEdgeKey(poly.id, i, (i + 1) % poly.path.length);
            if (!sharedEdges.has(edgeKey)) {
                this.drawExternalLabel(ctx, p1, p2, poly.centroid);
            }
        }
        
        ctx.restore();
    });
}