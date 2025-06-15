// src/modules/UI/ControlsManager.js - Manages top control buttons and their interactions

import { AppState } from '../../core/AppState.js';
import { eventBus } from '../../core/EventBus.js';

export class ControlsManager {
    constructor() {
        this.controls = new Map();
        this.exportMenu = null;
        this.legendVisible = false;
        
        console.log('ControlsManager: Initialized');
    }

    init() {
        this.setupControls();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        
        console.log('ControlsManager: Setup complete');
    }

    setupControls() {
        // Register all control buttons
        this.registerControl('undo', {
            element: document.getElementById('undo'),
            type: 'action'
        });

        this.registerControl('redo', {
            element: document.getElementById('redo'),
            type: 'action'
        });

        this.registerControl('relabel', {
            element: document.getElementById('relabelBtn'),
            type: 'conditional'
        });

        this.registerControl('labelEdit', {
            element: document.getElementById('labelEditBtn'),
            type: 'conditional'
        });

        this.registerControl('labelDelete', {
            element: document.getElementById('labelDeleteBtn'),
            type: 'conditional'
        });

        this.registerControl('legend', {
            element: document.getElementById('legendToggleBtn'),
            type: 'toggle'
        });

        this.registerControl('preview', {
            element: Array.from(document.querySelectorAll('.control-btn.finish-btn')).find(b => b.textContent === 'Preview'),
            type: 'action'
        });

        this.registerControl('import', {
            element: Array.from(document.querySelectorAll('.control-btn.finish-btn')).find(b => b.textContent === 'Import'),
            type: 'action'
        });

        this.registerControl('save', {
            element: document.getElementById('saveBtn'),
            type: 'action'
        });

        // ADDED: Register the new Reset View button
        this.registerControl('resetView', {
            element: document.getElementById('resetViewBtn'),
            type: 'action'
        });

        // Setup export dropdown
        this.setupExportControls();

        console.log('ControlsManager: Registered', this.controls.size, 'controls');
    }

    registerControl(name, config) {
        if (config.element) {
            this.controls.set(name, config);
        }
    }

    setupExportControls() {
        const exportBtn = document.querySelector('.export-dropdown > button');
        this.exportMenu = document.getElementById('exportMenu');
        
        if (exportBtn && this.exportMenu) {
            this.registerControl('export', {
                element: exportBtn,
                type: 'dropdown',
                menu: this.exportMenu
            });
        }
    }

    setupEventListeners() {
        // Undo/Redo
        this.addControlHandler('undo', () => {
            eventBus.emit('action:undo');
        });

        this.addControlHandler('redo', () => {
            eventBus.emit('action:redo');
        });

        // Legend toggle
        this.addControlHandler('legend', () => {
            this.toggleLegend();
        });

        // Preview
        this.addControlHandler('preview', () => {
            eventBus.emit('preview:show');
        });

        // Import
        this.addControlHandler('import', () => {
            eventBus.emit('import:request');
        });

        // Save
        this.addControlHandler('save', () => {
            eventBus.emit('save:request');
        });

        // ADDED: Add an event handler for the new Reset View button
        this.addControlHandler('resetView', () => {
            // This event should be handled by your CanvasManager to reset pan and zoom
            eventBus.emit('view:reset');
            console.log('ControlsManager: Emitted view:reset event.');
        });

        // Export dropdown
        const exportControl = this.controls.get('export');
        if (exportControl) {
            exportControl.element.addEventListener('click', () => {
                this.toggleExportMenu();
            });
        }

        // Export menu options
        if (this.exportMenu) {
            this.exportMenu.addEventListener('click', (e) => {
                this.handleExportOption(e);
            });
        }

        // Conditional buttons (relabel, labelEdit, labelDelete)
        this.addControlHandler('relabel', () => {
            eventBus.emit('area:relabel');
        });

        this.addControlHandler('labelEdit', () => {
            eventBus.emit('label:edit');
        });

        this.addControlHandler('labelDelete', () => {
            eventBus.emit('label:delete');
        });

        // Listen for mode changes to show/hide conditional controls
        eventBus.on('mode:changed', (e) => {
            this.updateControlsVisibility(e.detail);
        });

        // Listen for selection changes
        eventBus.on('selection:changed', (e) => {
            this.updateConditionalControls(e.detail);
        });
    }

    addControlHandler(controlName, handler) {
        const control = this.controls.get(controlName);
        if (control && control.element) {
            control.element.addEventListener('click', (e) => {
                e.preventDefault();
                handler(e);
            });
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts if user is typing in an input
            if (e.target.tagName.toLowerCase() === 'input' || 
                e.target.tagName.toLowerCase() === 'textarea') {
                return;
            }

            const isCtrlOrCmd = e.ctrlKey || e.metaKey;

            if (isCtrlOrCmd) {
                switch (e.key.toLowerCase()) {
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) {
                            eventBus.emit('action:redo');
                        } else {
                            eventBus.emit('action:undo');
                        }
                        break;
                    case 'y':
                        e.preventDefault();
                        eventBus.emit('action:redo');
                        break;
                    case 's':
                        e.preventDefault();
                        eventBus.emit('save:request');
                        break;
                    case 'p':
                        e.preventDefault();
                        eventBus.emit('preview:show');
                        break;
                }
            } else {
                switch (e.key.toLowerCase()) {
                    case 'l':
                        this.toggleLegend();
                        break;
                    case 'escape':
                        this.hideExportMenu();
                        break;
                }
            }
        });
    }

    updateControlsVisibility(modeData) {
        const { mode, subMode } = modeData;

        // Show/hide conditional controls based on mode
        const relabelControl = this.controls.get('relabel');
        const labelEditControl = this.controls.get('labelEdit');
        const labelDeleteControl = this.controls.get('labelDelete');

        if (mode === 'edit' && subMode === 'areas') {
            this.showControl('relabel');
        } else {
            this.hideControl('relabel');
        }

        if (mode === 'edit' && subMode === 'labels') {
            this.showControl('labelEdit');
            this.showControl('labelDelete');
        } else {
            this.hideControl('labelEdit');
            this.hideControl('labelDelete');
        }
    }

    updateConditionalControls(selectionData) {
        // Update controls based on what's selected
        if (selectionData.type === 'area' && selectionData.selected) {
            this.showControl('relabel');
        } else if (selectionData.type === 'label' && selectionData.selected) {
            this.showControl('labelEdit');
            this.showControl('labelDelete');
        }
    }

    showControl(controlName) {
        const control = this.controls.get(controlName);
        if (control && control.element) {
            control.element.classList.remove('hidden');
        }
    }

    hideControl(controlName) {
        const control = this.controls.get(controlName);
        if (control && control.element) {
            control.element.classList.add('hidden');
        }
    }

    toggleLegend() {
        const legend = document.getElementById('summaryLegend');
        if (legend) {
            legend.classList.toggle('hidden');
            this.legendVisible = !legend.classList.contains('hidden');
            
            // Update button state
            const legendBtn = this.controls.get('legend');
            if (legendBtn && legendBtn.element) {
                if (this.legendVisible) {
                    legendBtn.element.classList.add('active');
                } else {
                    legendBtn.element.classList.remove('active');
                }
            }
            
            eventBus.emit('legend:toggled', { visible: this.legendVisible });
        }
    }

    toggleExportMenu() {
        if (this.exportMenu) {
            this.exportMenu.classList.toggle('hidden');
        }
    }

    hideExportMenu() {
        if (this.exportMenu) {
            this.exportMenu.classList.add('hidden');
        }
    }

    handleExportOption(e) {
        const option = e.target;
        if (!option.classList.contains('export-option')) return;

        const optionText = option.textContent.trim();
        
        switch (optionText) {
            case 'New File':
                eventBus.emit('save:saveAs');
                break;
            case 'JSON Data':
                eventBus.emit('export:json');
                break;
            case 'SVG Vector':
                eventBus.emit('export:svg');
                break;
            case 'LaTeX/TikZ':
                eventBus.emit('export:latex');
                break;
            case 'PNG':
                eventBus.emit('export:png');
                break;
            case 'PDF':
                eventBus.emit('export:pdf');
                break;
        }

        this.hideExportMenu();
    }

    // Public API methods
    enableControl(controlName) {
        const control = this.controls.get(controlName);
        if (control && control.element) {
            control.element.disabled = false;
            control.element.classList.remove('disabled');
        }
    }

    disableControl(controlName) {
        const control = this.controls.get(controlName);
        if (control && control.element) {
            control.element.disabled = true;
            control.element.classList.add('disabled');
        }
    }

    setControlActive(controlName, active = true) {
        const control = this.controls.get(controlName);
        if (control && control.element) {
            if (active) {
                control.element.classList.add('active');
            } else {
                control.element.classList.remove('active');
            }
        }
    }

    setControlText(controlName, text) {
        const control = this.controls.get(controlName);
        if (control && control.element) {
            control.element.textContent = text;
        }
    }

    isControlVisible(controlName) {
        const control = this.controls.get(controlName);
        return control && control.element && !control.element.classList.contains('hidden');
    }

    isLegendVisible() {
        return this.legendVisible;
    }

    // Mobile-specific adaptations
    adaptForMobile() {
        if (!('ontouchstart' in window)) return;

        // Make controls larger for touch
        this.controls.forEach((control, name) => {
            if (control.element) {
                control.element.style.minHeight = '44px'; // iOS recommended touch target
                control.element.style.padding = '8px 12px';
            }
        });

        // Hide less important controls on very small screens
        if (window.innerWidth < 480) {
            this.hideControl('import');
            // Consider hiding export dropdown on very small screens
        }
    }

    // Update control states based on app state
    updateFromAppState() {
        // Update undo/redo states
        const hasUndo = AppState.historyIndex > 0;
        const hasRedo = AppState.historyIndex < AppState.actionHistory.length - 1;

        if (hasUndo) {
            this.enableControl('undo');
        } else {
            this.disableControl('undo');
        }

        if (hasRedo) {
            this.enableControl('redo');
        } else {
            this.disableControl('redo');
        }

        // Update save button state if there are unsaved changes
        const hasChanges = AppState.historyIndex > 0;
        if (hasChanges) {
            this.setControlActive('save', true);
        } else {
            this.setControlActive('save', false);
        }
    }
}