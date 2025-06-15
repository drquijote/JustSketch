// src/modules/ElementPlacement/IconManager.js
import { AppState } from '../../core/AppState.js';
import { CanvasManager } from '../../canvas/CanvasManager.js';

export class IconManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.selectedIcon = null;
        this.editingIcon = null;
        this.originalIconProperties = null;
        this.imageCache = new Map(); // Cache for loaded images
        this.boundUpdateCustomCursor = this.updateCustomCursor.bind(this);
        
        console.log('IconManager: Initialized');
    }

    init() {
        // Listen for mode changes
        this.eventBus.on('mode:changed', (data) => {
            if (data.mode === 'placement') {
                this.activate();
            } else {
                this.deactivate();
            }
        });

        // Listen for icon palette interactions
        this.eventBus.on('palette:iconSelected', (data) => {
            this.selectIcon(data.src, data.alt);
        });

        // Listen for canvas interactions
        this.eventBus.on('canvas:click', (data) => {
            this.handleCanvasClick(data);
        });

        // Listen for edit mode changes
        this.eventBus.on('mode:editToggled', (data) => {
            if (!data.isEditMode) {
                this.hideIconEditControls();
            }
        });

        // Listen for canvas redraws
        this.eventBus.on('canvas:redraw:elements', () => {
            this.drawIcons();
        });

        this.setupIconEditControls();
        console.log('IconManager: Event listeners set up');
    }

    activate() {
        console.log('IconManager: Activated');
        this.setupPaletteListeners();
    }

    deactivate() {
        this.hideCustomCursor();
        this.hideIconEditControls();
        console.log('IconManager: Deactivated');
    }

    setupPaletteListeners() {
        const iconImages = document.querySelectorAll('.icon-palette-item img');
        
        iconImages.forEach(img => {
            // Remove existing listeners first
            img.removeEventListener('click', this.handleIconClick);
            
            // Add new listener
            img.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.selectIcon(img.src, img.alt);
            });
        });
    }

    selectIcon(src, alt) {
        this.selectedIcon = { src, alt };
        this.showCustomCursor(src, alt);
        
        // Hide the current palette
        const visiblePalette = document.querySelector('.one-of-bottom-pallets:not(.hidden)');
        if (visiblePalette) {
            visiblePalette.classList.add('hidden');
        }
        
        console.log('IconManager: Selected icon:', alt);
    }

    showCustomCursor(src, alt) {
        const customCursor = document.getElementById('customCursor');
        if (!customCursor) return;
        
        customCursor.innerHTML = `
            <img src="${src}" alt="${alt}" style="
                width: 45px; 
                height: 45px; 
                pointer-events: none;
            ">
        `;
        
        customCursor.classList.remove('hidden');
        customCursor.style.display = 'block';
        
        if (AppState.canvas) {
            AppState.canvas.style.cursor = 'none';
        }
        
        document.addEventListener('mousemove', this.boundUpdateCustomCursor);
    }

    updateCustomCursor(e) {
        const customCursor = document.getElementById('customCursor');
        if (customCursor) {
            customCursor.style.left = e.clientX + 'px';
            customCursor.style.top = e.clientY + 'px';
        }
    }

    hideCustomCursor() {
        const customCursor = document.getElementById('customCursor');
        if (customCursor) {
            customCursor.classList.add('hidden');
            customCursor.innerHTML = '';
        }
        
        if (AppState.canvas) {
            AppState.canvas.style.cursor = 'default';
        }
        
        document.removeEventListener('mousemove', this.boundUpdateCustomCursor);
        this.selectedIcon = null;
        
        // Restore the last visible palette
        const iconsPalette = document.getElementById('iconsPalette');
        if (iconsPalette) {
            iconsPalette.classList.remove('hidden');
        }
    }

    handleCanvasClick(data) {
        const { x, y, isEditMode, editSubMode } = data;
        
        if (this.selectedIcon && !isEditMode) {
            this.placeIcon(x, y);
            return true; // Handled
        }
        
        if (isEditMode && editSubMode === 'labels') {
            const clickedElement = this.getIconAt(x, y);
            
            if (clickedElement && clickedElement.type === 'icon') {
                this.showIconEditControls(clickedElement);
                return true;
            } else {
                // Clicked elsewhere, hide edit controls
                this.hideIconEditControls();
                return false;
            }
        }
        
        return false; // Not handled
    }

    placeIcon(x, y) {
        if (!this.selectedIcon) return;

        const newElement = {
            id: Date.now() + Math.random(),
            type: 'icon',
            content: this.selectedIcon.src,
            alt: this.selectedIcon.alt,
            x: x - 22.5, // Center the 45px icon
            y: y - 22.5,
            width: 45,
            height: 45,
            rotation: 0,
            draggable: true
        };

        AppState.placedElements.push(newElement);
        this.hideCustomCursor();
        
        CanvasManager.redraw();
        CanvasManager.saveAction();
        
        console.log('IconManager: Placed icon:', newElement.alt);
    }

    getIconAt(x, y) {
        // Only check icon elements
        for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
            const element = AppState.placedElements[i];
            
            if (element.type !== 'icon') continue;
            
            if (x >= element.x && x <= element.x + element.width && 
                y >= element.y && y <= element.y + element.height) {
                return element;
            }
        }
        return null;
    }

    setupIconEditControls() {
        const scaleSlider = document.getElementById('scaleSlider');
        const widthSlider = document.getElementById('widthSlider');
        const heightSlider = document.getElementById('heightSlider');
        const rotationSlider = document.getElementById('rotationSlider');
        
        const scaleDisplay = document.getElementById('scaleDisplay');
        const widthDisplay = document.getElementById('widthDisplay');
        const heightDisplay = document.getElementById('heightDisplay');
        const rotationDisplay = document.getElementById('rotationDisplay');
        
        const resetBtn = document.getElementById('resetIconBtn');
        const deleteBtn = document.getElementById('deleteIconBtn');
        const doneBtn = document.getElementById('doneEditingBtn');
        
        if (!scaleSlider) return;
        
        scaleSlider.addEventListener('input', (e) => {
            if (!this.editingIcon || !this.originalIconProperties) return;
            const scale = parseFloat(e.target.value);
            this.editingIcon.width = this.originalIconProperties.width * scale;
            this.editingIcon.height = this.originalIconProperties.height * scale;
            scaleDisplay.textContent = scale.toFixed(1);
            CanvasManager.redraw();
        });
        
        widthSlider.addEventListener('input', (e) => {
            if (!this.editingIcon || !this.originalIconProperties) return;
            const widthScale = parseFloat(e.target.value);
            this.editingIcon.width = this.originalIconProperties.width * widthScale;
            widthDisplay.textContent = widthScale.toFixed(1);
            CanvasManager.redraw();
        });
        
        heightSlider.addEventListener('input', (e) => {
            if (!this.editingIcon || !this.originalIconProperties) return;
            const heightScale = parseFloat(e.target.value);
            this.editingIcon.height = this.originalIconProperties.height * heightScale;
            heightDisplay.textContent = heightScale.toFixed(1);
            CanvasManager.redraw();
        });
        
        rotationSlider.addEventListener('input', (e) => {
            if (!this.editingIcon) return;
            const step = parseInt(e.target.value);
            const rotation = step * 45;
            this.editingIcon.rotation = (rotation * Math.PI) / 180;
            rotationDisplay.textContent = rotation + '°';
            CanvasManager.redraw();
        });
        
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (!this.editingIcon || !this.originalIconProperties) return;
                this.resetIconToOriginal();
            });
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (!this.editingIcon) return;
                this.deleteIcon(this.editingIcon);
                this.hideIconEditControls();
            });
        }
        
        if (doneBtn) {
            doneBtn.addEventListener('click', () => {
                this.finishIconEditing();
            });
        }
    }

    showIconEditControls(icon) {
        this.editingIcon = icon;
        
        this.originalIconProperties = {
            width: icon.width,
            height: icon.height,
            rotation: icon.rotation || 0
        };
        
        const currentScaleX = icon.width / this.originalIconProperties.width;
        const currentScaleY = icon.height / this.originalIconProperties.height;
        const currentRotationDegrees = ((icon.rotation || 0) * 180) / Math.PI;
        const currentRotationStep = Math.round(currentRotationDegrees / 45);
        
        const scaleSlider = document.getElementById('scaleSlider');
        const widthSlider = document.getElementById('widthSlider');
        const heightSlider = document.getElementById('heightSlider');
        const rotationSlider = document.getElementById('rotationSlider');
        
        const scaleDisplay = document.getElementById('scaleDisplay');
        const widthDisplay = document.getElementById('widthDisplay');
        const heightDisplay = document.getElementById('heightDisplay');
        const rotationDisplay = document.getElementById('rotationDisplay');
        
        if (!scaleSlider) return;
        
        const averageScale = (currentScaleX + currentScaleY) / 2;
        
        scaleSlider.value = averageScale;
        widthSlider.value = currentScaleX;
        heightSlider.value = currentScaleY;
        rotationSlider.value = currentRotationStep;
        
        if (scaleDisplay) {
            scaleDisplay.textContent = averageScale.toFixed(1);
            widthDisplay.textContent = currentScaleX.toFixed(1);
            heightDisplay.textContent = currentScaleY.toFixed(1);
            rotationDisplay.textContent = (currentRotationStep * 45) + '°';
        }
        
        // Hide all palettes and show edit controls
        document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
        
        const controls = document.getElementById('iconEditControls');
        if (controls) {
            controls.classList.remove('hidden');
        }
        
        CanvasManager.redraw();
        console.log('IconManager: Showing edit controls for icon:', icon.alt);
    }

    hideIconEditControls() {
        const controls = document.getElementById('iconEditControls');
        if (controls) {
            controls.classList.add('hidden');
        }
        this.editingIcon = null;
        this.originalIconProperties = null;
        console.log('IconManager: Hidden edit controls');
    }

    resetIconToOriginal() {
        if (!this.editingIcon || !this.originalIconProperties) return;
        
        this.editingIcon.width = this.originalIconProperties.width;
        this.editingIcon.height = this.originalIconProperties.height;
        this.editingIcon.rotation = this.originalIconProperties.rotation;
        
        const scaleSlider = document.getElementById('scaleSlider');
        const widthSlider = document.getElementById('widthSlider');
        const heightSlider = document.getElementById('heightSlider');
        const rotationSlider = document.getElementById('rotationSlider');
        
        const scaleDisplay = document.getElementById('scaleDisplay');
        const widthDisplay = document.getElementById('widthDisplay');
        const heightDisplay = document.getElementById('heightDisplay');
        const rotationDisplay = document.getElementById('rotationDisplay');
        
        if (scaleSlider) {
            scaleSlider.value = 1;
            widthSlider.value = 1;
            heightSlider.value = 1;
            rotationSlider.value = 0;
            
            if (scaleDisplay) {
                scaleDisplay.textContent = '1.0';
                widthDisplay.textContent = '1.0';
                heightDisplay.textContent = '1.0';
                rotationDisplay.textContent = '0°';
            }
        }
        
        CanvasManager.redraw();
        CanvasManager.saveAction();
        console.log('IconManager: Reset icon to original properties');
    }

    deleteIcon(icon) {
        const index = AppState.placedElements.indexOf(icon);
        if (index > -1) {
            AppState.placedElements.splice(index, 1);
            CanvasManager.redraw();
            CanvasManager.saveAction();
            console.log('IconManager: Deleted icon:', icon.alt);
        }
    }

    finishIconEditing() {
        this.hideIconEditControls();
        
        // Restore icons palette
        const iconsPalette = document.getElementById('iconsPalette');
        if (iconsPalette) {
            document.querySelectorAll('.one-of-bottom-pallets').forEach(p => p.classList.add('hidden'));
            iconsPalette.classList.remove('hidden');
            
            const paletteButtons = document.querySelectorAll('[data-palette]');
            paletteButtons.forEach(btn => btn.classList.remove('active'));
            const iconsBtn = document.getElementById('iconsBtn');
            if (iconsBtn) iconsBtn.classList.add('active');
        }
        
        CanvasManager.saveAction();
        CanvasManager.redraw();
        console.log('IconManager: Finished icon editing');
    }

    drawIcons() {
        if (!AppState.ctx) return;
        
        const ctx = AppState.ctx;
        
        AppState.placedElements.forEach(element => {
            if (element.type !== 'icon') return;
            
            ctx.save();
            
            // Fade elements in areas edit mode
            if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
                ctx.globalAlpha = 0.3;
            }
            
            this.drawIcon(ctx, element);
            
            ctx.restore();
        });
    }

    drawIcon(ctx, element) {
        // Load image if not in cache
        if (!this.imageCache.has(element.content)) {
            const img = new Image();
            img.onload = () => {
                this.imageCache.set(element.content, img);
                CanvasManager.redraw(); // Redraw when image loads
            };
            img.onerror = () => {
                console.error('IconManager: Failed to load image:', element.content);
            };
            img.src = element.content;
            return; // Skip drawing this frame
        }
        
        const img = this.imageCache.get(element.content);
        
        ctx.save();
        
        // Apply rotation if needed
        if (element.rotation) {
            const centerX = element.x + element.width / 2;
            const centerY = element.y + element.height / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate(element.rotation);
            ctx.translate(-centerX, -centerY);
        }
        
        // Draw the icon
        ctx.drawImage(img, element.x, element.y, element.width, element.height);
        
        ctx.restore();
        
        // Draw edit highlight if this icon is being edited
        if (this.editingIcon === element) {
            this.drawIconEditHighlight(ctx, element);
        }
    }

    drawIconEditHighlight(ctx, element) {
        ctx.save();
        
        ctx.strokeStyle = '#3498db'; // Bright blue for visibility
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]); // Dashed line for a "selected" look
        
        // Apply rotation to the highlight box itself
        if (element.rotation) {
            const centerX = element.x + element.width / 2;
            const centerY = element.y + element.height / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate(element.rotation);
            ctx.translate(-centerX, -centerY);
        }
        
        ctx.strokeRect(element.x - 3, element.y - 3, element.width + 6, element.height + 6);
        
        ctx.restore();
        ctx.setLineDash([]);
    }

    // Check if device is mobile
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0);
    }
}