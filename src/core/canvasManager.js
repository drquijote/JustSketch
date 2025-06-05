// src/core/canvasManager.js

let canvas, ctx;
let scale = 8; // Initial default scale, adjust as needed
let canvasOriginX = 0;
let canvasOriginY = 0;

// Your drawGrid function from polygon.js
function drawGrid() {
    if (!ctx || !canvas) return; // Ensure canvas and context exist

    ctx.strokeStyle = '#ecf0f1'; // Light gray grid lines
    ctx.lineWidth = 1;
    const gridSize = 5 * scale;

    // Calculate starting points to ensure grid is drawn from the correct origin
    // This makes the grid appear to move with panning
    const startX = Math.floor(-canvasOriginX / gridSize) * gridSize + canvasOriginX;
    const startY = Math.floor(-canvasOriginY / gridSize) * gridSize + canvasOriginY;

    // Draw vertical lines
    for (let x = startX; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // Draw horizontal lines
    for (let y = startY; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// A simplified redrawCanvas function for now
// Later, this will draw polygons, labels, etc.
function redrawCanvas() {
    if (!ctx || !canvas) return;

    // Clear the entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the grid
    drawGrid();

    // Placeholder for future drawing:
    // drawPolygons();
    // drawCurrentPath();
    // drawRoomLabels();
    console.log("redrawCanvas called, grid should be drawn.");
}

// Handles resizing of the canvas element
function resizeCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement; // Assumes canvas is in a container
    if (!container) {
        console.error("Canvas container not found for resizing.");
        return;
    }

    // Fit canvas to container size
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Re-center origin if it hasn't been set or if you want to always center
    // For now, let's set a basic origin if it's the first load.
    // You might want more sophisticated origin management later (e.g., for panning)
    if (canvasOriginX === 0 && canvasOriginY === 0 && canvas.width > 0 && canvas.height > 0) {
        canvasOriginX = canvas.width / 2;
        canvasOriginY = canvas.height / 2;
    }
    
    redrawCanvas(); // Redraw everything when canvas size changes
}

// Main initialization function for the canvas
export function initCanvasApp() {
    canvas = document.getElementById('drawingCanvas');
    if (!canvas) {
        console.error('Canvas element with ID "drawingCanvas" not found!');
        return;
    }
    ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2D rendering context from canvas!');
        return;
    }

    // Initial setup
    resizeCanvas(); // Set initial size and draw
    
    // Add event listener for window resize
    window.addEventListener('resize', resizeCanvas);

    console.log('Canvas application initialized.');
}