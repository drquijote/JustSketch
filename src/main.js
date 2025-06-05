// src/main.js

import './style.css'; // Your main stylesheet

// Import palette management functions
// Assuming paletteManager.js is now in the 'core' directory as per your previous main.js
import { ShowPallet, toggleAngle } from './core/paletteManager.js';

// Import the new closed polygon system initializer
import { initClosedPolygonSystem } from './core/closed-polygon.js';

// Expose functions to the global scope so they can be called
// from inline onclick="" attributes in index.html, if still needed.
// For a pure Vite app, you might move these to event listeners set up in JS.
window.ShowPallet = ShowPallet;
window.toggleAngle = toggleAngle;
// Note: Functions from closed-polygon.js like startNewDrawing, drawLine, etc.,
// are already exposed to `window` within closed-polygon.js itself.

// Wait for the DOM to be fully loaded before running app logic
document.addEventListener('DOMContentLoaded', () => {
    console.log("Vite App DOM Loaded. Initializing features...");

    // Initialize the new closed polygon drawing system
    // This will set up the canvas, event listeners, etc., from closed-polygon.js
    initClosedPolygonSystem('drawingCanvas'); // Pass the ID of your canvas element

    // Set the initial palette to be visible (from your existing main.js logic)
    // Ensure ShowPallet is correctly defined and paletteManager.js is loaded.
    if (typeof window.ShowPallet === 'function') {
        window.ShowPallet('NumbersP'); // Or your desired default palette
    } else {
        console.warn("ShowPallet function not found. Ensure paletteManager.js is correctly imported and initialized if needed.");
    }

    // Any other initializations can go here
    // For example, if you have other UI components or modules to initialize:
    // initOtherFeature();
});
