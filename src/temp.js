// In your main.js file

document.addEventListener('DOMContentLoaded', () => {
    // ... other initialization code ...
    
    const canvas = document.getElementById('drawingCanvas');
    CanvasManager.init(canvas);

    // **** ADD THIS LINE ****
    // This connects your new grid function to the drawing process.
    AppState.on('canvas:redraw:background', drawGrid);
    // **** END OF ADDITION ****

    // Initialize all the managers
    new DrawingManager();
    // ... rest of the function ...
});