// src/modules/ElementPlacement/PhotoManager.js
import { AppState } from '../../core/AppState.js';
import { CanvasManager } from '../../canvas/CanvasManager.js';

export class PhotoManager {
    constructor(eventBus, db) {
        this.eventBus = eventBus;
        this.db = db; // Dexie database instance
        this.photosPalette = document.getElementById('photosPalette');
        this.activeElement = null;
        this.cameraInput = null;
        this.libraryInput = null;
        
        console.log('PhotoManager: Initialized');
    }

    init() {
        // Create file inputs
        this.cameraInput = this.createFileInput(true);
        this.libraryInput = this.createFileInput(false);

        // Listen for mode changes
        this.eventBus.on('mode:changed', (data) => {
            if (data.mode === 'photos') {
                this.activate();
            } else {
                this.deactivate();
            }
        });

        // Listen for canvas interactions in photos mode
        this.eventBus.on('canvas:click', (data) => {
            if (AppState.currentMode === 'photos') {
                this.handleCanvasClick(data);
            }
        });

        // Listen for canvas redraws to show active element highlight
        this.eventBus.on('canvas:redraw:elements', () => {
            this.drawPhotoHighlights();
        });

        console.log('PhotoManager: Event listeners set up');
    }

    activate() {
        console.log('PhotoManager: Activated photos mode');
        this.boundHandleCanvasClick = (e) => this.handleCanvasClickEvent(e);
        
        if (AppState.canvas) {
            AppState.canvas.addEventListener('click', this.boundHandleCanvasClick);
            AppState.canvas.style.cursor = 'pointer';
        }
        
        CanvasManager.redraw();
    }

    deactivate() {
        if (this.boundHandleCanvasClick && AppState.canvas) {
            AppState.canvas.removeEventListener('click', this.boundHandleCanvasClick);
        }
        
        if (AppState.canvas) {
            AppState.canvas.style.cursor = 'default';
        }
        
        this.activeElement = null;
        AppState.activePhotoElement = null;
        
        if (this.photosPalette) {
            this.photosPalette.innerHTML = '';
        }
        
        CanvasManager.redraw();
        console.log('PhotoManager: Deactivated photos mode');
    }

    createFileInput(useCamera) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        
        if (useCamera) {
            input.capture = 'environment';
        }
        
        input.addEventListener('change', (e) => this.handleFileSelected(e));
        document.body.appendChild(input);
        return input;
    }

    handleCanvasClickEvent(event) {
        const rect = AppState.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) - AppState.viewportTransform.x;
        const y = (event.clientY - rect.top) - AppState.viewportTransform.y;
        
        this.handleCanvasClick({ x, y });
    }

    handleCanvasClick(data) {
        const { x, y } = data;
        
        let clickedElement = null;
        
        // Find the topmost element at click position
        for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
            const element = AppState.placedElements[i];
            if (x >= element.x && x <= element.x + element.width &&
                y >= element.y && y <= element.y + element.height) {
                clickedElement = element;
                break;
            }
        }

        if (clickedElement) {
            this.selectElement(clickedElement);
        } else {
            this.deselectElement();
        }
    }

    selectElement(element) {
        console.log('PhotoManager: Selected element for photos:', element.content || element.alt);
        this.activeElement = element;
        AppState.activePhotoElement = element;
        
        this.buildPaletteUI();
        this.loadAndDisplayThumbnails();
        
        CanvasManager.redraw();
    }

    deselectElement() {
        this.activeElement = null;
        AppState.activePhotoElement = null;
        
        if (this.photosPalette) {
            this.photosPalette.innerHTML = '';
        }
        
        CanvasManager.redraw();
    }

    buildPaletteUI() {
        if (!this.photosPalette || !this.activeElement) return;
        
        const elementName = this.activeElement.content || this.activeElement.alt || 'Selection';
        
        this.photosPalette.innerHTML = `
            <div class="photos-palette-horizontal">
                <div class="photo-palette-label">
                    <span>${elementName}</span>
                </div>
                <div class="photo-thumbnail-container" id="thumbnailContainer">
                    <!-- Thumbnails will be added here by JavaScript -->
                </div>
                <div class="photo-controls">
                    <button class="photo-btn" id="libraryBtn">
                        <img src="public/library.svg" alt="Library">
                        <span>Library</span>
                    </button>
                    <button class="photo-btn" id="cameraBtn">
                        <img src="public/camera.svg" alt="Camera">
                        <span>Camera</span>
                    </button>
                </div>
            </div>
        `;

        // Set up button listeners
        const libraryBtn = document.getElementById('libraryBtn');
        const cameraBtn = document.getElementById('cameraBtn');
        
        if (libraryBtn) {
            libraryBtn.addEventListener('click', () => this.libraryInput.click());
        }
        
        if (cameraBtn) {
            cameraBtn.addEventListener('click', () => this.cameraInput.click());
        }
    }

    async handleFileSelected(event) {
        if (!event.target.files || event.target.files.length === 0) return;
        if (!this.activeElement) {
            console.warn('PhotoManager: No element selected for photo attachment');
            return;
        }
        
        const file = event.target.files[0];
        
        try {
            const photoData = await this.processImage(file);
            await this.savePhotoToDb(photoData);
        } catch (error) {
            console.error('PhotoManager: Error processing image:', error);
            alert('Could not process the selected image.');
        }

        event.target.value = ''; // Reset input
    }

    processImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const fullSizeData = this.resizeCanvas(img, 1024, 1024);
                    const thumbnailData = this.resizeCanvas(img, 80, 80);
                    
                    resolve({ fullSizeData, thumbnailData });
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    resizeCanvas(img, maxWidth, maxHeight) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions maintaining aspect ratio
        if (width > height) {
            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }
        } else {
            if (height > maxHeight) {
                width *= maxHeight / height;
                height = maxHeight;
            }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.85);
    }

    async savePhotoToDb(photoData) {
        if (!this.activeElement || !AppState.currentSketchId || !this.db) return;

        try {
            const sketch = await this.db.sketches.get(AppState.currentSketchId);
            if (!sketch) {
                console.warn('PhotoManager: No current sketch found to save photo to');
                return;
            }

            if (!sketch.photos) sketch.photos = [];
            
            const newPhoto = {
                elementId: this.activeElement.id,
                timestamp: Date.now(),
                imageData: photoData.fullSizeData,
                thumbnailData: photoData.thumbnailData
            };

            sketch.photos.push(newPhoto);
            await this.db.sketches.put(sketch);

            console.log('PhotoManager: Photo saved successfully for element:', this.activeElement.id);
            this.loadAndDisplayThumbnails();

        } catch (error) {
            console.error('PhotoManager: Failed to save photo to DB:', error);
        }
    }

    async loadAndDisplayThumbnails() {
        const container = document.getElementById('thumbnailContainer');
        if (!container || !this.activeElement || !AppState.currentSketchId || !this.db) {
            if (container) container.innerHTML = '';
            return;
        }
        
        container.innerHTML = '';

        try {
            const sketch = await this.db.sketches.get(AppState.currentSketchId);
            if (!sketch || !sketch.photos) return;
            
            const elementPhotos = sketch.photos.filter(p => p.elementId === this.activeElement.id);

            elementPhotos.forEach(photo => {
                const thumbWrapper = document.createElement('div');
                thumbWrapper.className = 'photo-thumbnail-wrapper';
                
                const img = document.createElement('img');
                img.src = photo.thumbnailData;
                img.alt = 'Attached photo';
                
                const deleteBtn = document.createElement('div');
                deleteBtn.className = 'thumbnail-delete-btn';
                deleteBtn.innerHTML = '&times;';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this photo?')) {
                        this.deletePhoto(photo.timestamp);
                    }
                };
                
                thumbWrapper.appendChild(img);
                thumbWrapper.appendChild(deleteBtn);
                container.appendChild(thumbWrapper);
            });
        } catch (error) {
            console.error('PhotoManager: Failed to load thumbnails:', error);
        }
    }

    async deletePhoto(timestamp) {
        if (!AppState.currentSketchId || !this.db) return;
        
        try {
            const sketch = await this.db.sketches.get(AppState.currentSketchId);
            if (!sketch || !sketch.photos) return;
            
            sketch.photos = sketch.photos.filter(p => p.timestamp !== timestamp);
            await this.db.sketches.put(sketch);

            console.log('PhotoManager: Photo deleted successfully');
            this.loadAndDisplayThumbnails();
        } catch (error) {
            console.error('PhotoManager: Failed to delete photo:', error);
        }
    }

    drawPhotoHighlights() {
        if (!AppState.ctx || !this.activeElement) return;
        
        const ctx = AppState.ctx;
        
        // Draw purple highlight around selected element
        ctx.save();
        ctx.strokeStyle = '#8e44ad';
        ctx.lineWidth = 3;
        ctx.strokeRect(
            this.activeElement.x - 2, 
            this.activeElement.y - 2, 
            this.activeElement.width + 4, 
            this.activeElement.height + 4
        );
        ctx.restore();
    }

    // Cleanup method
    destroy() {
        if (this.cameraInput) {
            this.cameraInput.remove();
        }
        if (this.libraryInput) {
            this.libraryInput.remove();
        }
        this.deactivate();
        console.log('PhotoManager: Destroyed');
    }

    // Check if device is mobile
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0);
    }
}