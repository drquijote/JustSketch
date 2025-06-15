// src/modules/UI/ModalManager.js - Centralized modal dialog management

import { AppState } from '../../core/AppState.js';
import { eventBus } from '../../core/EventBus.js';

export class ModalManager {
    constructor() {
        this.activeModal = null;
        this.modals = new Map();
        this.modalHistory = [];
        
        console.log('ModalManager: Initialized');
    }

    init() {
        this.setupModals();
        this.setupEventListeners();
        
        console.log('ModalManager: Setup complete');
    }

    setupModals() {
        // Register all available modals
        this.registerModal('polygon', {
            element: document.getElementById('polygonModal'),
            inputs: {
                name: document.getElementById('polygonName'),
                type: document.getElementById('polygonType'),
                glaCheckbox: document.getElementById('includeInGLA')
            },
            buttons: {
                save: 'btn-primary',
                cancel: 'btn-secondary',
                delete: 'btn-delete'
            }
        });

        this.registerModal('save', {
            element: document.getElementById('saveModal'),
            inputs: {
                name: document.getElementById('sketchNameInput')
            },
            buttons: {
                save: 'confirmSaveBtn',
                cancel: 'cancelSaveBtn'
            }
        });

        this.registerModal('lineEdit', {
            element: document.getElementById('lineEditModal'),
            inputs: {
                length: document.getElementById('newLength'),
                curved: document.getElementById('makeCurved')
            },
            buttons: {
                save: 'btn-primary',
                cancel: 'btn-secondary',
                delete: 'btn-secondary'
            }
        });

        console.log('ModalManager: Registered', this.modals.size, 'modals');
    }

    registerModal(name, config) {
        if (config.element) {
            this.modals.set(name, config);
        }
    }

    setupEventListeners() {
        // Global escape key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModal) {
                this.hideModal();
            }
        });

        // Click outside modal to close
        document.addEventListener('click', (e) => {
            if (this.activeModal && e.target.classList.contains('modal')) {
                this.hideModal();
            }
        });

        // Listen for modal requests
        eventBus.on('modal:show', (e) => {
            this.showModal(e.detail.modalName, e.detail.config);
        });

        eventBus.on('modal:hide', () => {
            this.hideModal();
        });
    }

    showModal(modalName, config = {}) {
        const modal = this.modals.get(modalName);
        if (!modal || !modal.element) {
            console.error('ModalManager: Modal not found:', modalName);
            return false;
        }

        // Hide any currently active modal
        if (this.activeModal) {
            this.hideModal();
        }

        // Configure modal before showing
        this.configureModal(modal, config);

        // Show the modal
        modal.element.classList.remove('hidden');
        this.activeModal = { name: modalName, modal };
        this.modalHistory.push(modalName);

        // Focus first input if available
        this.focusFirstInput(modal);

        console.log('ModalManager: Showing modal:', modalName);
        return true;
    }

    configureModal(modal, config) {
        // Set title if provided
        if (config.title) {
            const titleElement = modal.element.querySelector('h3');
            if (titleElement) {
                titleElement.textContent = config.title;
            }
        }

        // Set input values
        if (config.inputs && modal.inputs) {
            Object.keys(config.inputs).forEach(inputName => {
                const input = modal.inputs[inputName];
                const value = config.inputs[inputName];
                
                if (input && value !== undefined) {
                    if (input.type === 'checkbox') {
                        input.checked = Boolean(value);
                    } else {
                        input.value = value;
                    }
                }
            });
        }

        // Setup button handlers
        if (config.handlers && modal.buttons) {
            this.setupModalButtons(modal, config.handlers);
        }

        // Setup dynamic behaviors
        if (config.onTypeChange && modal.inputs.type) {
            modal.inputs.type.onchange = config.onTypeChange;
        }
    }

    setupModalButtons(modal, handlers) {
        const buttons = modal.element.querySelectorAll('button');
        
        buttons.forEach(button => {
            // Remove existing handlers
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            // Add new handlers
            if (button.classList.contains('btn-primary') && handlers.save) {
                newButton.onclick = handlers.save;
            } else if (button.classList.contains('btn-secondary') && handlers.cancel) {
                newButton.onclick = handlers.cancel;
            } else if (button.classList.contains('btn-delete') && handlers.delete) {
                newButton.onclick = handlers.delete;
            } else if (button.id && handlers[button.id]) {
                newButton.onclick = handlers[button.id];
            }
        });
    }

    hideModal() {
        if (!this.activeModal) return;

        const modal = this.activeModal.modal;
        modal.element.classList.add('hidden');

        console.log('ModalManager: Hiding modal:', this.activeModal.name);
        
        const modalName = this.activeModal.name;
        this.activeModal = null;
        
        // Emit hide event
        eventBus.emit('modal:hidden', { modalName });
    }

    focusFirstInput(modal) {
        const firstInput = modal.element.querySelector('input:not([type="hidden"]), select, textarea');
        if (firstInput) {
            setTimeout(() => {
                firstInput.focus();
                if (firstInput.type === 'text') {
                    firstInput.select();
                }
            }, 100);
        }
    }

    // Specific modal helpers
    showPolygonModal(config = {}) {
        const modalConfig = {
            title: config.title || 'Label Polygon',
            inputs: {
                name: config.name || '',
                type: config.type || 'living'
            },
            handlers: {
                save: config.onSave || (() => this.hideModal()),
                cancel: config.onCancel || (() => this.hideModal()),
                delete: config.onDelete || null
            },
            onTypeChange: config.onTypeChange || null
        };

        return this.showModal('polygon', modalConfig);
    }

    showSaveModal(config = {}) {
        const modalConfig = {
            title: config.title || 'Save Sketch',
            inputs: {
                name: config.name || ''
            },
            handlers: {
                save: config.onSave || (() => this.hideModal()),
                cancel: config.onCancel || (() => this.hideModal())
            }
        };

        return this.showModal('save', modalConfig);
    }

    showLineEditModal(config = {}) {
        const modalConfig = {
            title: config.title || 'Edit Line',
            inputs: {
                length: config.length || '',
                curved: config.curved || false
            },
            handlers: {
                save: config.onSave || (() => this.hideModal()),
                cancel: config.onCancel || (() => this.hideModal()),
                delete: config.onDelete || null
            }
        };

        return this.showModal('lineEdit', modalConfig);
    }

    // Public API methods
    isModalActive(modalName = null) {
        if (modalName) {
            return this.activeModal?.name === modalName;
        }
        return this.activeModal !== null;
    }

    getActiveModal() {
        return this.activeModal?.name || null;
    }

    getModalInputValue(modalName, inputName) {
        const modal = this.modals.get(modalName);
        if (!modal || !modal.inputs || !modal.inputs[inputName]) {
            return null;
        }

        const input = modal.inputs[inputName];
        if (input.type === 'checkbox') {
            return input.checked;
        }
        return input.value;
    }

    setModalInputValue(modalName, inputName, value) {
        const modal = this.modals.get(modalName);
        if (!modal || !modal.inputs || !modal.inputs[inputName]) {
            return false;
        }

        const input = modal.inputs[inputName];
        if (input.type === 'checkbox') {
            input.checked = Boolean(value);
        } else {
            input.value = value;
        }
        return true;
    }

    // Utility method for mobile-friendly modals
    adaptForMobile() {
        if (!('ontouchstart' in window)) return;

        this.modals.forEach((modal, name) => {
            const element = modal.element;
            if (!element) return;

            // Make modals full-width on mobile
            const content = element.querySelector('.modal-content');
            if (content) {
                content.style.width = '95%';
                content.style.maxWidth = '400px';
            }

            // Ensure inputs are mobile-friendly
            const inputs = element.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                input.style.fontSize = '16px'; // Prevent zoom on iOS
                input.setAttribute('autocomplete', 'off');
                input.setAttribute('autocorrect', 'off');
                input.setAttribute('autocapitalize', 'off');
                input.setAttribute('spellcheck', 'false');
            });
        });
    }
}
