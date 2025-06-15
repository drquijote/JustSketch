// src/modules/AreaManagement/AreaManager.js
// Core Area CRUD operations - completely independent module

import { AppState } from '../../core/AppState.js';
import { eventBus } from '../../core/EventBus.js';
import { GeometryUtils } from '../../core/GeometryUtils.js';

export class AreaManager {
    constructor() {
        this.PIXELS_PER_FOOT = 8;
        this.activeAreaForModal = null;
        this.editingArea = null;
        
        console.log('AreaManager: Initialized with modular architecture');
    }

    init() {
        // Listen for cycle completion events from drawing system
        eventBus.on('drawing:cycleCompleted', (data) => this.handleCycleCompletion(data));
        
        // Listen for area update requests
        eventBus.on('area:updateRequested', (data) => this.updateArea(data));
        
        // Listen for area deletion requests  
        eventBus.on('area:deleteRequested', (data) => this.deleteArea(data));
        
        // Listen for render requests
        eventBus.on('render:areas', () => this.renderAreas());
        
        console.log('AreaManager: Event listeners initialized');
    }

    /**
     * Handle cycle completion from drawing system
     */
    handleCycleCompletion(data) {
        const { path } = data;
        if (!path || path.length < 3) {
            console.warn('AreaManager: Invalid path for area creation');
            return;
        }

        this.activeAreaForModal = path;
        this.showAreaCreationModal();
    }

    /**
     * Show modal for creating new area
     */
    showAreaCreationModal() {
        const modal = document.getElementById('polygonModal');
        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const saveBtn = modal.querySelector('.btn-primary');
        const cancelBtn = modal.querySelector('.btn-secondary');
        const deleteBtn = document.getElementById('deleteCycle');

        // Generate default name
        const defaultType = typeSelect.options[0]?.value || 'living';
        nameInput.value = this.generateAreaLabel(defaultType);
        typeSelect.value = defaultType;

        // Update name when type changes
        typeSelect.onchange = () => {
            nameInput.value = this.generateAreaLabel(typeSelect.value);
        };

        // Set button handlers
        saveBtn.onclick = () => this.saveNewArea();
        cancelBtn.onclick = () => this.cancelAreaCreation();
        if (deleteBtn) {
            deleteBtn.onclick = () => this.deleteCurrentPath();
        }

        modal.classList.remove('hidden');
        nameInput.focus();
        setTimeout(() => nameInput.select(), 100);
    }

    /**
     * Save new area to AppState
     */
    saveNewArea() {
        if (!this.activeAreaForModal) {
            console.warn('AreaManager: No active path for area creation');
            return;
        }

        const nameInput = document.getElementById('polygonName');
        const typeSelect = document.getElementById('polygonType');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];

        const areaData = {
            id: Date.now(),
            path: this.activeAreaForModal,
            label: nameInput.value.trim(),
            type: typeSelect.value,
            glaType: parseInt(selectedOption.getAttribute('data-gla'), 10),
            area: this.calculateAreaInSquareFeet(this.activeAreaForModal),
            centroid: GeometryUtils.calculateCentroid(this.activeAreaForModal)
        };

        // Add to AppState
        AppState.drawnPolygons.push(areaData);

        // Create visual label element
        this.createAreaLabelElement(areaData);

        // Clean up and notify
        this.hideAreaModal();
        eventBus.emit('area:created', areaData);
        eventBus.emit('legend:updateRequested');
        eventBus.emit('history:saveAction');
        
        console.log('AreaManager: Created new area:', areaData.label);
    }

    /**
     * Cancel area creation
     */
    cancelAreaCreation() {
        this.hideAreaModal();
        eventBus.emit('drawing:pathCancelled');
    }

    /**
     * Delete current drawing path
     */
    deleteCurrentPath() {
        if (!this.activeAreaForModal) return;

        // Find and remove any elements inside the path
        const elementsToRemove = [];
        AppState.placedElements.forEach((element, index) => {
            const elementCenter = {
                x: element.x + (element.width / 2),
                y: element.y + (element.height / 2)
            };
            
            if (GeometryUtils.isPointInPolygon(elementCenter, this.activeAreaForModal)) {
                elementsToRemove.push(index);
            }
        });

        // Remove elements in reverse order to maintain indices
        elementsToRemove.reverse().forEach(index => {
            AppState.placedElements.splice(index, 1);
        });

        this.hideAreaModal();
        eventBus.emit('drawing:pathDeleted');
        eventBus.emit('history:saveAction');
        
        console.log('AreaManager: Deleted current path and contained elements');
    }

    /**
     * Update existing area
     */
    updateArea(data) {
        const { areaId, updates } = data;
        const area = AppState.drawnPolygons.find(a => a.id === areaId);
        
        if (!area) {
            console.warn('AreaManager: Area not found for update:', areaId);
            return;
        }

        // Apply updates
        Object.assign(area, updates);

        // Recalculate area if path changed
        if (updates.path) {
            area.area = this.calculateAreaInSquareFeet(updates.path);
            area.centroid = GeometryUtils.calculateCentroid(updates.path);
        }

        // Update associated label elements
        this.updateAreaLabelElements(area);

        eventBus.emit('area:updated', area);
        eventBus.emit('legend:updateRequested');
        
        console.log('AreaManager: Updated area:', area.label);
    }

    /**
     * Delete area
     */
    deleteArea(data) {
        const { areaId } = data;
        const areaIndex = AppState.drawnPolygons.findIndex(a => a.id === areaId);
        
        if (areaIndex === -1) {
            console.warn('AreaManager: Area not found for deletion:', areaId);
            return;
        }

        const area = AppState.drawnPolygons[areaIndex];

        // Remove all elements inside the area
        const elementsToRemove = [];
        AppState.placedElements.forEach((element, index) => {
            const elementCenter = {
                x: element.x + (element.width / 2),
                y: element.y + (element.height / 2)
            };
            
            if (GeometryUtils.isPointInPolygon(elementCenter, area.path)) {
                elementsToRemove.push(index);
            }
        });

        // Remove elements in reverse order
        elementsToRemove.reverse().forEach(index => {
            AppState.placedElements.splice(index, 1);
        });

        // Remove area label elements
        AppState.placedElements = AppState.placedElements.filter(el => 
            !(el.type === 'area_label' && el.linkedPolygonId === areaId)
        );

        // Remove the area itself
        AppState.drawnPolygons.splice(areaIndex, 1);

        eventBus.emit('area:deleted', { areaId, areaLabel: area.label });
        eventBus.emit('legend:updateRequested');
        eventBus.emit('history:saveAction');
        
        console.log('AreaManager: Deleted area and contained elements:', area.label);
    }

    /**
     * Render all areas
     */
    renderAreas() {
        const { ctx } = AppState;
        if (!ctx || !AppState.drawnPolygons.length) return;

        ctx.save();

        AppState.drawnPolygons.forEach(area => {
            this.renderSingleArea(ctx, area);
        });

        ctx.restore();
    }

    /**
     * Render single area
     */
    renderSingleArea(ctx, area) {
        ctx.save();

        // Set fill color based on GLA type
        let fillOpacity = 0.4;
        if (AppState.currentMode === 'edit' && AppState.editSubMode === 'labels') {
            fillOpacity = 0.1; // More transparent when editing labels
        }

        if (area.glaType === 1) {
            ctx.fillStyle = `rgba(144, 238, 144, ${fillOpacity})`;
        } else if (area.type === 'ADU') {
            ctx.fillStyle = `rgba(173, 255, 173, ${fillOpacity + 0.1})`;
        } else if (area.glaType === 0) {
            ctx.fillStyle = `rgba(180, 180, 180, ${fillOpacity + 0.2})`;
        } else {
            ctx.fillStyle = `rgba(220, 220, 220, ${fillOpacity - 0.1})`;
        }

        // Draw filled area
        ctx.beginPath();
        ctx.moveTo(area.path[0].x, area.path[0].y);
        for (let i = 1; i < area.path.length; i++) {
            ctx.lineTo(area.path[i].x, area.path[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // Draw outline
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Create area label element
     */
    createAreaLabelElement(area) {
        const areaLabelElement = {
            id: `area_label_${area.id}`,
            type: 'area_label',
            content: area.label,
            areaData: {
                areaText: area.label,
                sqftText: `${area.area.toFixed(1)} sq ft`,
                polygonId: area.id
            },
            styling: {
                backgroundColor: 'transparent',
                color: '#000',
                textAlign: 'center'
            },
            x: area.centroid.x,
            y: area.centroid.y,
            width: Math.max(80, area.label.length * 8 + 16),
            height: 32,
            draggable: true,
            linkedPolygonId: area.id
        };

        AppState.placedElements.push(areaLabelElement);
        console.log('AreaManager: Created area label element for:', area.label);
    }

    /**
     * Update area label elements
     */
    updateAreaLabelElements(area) {
        const labelElements = AppState.placedElements.filter(el => 
            el.type === 'area_label' && el.linkedPolygonId === area.id
        );

        labelElements.forEach(element => {
            element.content = area.label;
            element.areaData.areaText = area.label;
            element.areaData.sqftText = `${area.area.toFixed(1)} sq ft`;
            element.width = Math.max(80, area.label.length * 8 + 16);
        });
    }

    /**
     * Generate area label based on type
     */
    generateAreaLabel(areaType) {
        const typeSelect = document.getElementById('polygonType');
        if (!typeSelect) return `Area ${AppState.drawnPolygons.length + 1}`;

        const targetOption = typeSelect.querySelector(`option[value="${areaType}"]`);
        if (!targetOption) return `Area ${AppState.drawnPolygons.length + 1}`;

        // Get clean base name
        const baseName = targetOption.textContent.trim().replace(/\s*\([^)]*\)/g, '').trim();

        // Count existing areas of this type
        const existingCount = AppState.drawnPolygons.filter(a => a.type === areaType).length;

        return `${baseName} ${existingCount + 1}`;
    }

    /**
     * Calculate area in square feet
     */
    calculateAreaInSquareFeet(path) {
        const areaInPixels = GeometryUtils.calculatePolygonArea(path);
        return areaInPixels / (this.PIXELS_PER_FOOT * this.PIXELS_PER_FOOT);
    }

    /**
     * Hide area modal
     */
    hideAreaModal() {
        const modal = document.getElementById('polygonModal');
        modal.classList.add('hidden');
        this.activeAreaForModal = null;
        this.editingArea = null;
    }

    /**
     * Get area by ID
     */
    getAreaById(areaId) {
        return AppState.drawnPolygons.find(a => a.id === areaId);
    }

    /**
     * Get all areas
     */
    getAllAreas() {
        return [...AppState.drawnPolygons];
    }

    /**
     * Get areas by type
     */
    getAreasByType(type) {
        return AppState.drawnPolygons.filter(a => a.type === type);
    }

    /**
     * Get GLA areas
     */
    getGLAAreas() {
        return AppState.drawnPolygons.filter(a => a.glaType === 1);
    }

    /**
     * Get non-GLA areas
     */
    getNonGLAAreas() {
        return AppState.drawnPolygons.filter(a => a.glaType === 0);
    }

    /**
     * Calculate total GLA
     */
    calculateTotalGLA() {
        return this.getGLAAreas().reduce((total, area) => total + area.area, 0);
    }

    /**
     * Calculate total non-GLA
     */
    calculateTotalNonGLA() {
        return this.getNonGLAAreas().reduce((total, area) => total + area.area, 0);
    }
}
