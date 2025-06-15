// src/photos.js - REVISED IMPLEMENTATION

import { AppState } from './state.js';
import { db } from './db.js';
import { CanvasManager } from './canvas.js';

/**
 * Manages all functionality related to photo mode, including attaching
 * photos to canvas elements and saving them to the database.
 */
export class PhotoManager {
    constructor() {
        this.photosPalette = document.getElementById('photosPalette');
        this.cameraInput = this.createFileInput(true);
        this.libraryInput = this.createFileInput(false);
        this.activeElement = null;
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

    init() {
        AppState.on('mode:changed', (e) => {
            if (e.detail.mode === 'photos') {
                this.activate();
            } else {
                this.deactivate();
            }
        });
        console.log('PhotoManager initialized.');
    }

    activate() {
        console.log('Activating Photos Mode.');
        this.boundHandleCanvasClick = (e) => this.handleCanvasClick(e);
        AppState.canvas.addEventListener('click', this.boundHandleCanvasClick);
        AppState.canvas.style.cursor = 'pointer';
        CanvasManager.redraw();
    }

    deactivate() {
        if (this.boundHandleCanvasClick) {
            AppState.canvas.removeEventListener('click', this.boundHandleCanvasClick);
        }
        AppState.canvas.style.cursor = 'default';
        this.activeElement = null;
        AppState.activePhotoElement = null;
        this.photosPalette.innerHTML = '';
        CanvasManager.redraw();
        console.log('Deactivating Photos Mode.');
    }

    handleCanvasClick(event) {
        const rect = AppState.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) - AppState.viewportTransform.x;
        const y = (event.clientY - rect.top) - AppState.viewportTransform.y;

        let clickedElement = null;
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
            this.activeElement = null;
            AppState.activePhotoElement = null;
            this.photosPalette.innerHTML = '';
            CanvasManager.redraw();
        }
    }

    selectElement(element) {
        console.log('Selected element for photos:', element.content || element.alt);
        this.activeElement = element;
        AppState.activePhotoElement = element;
        
        this.buildPaletteUI();
        this.loadAndDisplayThumbnails();
        
        CanvasManager.redraw();
    }
    
    buildPaletteUI() {
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

        document.getElementById('libraryBtn').addEventListener('click', () => this.libraryInput.click());
        document.getElementById('cameraBtn').addEventListener('click', () => this.cameraInput.click());
    }

    async handleFileSelected(event) {
        if (!event.target.files || event.target.files.length === 0) return;
        
        const file = event.target.files[0];
        
        try {
            const photoData = await this.processImage(file);
            await this.savePhotoToDb(photoData);
        } catch (error) {
            console.error('Error processing image:', error);
            alert('Could not process the selected image.');
        }

        event.target.value = '';
    }
    
    processImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const fullSizeData = this.resizeCanvas(img, 1024, 1024);
                    // CHANGED: Use 80x80 for thumbnails to make the palette shorter.
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
        if (!this.activeElement || !AppState.currentSketchId) return;

        try {
            const sketch = await db.sketches.get(AppState.currentSketchId);
            if (!sketch) return;

            if (!sketch.photos) sketch.photos = [];
            
            const newPhoto = {
                elementId: this.activeElement.id,
                timestamp: Date.now(),
                imageData: photoData.fullSizeData,
                thumbnailData: photoData.thumbnailData
            };

            sketch.photos.push(newPhoto);
            await db.sketches.put(sketch);

            console.log('Photo saved successfully for element:', this.activeElement.id);
            this.loadAndDisplayThumbnails();

        } catch (error) {
            console.error('Failed to save photo to DB:', error);
        }
    }

    async loadAndDisplayThumbnails() {
        const container = document.getElementById('thumbnailContainer');
        if (!container || !this.activeElement || !AppState.currentSketchId) {
            if (container) container.innerHTML = '';
            return;
        }
        container.innerHTML = '';

        const sketch = await db.sketches.get(AppState.currentSketchId);
        if (!sketch || !sketch.photos) return;
        
        const elementPhotos = sketch.photos.filter(p => p.elementId === this.activeElement.id);

        elementPhotos.forEach(photo => {
            const thumbWrapper = document.createElement('div');
            thumbWrapper.className = 'photo-thumbnail-wrapper';
            
            const img = document.createElement('img');
            img.src = photo.thumbnailData; 
            
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
    }

    async deletePhoto(timestamp) {
        if (!AppState.currentSketchId) return;
        
        try {
            const sketch = await db.sketches.get(AppState.currentSketchId);
            if (!sketch || !sketch.photos) return;
            
            sketch.photos = sketch.photos.filter(p => p.timestamp !== timestamp);
            await db.sketches.put(sketch);

            console.log('Photo deleted successfully.');
            this.loadAndDisplayThumbnails();
        } catch (error) {
            console.error('Failed to delete photo:', error);
        }
    }
}
