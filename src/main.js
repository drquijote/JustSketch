// src/main.js
import './style.css';
import { showpallets, showangleinput, initCanvas, undo, redo, toggleLegend, toggleEditMode } from './sketch.js';

window.showpallets = showpallets;
window.showangleinput = showangleinput;
window.undo = undo;
window.redo = redo;
window.toggleLegend = toggleLegend;
window.toggleEditMode = toggleEditMode;

document.addEventListener('DOMContentLoaded', () => {
    console.log("App loaded");
    initCanvas();
    const paletteButtons = document.querySelectorAll('[data-palette]');
    paletteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const paletteId = e.target.getAttribute('data-palette');
            showpallets(paletteId);
            paletteButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    document.getElementById('undo').addEventListener('click', undo);
    document.getElementById('redo').addEventListener('click', redo);
    document.getElementById('legendToggleBtn').addEventListener('click', toggleLegend);
    document.getElementById('editBtn').addEventListener('click', toggleEditMode);
});