// src/modules/UI/PaletteManager.js - Manages bottom palette visibility and interactions

import { AppState } from '../../core/AppState.js';
import { eventBus } from '../../core/EventBus.js';

export class PaletteManager {
    constructor() {
        this.activePaletteId = null;
        this.lastVisiblePalette = null;
        this.paletteButtons = [];
        this.palettes = [];
        
        console.log('PaletteManager: Initialized');
    }

    init() {
        this.setupPaletteElements();
        this.setupEventListeners();
        // CHANGED: Show the 'rooms' palette by default instead of the drawing palette.
        // This prevents the 'Numbers' button from being active on load.
        this.showPalette('roomsPalette');
        
        console.log('PaletteManager: Setup complete');
    }

    setupPaletteElements() {
        // Get all palette buttons
        this.paletteButtons = Array.from(document.querySelectorAll('[data-palette]'));
        
        // Get all palette containers
        this.palettes = [
            { id: 'drawPalette', element: document.getElementById('drawPalette') },
            { id: 'roomsPalette', element: document.getElementById('roomsPalette') },
            { id: 'iconsPalette', element: document.getElementById('iconsPalette') },
            { id: 'photosPalette', element: document.getElementById('photosPalette') }
        ].filter(p => p.element); // Only include existing elements

        console.log('PaletteManager: Found', this.paletteButtons.length, 'palette buttons and', this.palettes.length, 'palettes');
    }

    setupEventListeners() {
        // Set up palette button clicks
        this.paletteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const paletteId = e.target.closest('[data-palette]').getAttribute('data-palette');
                this.handlePaletteButtonClick(button, paletteId);
            });
        });

        // Listen for mode changes
        eventBus.on('mode:changed', (e) => this.handleModeChange(e.detail));

        // Listen for external palette requests
        eventBus.on('palette:show', (e) => this.showPalette(e.detail.paletteId));

        eventBus.on('palette:hide', () => this.hideAllPalettes());

        eventBus.on('palette:restore', () => this.restoreLastPalette());
    }

    handlePaletteButtonClick(button, paletteId) {
        const isCurrentlyActive = button.classList.contains('active');
        
        if (isCurrentlyActive) {
            // Clicking active button hides the palette
            this.hideAllPalettes();
            this.clearActiveButtons();
        } else {
            // Show the requested palette
            this.showPalette(paletteId);
            this.setActiveButton(button);
            
            // Emit mode change if needed
            if (paletteId === 'photosPalette') {
                eventBus.emit('mode:request', { mode: 'photos' });
            } 
            // REMOVED: The conflicting request to enter drawing mode.
            // else if (paletteId === 'drawPalette') {
            //      eventBus.emit('mode:request', { mode: 'drawing' });
            // }
            else {
                eventBus.emit('mode:request', { mode: 'placement' });
            }
        }
    }

    showPalette(paletteId) {
        if (!paletteId) return;

        // Hide all palettes first
        this.hideAllPalettes();
        
        // Show the requested palette
        const palette = this.palettes.find(p => p.id === paletteId);
        if (palette && palette.element) {
            palette.element.classList.remove('hidden');
            this.activePaletteId = paletteId;
            this.lastVisiblePalette = paletteId;
            
            console.log('PaletteManager: Showing palette:', paletteId);
        }

        // Update button states
        this.updateButtonStates(paletteId);
    }

    hideAllPalettes() {
        this.palettes.forEach(palette => {
            if (palette.element) {
                palette.element.classList.add('hidden');
            }
        });
        this.activePaletteId = null;
    }

    hidePalette(paletteId) {
        const palette = this.palettes.find(p => p.id === paletteId);
        if (palette && palette.element) {
            palette.element.classList.add('hidden');
            if (this.activePaletteId === paletteId) {
                this.activePaletteId = null;
            }
        }
    }

    updateButtonStates(activePaletteId) {
        this.clearActiveButtons();
        
        // Set active button
        const activeButton = this.paletteButtons.find(btn => 
            btn.getAttribute('data-palette') === activePaletteId
        );
        
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }

    setActiveButton(button) {
        this.clearActiveButtons();
        button.classList.add('active');
    }

    clearActiveButtons() {
        this.paletteButtons.forEach(btn => btn.classList.remove('active'));
    }

    handleModeChange(data) {
        const { mode } = data;

        switch (mode) {
            case 'drawing':
                this.showPalette('drawPalette');
                break;
                
            case 'edit':
                this.hideAllPalettes();
                this.clearActiveButtons();
                break;
                
            case 'photos':
                this.showPalette('photosPalette');
                break;
                
            case 'placement':
                if (!this.activePaletteId) {
                    this.restoreLastPalette();
                }
                break;
        }
    }

    restoreLastPalette() {
        if (this.lastVisiblePalette && this.lastVisiblePalette !== 'drawPalette') {
            this.showPalette(this.lastVisiblePalette);
        } else {
            this.showPalette('roomsPalette');
        }
    }

    // Public API methods
    getActivePalette() {
        return this.activePaletteId;
    }

    isPaletteVisible(paletteId) {
        const palette = this.palettes.find(p => p.id === paletteId);
        return palette && palette.element && !palette.element.classList.contains('hidden');
    }

    togglePalette(paletteId) {
        if (this.isPaletteVisible(paletteId)) {
            this.hidePalette(paletteId);
        } else {
            this.showPalette(paletteId);
        }
    }

    saveCurrentState() {
        this.lastVisiblePalette = this.activePaletteId;
    }

    temporaryHide() {
        this.saveCurrentState();
        this.hideAllPalettes();
    }

    restoreFromTemporaryHide() {
        if (this.lastVisiblePalette) {
            this.showPalette(this.lastVisiblePalette);
        }
    }
}