// src/areaManager.js

// DELETE the old drawAreaEditPencil function and ADD this new one.
// This function now draws the shared edit.svg icon.
drawAreaEditIcon(ctx, polygon) {
    const iconSize = 24; // Use a consistent, touch-friendly size
    
    // Position the icon relative to the area's center (centroid)
    const iconCenterX = polygon.centroid.x + 60;
    const iconCenterY = polygon.centroid.y;
    
    // The top-left corner for drawing the image
    const iconX = iconCenterX - iconSize / 2;
    const iconY = iconCenterY - iconSize / 2;

    // This part is for click detection, the logic remains the same
    this.pencilClickAreas.set(polygon.id, {
        x: iconX,
        y: iconY,
        width: iconSize,
        height: iconSize,
        polygon: polygon
    });
    
    // Get the preloaded edit icon from the shared AppState cache
    const editIcon = AppState.imageCache['public/edit.svg'];

    if (editIcon) {
        // Draw the svg image
        ctx.drawImage(editIcon, iconX, iconY, iconSize, iconSize);
    } else {
        // Provide a simple fallback shape in case the image hasn't loaded
        ctx.save();
        ctx.fillStyle = 'rgba(52, 152, 219, 0.8)'; // Blue fallback
        ctx.beginPath();
        ctx.arc(iconCenterX, iconCenterY, iconSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}