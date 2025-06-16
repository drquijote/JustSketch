// In src/drawing.js

// REPLACE the existing handleCanvasClick function
handleCanvasClick(e) {
    if (!this.isActive) return;

    // Use the now-corrected central function to get coordinates
    const pos = CanvasManager.screenToCanvas(e.clientX, e.clientY);
    
    // Pass the correct coordinates to the interaction logic
    const wasHandled = this.handleCanvasInteractionWithCoords(e, pos.x, pos.y);
    
    if (wasHandled) {
        e.preventDefault();
        e.stopPropagation();
    }
}

// REPLACE the existing handleCanvasTouch function
handleCanvasTouch(e) {
    if (!this.isActive) return;

    if (e.changedTouches && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];

        // Use the now-corrected central function to get coordinates
        const pos = CanvasManager.screenToCanvas(touch.clientX, touch.clientY);
        
        // Pass the correct coordinates to the interaction logic
        const wasHandled = this.handleCanvasInteractionWithCoords(e, pos.x, pos.y);
        
        if (wasHandled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
}