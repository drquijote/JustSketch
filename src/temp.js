// In main.js, replace the drawGrid function with this version

/**
 * Draws a grid pattern across the entire canvas.
 * This ensures the visual background matches the canvas's full dimensions.
 */
function drawGrid() {
    const { ctx, canvas } = AppState;
    if (!ctx || !canvas) return;

    const gridSize = 40; // The spacing of the grid lines in pixels

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#dcdcdc'; // A light gray for the grid lines
    ctx.lineWidth = 1;

    // Use the actual canvas dimensions (which are now adaptive)
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Draw vertical lines across the entire canvas width
    for (let x = 0; x <= canvasWidth; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
    }

    // Draw horizontal lines across the entire canvas height
    for (let y = 0; y <= canvasHeight; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
    }

    ctx.stroke();
    ctx.restore();
}