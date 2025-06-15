// src/modules/ElementPlacement/RoomLabelManager.js
import { AppState } from '../../core/AppState.js';
import { CanvasManager } from '../../canvas/CanvasManager.js';

export class RoomLabelManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.selectedRoomLabel = null;
        this.editingElement = null;
        this.editInput = null;
        this.boundUpdateCustomCursor = this.updateCustomCursor.bind(this);
        
        console.log('RoomLabelManager: Initialized');
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

        // Listen for room palette interactions
        this.eventBus.on('palette:roomSelected', (data) => {
            this.selectRoomLabel(data.content, data.styling);
        });

        // Listen for canvas interactions
        this.eventBus.on('canvas:click', (data) => {
            this.handleCanvasClick(data);
        });

        // Listen for edit mode changes
        this.eventBus.on('mode:editToggled', (data) => {
            if (!data.isEditMode) {
                this.finishEditing();
            }
        });

        // Listen for canvas redraws
        this.eventBus.on('canvas:redraw:elements', () => {
            this.drawRoomLabels();
        });

        console.log('RoomLabelManager: Event listeners set up');
    }

    activate() {
        console.log('RoomLabelManager: Activated');
        this.setupPaletteListeners();
    }

    deactivate() {
        this.hideCustomCursor();
        this.finishEditing();
        console.log('RoomLabelManager: Deactivated');
    }

    setupPaletteListeners() {
        const roomLabels = document.querySelectorAll('.room-palette-label');
        
        roomLabels.forEach(label => {
            // Remove existing listeners first
            label.removeEventListener('click', this.handleRoomLabelClick);
            
            // Add new listener
            label.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const styles = getComputedStyle(label);
                const styling = {
                    backgroundColor: styles.backgroundColor,
                    color: styles.color,
                    borderRadius: styles.borderRadius,
                    border: styles.border,
                    padding: styles.padding,
                    className: label.className
                };
                
                this.selectRoomLabel(label.textContent, styling);
            });
        });
    }

    selectRoomLabel(content, styling) {
        this.selectedRoomLabel = { content, styling };
        this.showCustomCursor(content, styling);
        
        // Hide the current palette
        const visiblePalette = document.querySelector('.one-of-bottom-pallets:not(.hidden)');
        if (visiblePalette) {
            visiblePalette.classList.add('hidden');
        }
        
        console.log('RoomLabelManager: Selected room label:', content);
    }

    showCustomCursor(content, styling) {
        const customCursor = document.getElementById('customCursor');
        if (!customCursor) return;
        
        const textWidth = Math.max(58, content.length * 8 + 8);
        
        customCursor.innerHTML = `
            <div style="
                background-color: ${styling.backgroundColor}; 
                color: ${styling.color || 'white'}; 
                padding: 2px 4px; 
                border-radius: 4px; 
                font: 600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; 
                white-space: nowrap; 
                border: 1px solid rgba(255,255,255,0.2); 
                pointer-events: none; 
                width: ${textWidth}px; 
                height: 16px; 
                display: flex; 
                align-items: center; 
                justify-content: center;
            ">${content}</div>
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
        this.selectedRoomLabel = null;
        
        // Restore the last visible palette
        const roomsPalette = document.getElementById('roomsPalette');
        if (roomsPalette) {
            roomsPalette.classList.remove('hidden');
        }
    }

    handleCanvasClick(data) {
        const { x, y, isEditMode, editSubMode } = data;
        
        if (this.selectedRoomLabel && !isEditMode) {
            this.placeRoomLabel(x, y);
            return true; // Handled
        }
        
        if (isEditMode && editSubMode === 'labels') {
            const clickedElement = this.getElementAt(x, y);
            
            if (clickedElement && (clickedElement.type === 'room' || clickedElement.type === 'area_label')) {
                // Check if clicking on delete button
                if (this.isClickOnDeleteButton(x, y, clickedElement)) {
                    this.deleteElement(clickedElement);
                    return true;
                }
                
                // Otherwise start editing
                this.startEditingElement(clickedElement);
                return true;
            } else {
                // Clicked elsewhere, finish editing
                this.finishEditing();
                return false;
            }
        }
        
        return false; // Not handled
    }

    placeRoomLabel(x, y) {
        if (!this.selectedRoomLabel) return;

        const textWidth = Math.max(58, this.selectedRoomLabel.content.length * 8 + 8);
        
        const newElement = {
            id: Date.now() + Math.random(),
            type: 'room',
            content: this.selectedRoomLabel.content,
            styling: this.selectedRoomLabel.styling,
            x: x - textWidth / 2,
            y: y - 8, // Center vertically
            width: textWidth,
            height: 16,
            draggable: true
        };

        AppState.placedElements.push(newElement);
        this.hideCustomCursor();
        
        // Update legend
        this.eventBus.emit('legend:update');
        
        CanvasManager.redraw();
        CanvasManager.saveAction();
        
        console.log('RoomLabelManager: Placed room label:', newElement.content);
    }

    getElementAt(x, y) {
        // Only check room and area_label elements
        for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
            const element = AppState.placedElements[i];
            
            if (element.type !== 'room' && element.type !== 'area_label') {
                continue;
            }
            
            if (x >= element.x && x <= element.x + element.width && 
                y >= element.y && y <= element.y + element.height) {
                return element;
            }
        }
        return null;
    }

    isClickOnDeleteButton(x, y, element) {
        const deleteSize = 20;
        const deleteX = element.x + element.width + 2;
        const deleteY = element.y - 2;
        const centerX = deleteX + deleteSize/2;
        const centerY = deleteY + deleteSize/2;
        const distance = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
        
        return distance <= deleteSize/2;
    }

    deleteElement(element) {
        const index = AppState.placedElements.indexOf(element);
        if (index > -1) {
            AppState.placedElements.splice(index, 1);
            
            // Update legend
            this.eventBus.emit('legend:update');
            
            CanvasManager.redraw();
            CanvasManager.saveAction();
            
            console.log('RoomLabelManager: Deleted element:', element.content);
        }
    }

    startEditingElement(element) {
        this.finishEditing(); // Finish any existing edit
        
        this.editingElement = element;
        
        this.editInput = document.createElement('input');
        this.editInput.type = 'text';
        
        if (element.type === 'area_label') {
            this.editInput.value = element.areaData ? element.areaData.areaText : element.content;
        } else {
            this.editInput.value = element.content;
        }
        
        this.editInput.style.position = 'fixed';
        
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const screenX = rect.left + AppState.viewportTransform.x + element.x;
        const screenY = rect.top + AppState.viewportTransform.y + element.y;
        
        this.editInput.style.left = screenX + 'px';
        this.editInput.style.top = screenY + 'px';
        
        const editingWidth = Math.max(160, element.content.length * 8 + 40);
        this.editInput.style.width = editingWidth + 'px';
        this.editInput.style.height = (element.height + 8) + 'px';
        this.editInput.style.fontSize = '16px';
        this.editInput.style.fontWeight = '600';
        this.editInput.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        this.editInput.style.border = '3px solid #3498db';
        this.editInput.style.borderRadius = '4px';
        this.editInput.style.padding = '4px 8px';
        this.editInput.style.backgroundColor = 'white';
        this.editInput.style.color = '#333';
        this.editInput.style.zIndex = '999999';
        this.editInput.style.textAlign = 'center';
        this.editInput.style.touchAction = 'auto';
        this.editInput.style.userSelect = 'text';
        this.editInput.style.webkitUserSelect = 'text';
        this.editInput.style.pointerEvents = 'auto';
        this.editInput.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        
        // Mobile-friendly attributes
        this.editInput.setAttribute('autocomplete', 'off');
        this.editInput.setAttribute('autocorrect', 'off');
        this.editInput.setAttribute('autocapitalize', 'off');
        this.editInput.setAttribute('spellcheck', 'false');
        this.editInput.setAttribute('inputmode', 'text');
        
        this.editInput.addEventListener('blur', () => {
            setTimeout(() => this.finishEditing(), 200);
        });
        
        this.editInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.finishEditing();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.cancelEditing();
            }
        });
        
        document.body.appendChild(this.editInput);
        
        setTimeout(() => {
            this.editInput.focus();
            this.editInput.select();
        }, 50);
        
        console.log('RoomLabelManager: Started editing element:', element.content);
    }

    finishEditing() {
        if (!this.editingElement || !this.editInput) return;
        
        const newContent = this.editInput.value.trim();
        let contentChanged = false;
        
        if (newContent && newContent !== this.editingElement.content) {
            if (this.editingElement.type === 'area_label') {
                this.editingElement.content = newContent;
                this.editingElement.areaData.areaText = newContent;
                this.editingElement.width = Math.max(80, newContent.length * 8 + 16);
                
                // Update linked polygon
                const linkedPolygon = AppState.drawnPolygons.find(p => p.id === this.editingElement.linkedPolygonId);
                if (linkedPolygon) {
                    linkedPolygon.label = newContent;
                }
                contentChanged = true;
            } else {
                this.editingElement.content = newContent;
                this.editingElement.width = Math.max(58, newContent.length * 8 + 8);
                contentChanged = true;
            }
        }
        
        this.cleanupEditing();
        
        if (contentChanged) {
            CanvasManager.saveAction();
            if (this.editingElement.type === 'area_label') {
                this.eventBus.emit('area:labelUpdated', { element: this.editingElement });
            }
            this.eventBus.emit('legend:update');
        }
        
        CanvasManager.redraw();
        console.log('RoomLabelManager: Finished editing');
    }

    cancelEditing() {
        this.cleanupEditing();
        console.log('RoomLabelManager: Cancelled editing');
    }

    cleanupEditing() {
        if (this.editInput) {
            this.editInput.remove();
            this.editInput = null;
        }
        this.editingElement = null;
    }

    drawRoomLabels() {
        if (!AppState.ctx) return;
        
        const ctx = AppState.ctx;
        
        AppState.placedElements.forEach(element => {
            if (element.type !== 'room' && element.type !== 'area_label') return;
            
            ctx.save();
            
            // Fade elements in areas edit mode
            if (AppState.currentMode === 'edit' && AppState.editSubMode === 'areas') {
                ctx.globalAlpha = 0.3;
            }
            
            if (element.type === 'area_label') {
                this.drawAreaLabel(ctx, element);
            } else {
                this.drawRoomLabel(ctx, element);
            }
            
            // Draw delete button in labels edit mode
            if (AppState.currentMode === 'edit' && AppState.editSubMode === 'labels' && element !== this.editingElement) {
                this.drawDeleteButton(ctx, element);
            }
            
            ctx.restore();
        });
    }

    drawRoomLabel(ctx, element) {
        const styling = element.styling;
        
        // Draw background
        ctx.fillStyle = styling.backgroundColor || styling;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.roundRect(element.x, element.y, element.width, element.height, 4);
        ctx.fill();
        ctx.stroke();
        
        // Draw text (if not being edited)
        if (element !== this.editingElement) {
            ctx.fillStyle = styling.color || 'white';
            ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                element.content, 
                element.x + element.width/2, 
                element.y + element.height/2
            );
        }
    }

    drawAreaLabel(ctx, element) {
        // Update area data from linked polygon
        const linkedPolygon = AppState.drawnPolygons.find(p => p.id === element.linkedPolygonId);
        if (linkedPolygon) {
            element.areaData.sqftText = `${linkedPolygon.area.toFixed(1)} sq ft`;
            element.areaData.areaText = linkedPolygon.label;
        }
        
        ctx.fillStyle = element.styling.color || '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw area name
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        ctx.fillText(
            element.areaData.areaText, 
            element.x + element.width/2, 
            element.y + element.height/2 - 8
        );
        
        // Draw square footage
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        ctx.fillText(
            element.areaData.sqftText, 
            element.x + element.width/2, 
            element.y + element.height/2 + 8
        );
    }

    drawDeleteButton(ctx, element) {
        const deleteSize = 20;
        const deleteX = element.x + element.width + 2;
        const deleteY = element.y - 2;
        
        ctx.globalAlpha = 1.0;
        
        // Draw red circle
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(deleteX + deleteSize/2, deleteY + deleteSize/2, deleteSize/2, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw white border
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(deleteX + deleteSize/2, deleteY + deleteSize/2, deleteSize/2, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw X
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        
        const offset = 6;
        const centerX = deleteX + deleteSize/2;
        const centerY = deleteY + deleteSize/2;
        
        ctx.beginPath();
        ctx.moveTo(centerX - offset, centerY - offset);
        ctx.lineTo(centerX + offset, centerY + offset);
        ctx.moveTo(centerX + offset, centerY - offset);
        ctx.lineTo(centerX - offset, centerY + offset);
        ctx.stroke();
    }

    updateLegend() {
        let bedrooms = 0;
        let bathrooms = 0;
        
        AppState.placedElements.forEach(element => {
            if (element.type === 'room') {
                const label = element.content.toLowerCase();
                if (label.includes('bedroom')) {
                    bedrooms++;
                } else if (label.includes('1/2 bath')) {
                    bathrooms += 0.5;
                } else if (label.includes('bath')) {
                    bathrooms++;
                }
            }
        });
        
        const bedroomsEl = document.getElementById('legendBedrooms');
        const bathroomsEl = document.getElementById('legendBathrooms');
        
        if (bedroomsEl) bedroomsEl.textContent = bedrooms;
        if (bathroomsEl) bathroomsEl.textContent = bathrooms;
        
        console.log('RoomLabelManager: Updated legend - Bedrooms:', bedrooms, 'Bathrooms:', bathrooms);
    }

    // Check if device is mobile
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0);
    }
}