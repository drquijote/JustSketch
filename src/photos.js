// src/photos.js
import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { photoHelperButtons } from './photoHelperButtons.js';

export class PhotoManager {
    constructor() {
        this.photosPalette = document.getElementById('photosPalette');
        this.cameraInput = this.createFileInput(true);
        this.libraryInput = this.createFileInput(false);
        this.activeElement = null;
        
        this.MAX_300DPI_SIZE = 2100;
        this.THUMBNAIL_SIZE = 80;
        this.JPEG_QUALITY = 0.75;
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
        if (!AppState.photos) AppState.photos = [];
        AppState.on('mode:changed', (e) => {
            if (e.detail.mode === 'photos') this.activate();
            else this.deactivate();
        });
        AppState.on('photos:imported', () => {
            if (AppState.currentMode === 'photos' && this.activeElement) {
                this.loadAndDisplayThumbnails();
            }
        });
        console.log('PhotoManager initialized.');
    }
 
    activate() {
        console.log('Activating Photos Mode.');
        if(photoHelperButtons && typeof photoHelperButtons.initializePhotoHelpers === 'function') {
            photoHelperButtons.initializePhotoHelpers();
        }
        this._syncHelperButtonStates();
        this.boundHandleCanvasClick = (e) => this.handleCanvasClick(e);
        AppState.canvas.addEventListener('click', this.boundHandleCanvasClick);
        CanvasManager.redraw();
    }

    deactivate() {
        if (this.boundHandleCanvasClick) {
            AppState.canvas.removeEventListener('click', this.boundHandleCanvasClick);
        }
        this.activeElement = null;
        AppState.activePhotoElement = null;
        if (this.photosPalette) this.photosPalette.innerHTML = '';
        CanvasManager.redraw();
        console.log('Deactivating Photos Mode.');
    }

    handleCanvasClick(event) {
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const x = (event.clientX - rect.left) - AppState.viewportTransform.x;
        const y = (event.clientY - rect.top) - AppState.viewportTransform.y;
        
        const buttonClick = photoHelperButtons.handleButtonClick(x, y);
        if (buttonClick) {
            let tempElement;
            if (buttonClick.polygonId === 'EXTERIOR_ONLY_PHOTOS') {
                tempElement = {
                    id: buttonClick.polygonId,
                    type: 'exterior-only',
                    content: buttonClick.button.label,
                    pictureType: buttonClick.pictureType,
                };
            } else {
                const polygon = AppState.drawnPolygons.find(p => p.id === buttonClick.polygonId);
                if (polygon) {
                    tempElement = {
                        id: buttonClick.polygonId,
                        type: 'area',
                        content: polygon.label + ' - ' + buttonClick.button.label,
                        pictureType: buttonClick.pictureType,
                    };
                }
            }
            if (tempElement) this.selectElement(tempElement);
            return;
        }

        let clickedElement = null;
        for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
            const element = AppState.placedElements[i];
            const halfWidth = element.width / 2;
            const halfHeight = element.height / 2;
            const isHit = (element.type === 'area_label') ?
                (x >= element.x - halfWidth && x <= element.x + halfWidth && y >= element.y - halfHeight && y <= element.y + halfHeight) :
                (x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height);
            if (isHit) {
                clickedElement = element;
                break;
            }
        }

        if (clickedElement) {
            this.selectElement(clickedElement);
        } else {
            this.activeElement = null;
            AppState.activePhotoElement = null;
            if (this.photosPalette) this.photosPalette.innerHTML = '';
            CanvasManager.redraw();
        }
    }

    selectElement(element) {
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
                <div class="photo-thumbnail-container" id="thumbnailContainer"></div>
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
        const file = event.target.files[0];
        if (!file || !this.activeElement) return;

        try {
            const reader = new FileReader();
            const imageDataUrl = await new Promise((resolve, reject) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageDataUrl;
            });

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let width = img.width, height = img.height;
            const aspectRatio = width / height;
            
            if (width > height) {
                if (width > this.MAX_300DPI_SIZE) { width = this.MAX_300DPI_SIZE; height = width / aspectRatio; }
            } else {
                if (height > this.MAX_300DPI_SIZE) { height = this.MAX_300DPI_SIZE; width = height * aspectRatio; }
            }
            
            canvas.width = width; canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            const fullSizeData = canvas.toDataURL('image/jpeg', this.JPEG_QUALITY);
            
            const thumbCanvas = document.createElement('canvas');
            const thumbCtx = thumbCanvas.getContext('2d');
            thumbCanvas.width = this.THUMBNAIL_SIZE; thumbCanvas.height = this.THUMBNAIL_SIZE;
            const size = Math.min(width, height);
            const sx = (width - size) / 2, sy = (height - size) / 2;
            thumbCtx.drawImage(canvas, sx, sy, size, size, 0, 0, this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE);
            const thumbnailData = thumbCanvas.toDataURL('image/jpeg', 0.8);
            
            const photo = {
                id: Date.now(),
                elementId: this.activeElement.id,
                elementType: this.activeElement.type,
                elementContent: this.activeElement.content,
                pictureType: this.activeElement.pictureType || null,
                imageData: fullSizeData,
                thumbnailData: thumbnailData,
                timestamp: new Date().toISOString(),
                dimensions: { width, height }
            };
            
            AppState.photos.push(photo);
            
            if (this.activeElement && this.activeElement.pictureType) {
                photoHelperButtons.markPhotoTaken(this.activeElement.id, this.activeElement.pictureType);
            }
            
            this.loadAndDisplayThumbnails();
            CanvasManager.redraw();
        } catch (error) {
            console.error('Error processing photo:', error);
            alert('Failed to process the photo. Please try again.');
        }
        event.target.value = '';
    }

    _syncHelperButtonStates() {
        if (!AppState.photos || AppState.photos.length === 0) return;
        AppState.photos.forEach(photo => {
            if (photo.elementId && photo.pictureType) {
                photoHelperButtons.markPhotoTaken(photo.elementId, photo.pictureType);
            }
        });
    }

    loadAndDisplayThumbnails() {
        const container = document.getElementById('thumbnailContainer');
        if (!container || !this.activeElement) {
            if (container) container.innerHTML = '';
            return;
        }
        container.innerHTML = '';

        let allElementPhotos = AppState.photos.filter(p => p.elementId === this.activeElement.id);
        let photosToShow = [];

        if (this.activeElement.pictureType) {
            photosToShow = allElementPhotos.filter(p => p.pictureType === this.activeElement.pictureType);
        } else {
            photosToShow = allElementPhotos.filter(p => !p.pictureType);
        }

        if (photosToShow.length === 0) return;

        photosToShow.forEach((photo) => {
            const thumbWrapper = document.createElement('div');
            thumbWrapper.className = 'photo-thumbnail-wrapper';
            
            const img = document.createElement('img');
            img.src = photo.thumbnailData;
            img.className = 'photo-thumbnail-image';
            
            const expandBtn = document.createElement('div');
            expandBtn.className = 'thumbnail-expand-btn';
            expandBtn.onclick = (e) => { e.stopPropagation(); this.expandPhoto(photo); };
            const expandIcon = document.createElement('img');
            expandIcon.src = 'public/expand.svg';
            expandIcon.style.cssText = 'width:100%; height:100%';
            expandBtn.appendChild(expandIcon);
            
            const deleteBtn = document.createElement('div');
            deleteBtn.className = 'thumbnail-delete-btn';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Are you sure you want to delete this photo?')) this.deletePhoto(photo.id);
            };
            const deleteIcon = document.createElement('img');
            deleteIcon.src = 'public/delete.svg';
            deleteIcon.style.cssText = 'width:100%; height:100%';
            deleteBtn.appendChild(deleteIcon);
            
            thumbWrapper.append(img, expandBtn, deleteBtn);
            container.appendChild(thumbWrapper);
        });
    }

    expandPhoto(photo) {
        const modal = document.createElement('div');
        modal.className = 'photo-expand-modal';
        modal.onclick = () => modal.remove();
        
        const modalContent = document.createElement('div');
        modalContent.className = 'photo-expand-content';
        modalContent.onclick = (e) => e.stopPropagation();
        
        const expandedImg = document.createElement('img');
        expandedImg.src = photo.imageData;
        expandedImg.className = 'photo-expanded';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'photo-expand-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => modal.remove();
        
        modalContent.append(expandedImg, closeBtn);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        setTimeout(() => modal.classList.add('active'), 10);
    }

    deletePhoto(photoId) {
        const photoIndex = AppState.photos.findIndex(p => p.id === photoId);
        if (photoIndex > -1) {
            const deletedPhoto = AppState.photos.splice(photoIndex, 1)[0];
            photoHelperButtons.unmarkPhotoTaken(deletedPhoto.elementId, deletedPhoto.pictureType);
            CanvasManager.saveAction();
            this.loadAndDisplayThumbnails();
        }
    }
}