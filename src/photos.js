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
 
    // UPDATED: Use robust sync method
    activate() {
        console.log('Activating Photos Mode.');
        if(photoHelperButtons && typeof photoHelperButtons.initializePhotoHelpers === 'function') {
            photoHelperButtons.initializePhotoHelpers();
        }
        // UPDATED: Use robust sync method
        this.syncHelperButtonStatesRobust();
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

    // UPDATED: Robust helper button state synchronization
    syncHelperButtonStatesRobust() {
        console.log('🔄 Starting robust helper button state synchronization...');
        
        // Delegate to photoHelperButtons for the actual sync logic
        if (photoHelperButtons && typeof photoHelperButtons.syncHelperButtonStatesRobust === 'function') {
            photoHelperButtons.syncHelperButtonStatesRobust();
        } else {
            console.warn('⚠️ photoHelperButtons.syncHelperButtonStatesRobust not available, falling back to legacy sync');
            this._syncHelperButtonStates();
        }
    }

    // LEGACY: Keep the old method for backward compatibility
    _syncHelperButtonStates() {
        console.log('⚠️ Using legacy sync method, consider upgrading to syncHelperButtonStatesRobust()');
        if (!AppState.photos || AppState.photos.length === 0) return;
        AppState.photos.forEach(photo => {
            if (photo.elementId && photo.pictureType) {
                photoHelperButtons.markPhotoTaken(photo.elementId, photo.pictureType);
            }
        });
    }

    updatePhotoCaption(photoId, newCaption) {
        try {
            console.log('Updating photo caption:', { photoId, newCaption });
            
            let photo = null;
            let photoIndex = -1;
            
            // First try to find by direct ID
            photoIndex = AppState.photos.findIndex(p => p.id && p.id.toString() === photoId);
            
            // If not found, try elementId + index combination
            if (photoIndex === -1) {
                const parts = photoId.split('_');
                if (parts.length >= 2) {
                    const elementId = parts[0];
                    const index = parseInt(parts[1]);
                    const photosForElement = AppState.photos.filter(p => p.elementId === elementId);
                    if (photosForElement[index]) {
                        photo = photosForElement[index];
                        photoIndex = AppState.photos.indexOf(photo);
                    }
                }
            } else {
                photo = AppState.photos[photoIndex];
            }
            
            if (!photo || photoIndex === -1) {
                console.error('Photo not found:', photoId);
                return false;
            }
            
            // Update the photo's caption
            photo.elementContent = newCaption;
            
            // Save the changes
            CanvasManager.saveAction();
            
            // Refresh thumbnails if needed
            if (this.activeElement && this.activeElement.id === photo.elementId) {
                this.loadAndDisplayThumbnails();
            }
            
            console.log('Photo caption updated successfully');
            return true;
            
        } catch (error) {
            console.error('Error updating photo caption:', error);
            return false;
        }
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
                // *** UPDATED: Use full photo label for photo content ***
                const polygon = { label: 'Exterior Only' }; // Mock polygon for getFullPhotoLabel
                const fullLabel = photoHelperButtons.getFullPhotoLabel(buttonClick.pictureType, polygon);
                
                tempElement = {
                    id: buttonClick.polygonId,
                    type: 'exterior-only',
                    content: fullLabel, // Use full label
                    pictureType: buttonClick.pictureType,
                };
            } else {
                const polygon = AppState.drawnPolygons.find(p => p.id === buttonClick.polygonId);
                if (polygon) {
                    // *** UPDATED: Use full photo label for photo content ***
                    const fullLabel = photoHelperButtons.getFullPhotoLabel(buttonClick.pictureType, polygon);
                    
                    console.log(`🔍 Button clicked: ${buttonClick.pictureType} on ${polygon.label}`);
                    console.log(`📸 Full photo label: ${fullLabel}`);
                    
                    tempElement = {
                        id: buttonClick.polygonId,
                        type: 'area',
                        content: fullLabel, // Use full label instead of abbreviated
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
        
        // *** NEW: Modify content for room elements inside Floor, ADU, or UNIT areas ***
        if (element.type === 'room') {
            // Check if this room element is inside a Floor, ADU, or UNIT area
            const parentArea = AppState.drawnPolygons.find(polygon => {
                // Check if the polygon label contains "floor", "adu", or "unit" (case insensitive)
                const label = polygon.label ? polygon.label.toLowerCase() : '';
                const isFloorArea = label.includes('floor');
                const isADUArea = label.includes('adu');
                const isUNITArea = label.includes('unit');
                
                if (!isFloorArea && !isADUArea && !isUNITArea) return false;
                
                // Check if the room element center point is inside this polygon
                const roomCenterX = element.x + element.width / 2;
                const roomCenterY = element.y + element.height / 2;
                const point = { x: roomCenterX, y: roomCenterY };
                return this.isPointInsidePolygon(point, polygon.path);
            });
            
            // If we found a parent area, modify the content to include the appropriate prefix
            if (parentArea) {
                // Define interior room types that should get the prefix
                const interiorRoomTypes = [
                    'Kitchen', 'Kitchennette', 'Living', 'Dining', 'Family', 'Den', 
                    'Bedroom', 'Bedroom.M', 'Bath', 'Bath.M', '1/2 Bath', 
                    'Laundry', 'Entry', 'Closet', 'Office', 'Pantry', 'Hallway', 'Bar'
                ];
                
                // Check if this room type should get the prefix
                if (interiorRoomTypes.includes(element.content)) {
                    const label = parentArea.label.toLowerCase();
                    let prefix = '';
                    
                    if (label.includes('floor')) {
                        prefix = 'Subject Interior';
                    } else if (label.includes('adu')) {
                        // Extract ADU number if present (e.g., "ADU 1", "ADU-1")
                        const aduMatch = parentArea.label.match(/adu\s*[-\s]*(\d+)/i);
                        if (aduMatch) {
                            prefix = `ADU-${aduMatch[1]} Interior`;
                        } else {
                            prefix = 'ADU Interior';
                        }
                    } else if (label.includes('unit')) {
                        // Extract UNIT number if present (e.g., "UNIT 1", "UNIT-1")
                        const unitMatch = parentArea.label.match(/unit\s*[-\s]*(\d+)/i);
                        if (unitMatch) {
                            prefix = `UNIT-${unitMatch[1]} Interior`;
                        } else {
                            prefix = 'UNIT Interior';
                        }
                    }
                    
                    // Create a modified element with the appropriate prefix for photos
                    this.activeElement = {
                        ...element,
                        content: `${prefix} ${element.content}`
                    };
                }
            }
        }
        
        this.buildPaletteUI();
        this.loadAndDisplayThumbnails();
        CanvasManager.redraw();
    }

    // *** NEW: Point-in-polygon helper function ***
    isPointInsidePolygon(point, polygonPath) {
        let inside = false;
        const n = polygonPath.length;
        
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygonPath[i].x, yi = polygonPath[i].y;
            const xj = polygonPath[j].x, yj = polygonPath[j].y;
            
            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        
        return inside;
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
        
        const libraryBtn = document.getElementById('libraryBtn');
        const cameraBtn = document.getElementById('cameraBtn');
        
        if (libraryBtn) {
            libraryBtn.addEventListener('click', () => this.openLibrary());
        }
        
        if (cameraBtn) {
            cameraBtn.addEventListener('click', () => this.openCamera());
        }
    }

    openLibrary() {
        this.libraryInput.click();
    }

    openCamera() {
        this.cameraInput.click();
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
                elementContent: this.activeElement.content, // This now contains the FULL label
                pictureType: this.activeElement.pictureType || null,
                imageData: fullSizeData,
                thumbnailData: thumbnailData,
                timestamp: new Date().toISOString(),
                dimensions: { width, height }
            };
            
            AppState.photos.push(photo);
            
            // *** UPDATED: Use robust photo marking ***
            if (this.activeElement && this.activeElement.pictureType) {
                // Find the polygon for robust marking
                const polygon = AppState.drawnPolygons.find(p => p.id === this.activeElement.id);
                if (polygon && photoHelperButtons.generatePhotoSignature) {
                    const signature = photoHelperButtons.generatePhotoSignature(polygon, this.activeElement.pictureType);
                    if (signature) {
                        photoHelperButtons.markPhotoTakenBySignature(signature);
                    }
                } else {
                    // Fallback to legacy method
                    photoHelperButtons.markPhotoTaken(this.activeElement.id, this.activeElement.pictureType);
                }
            }
            
            this.loadAndDisplayThumbnails();
            CanvasManager.redraw();
        } catch (error) {
            console.error('Error processing photo:', error);
            alert('Failed to process the photo. Please try again.');
        }
        event.target.value = '';
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
            
            // *** UPDATED: Use robust unmarking ***
            if (deletedPhoto.pictureType) {
                const polygon = AppState.drawnPolygons.find(p => p.id === deletedPhoto.elementId);
                if (polygon && photoHelperButtons.generatePhotoSignature) {
                    const signature = photoHelperButtons.generatePhotoSignature(polygon, deletedPhoto.pictureType);
                    if (signature) {
                        photoHelperButtons.photoButtonStates.set(signature, false);
                        // Update button visual state
                        for (const buttons of photoHelperButtons.helperButtons.values()) {
                            for (const button of buttons) {
                                if (button.polygonId === deletedPhoto.elementId && button.pictureType === deletedPhoto.pictureType) {
                                    button.taken = false;
                                }
                            }
                        }
                    }
                } else {
                    // Fallback to legacy method
                    photoHelperButtons.unmarkPhotoTaken(deletedPhoto.elementId, deletedPhoto.pictureType);
                }
            }
            
            CanvasManager.saveAction();
            this.loadAndDisplayThumbnails();
            CanvasManager.redraw();
        }
    }

    // Utility method for debugging
    debugPhotoStatus() {
        console.log('=== PHOTO DEBUG STATUS ===');
        console.log(`Total photos in AppState: ${AppState.photos ? AppState.photos.length : 0}`);
        
        if (AppState.photos && AppState.photos.length > 0) {
            const photosByElement = {};
            AppState.photos.forEach(photo => {
                if (!photosByElement[photo.elementId]) {
                    photosByElement[photo.elementId] = [];
                }
                photosByElement[photo.elementId].push(photo);
            });
            
            Object.entries(photosByElement).forEach(([elementId, photos]) => {
                console.log(`Element ${elementId}: ${photos.length} photos`);
                photos.forEach((photo, index) => {
                    console.log(`  Photo ${index}: ${photo.imageData ? 'Image data OK' : 'Missing image data'}, ${photo.thumbnailData ? 'Thumbnail OK' : 'Missing thumbnail'}`);
                });
            });
        }
        
        console.log(`Current mode: ${AppState.currentMode}`);
        console.log(`Active element: ${this.activeElement ? this.activeElement.id : 'None'}`);
        
        if (AppState.currentMode === 'photos' && this.activeElement) {
            const elementPhotos = AppState.photos.filter(p => p.elementId === this.activeElement.id);
            console.log(`Photos for current active element: ${elementPhotos.length}`);
        }
        
        console.log('=== END PHOTO DEBUG ===');
        
        return {
            totalPhotos: AppState.photos.length,
            photosByElement: this._groupPhotosByElement(AppState.photos),
            currentMode: AppState.currentMode,
            activeElement: this.activeElement?.id || null
        };
    }

    _groupPhotosByElement(photos) {
        const grouped = {};
        photos.forEach(photo => {
            if (!grouped[photo.elementId]) {
                grouped[photo.elementId] = [];
            }
            grouped[photo.elementId].push(photo);
        });
        return grouped;
    }

    refreshPhotoDisplay() {
        if (AppState.currentMode === 'photos' && this.activeElement) {
            console.log('🔄 Manually refreshing photo display...');
            this.loadAndDisplayThumbnails();
        } else {
            console.log('ℹ️ Not in photos mode or no active element selected');
        }
    }
}