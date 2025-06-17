// src/photos.js - UPDATED FOR JSON STORAGE AT 300 DPI

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

/**
 * Updated PhotoManager that stores photos directly in the app state
 * for JSON export compatibility, with 300 DPI optimization
 */
export class PhotoManager {
    constructor() {
        this.photosPalette = document.getElementById('photosPalette');
        this.cameraInput = this.createFileInput(true);
        this.libraryInput = this.createFileInput(false);
        this.activeElement = null;
        
        // 300 DPI sizing for mobile-friendly dimensions
        // Using 7" x 7" maximum (square) to handle both portrait and landscape orientations
        this.MAX_300DPI_SIZE = 2100;   // 7 inches * 300 DPI = 2100 pixels
        this.THUMBNAIL_SIZE = 80;      // Keep thumbnails small for UI
        this.JPEG_QUALITY = 0.75;     // Good balance of quality vs size
        
        // Alternative common mobile photo sizes at 300 DPI:
        // 5" x 7" = 1500 x 2100 pixels
        // 4" x 6" = 1200 x 1800 pixels  
        // 6" x 8" = 1800 x 2400 pixels
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
        // Initialize photos array in AppState if it doesn't exist
        if (!AppState.photos) {
            AppState.photos = [];
        }

        AppState.on('mode:changed', (e) => {
            console.log(`DEBUG: PhotoManager detected "mode:changed" event. New mode: "${e.detail.mode}"`);

            if (e.detail.mode === 'photos') {
                this.activate();
            } else {
                this.deactivate();
            }
        });

        // CRITICAL FIX: Listen for photo import events
        AppState.on('photos:imported', (e) => {
            console.log('🔄 PhotoManager: Received photos:imported event', e.detail);
            const { photoCount, photosByElement } = e.detail;
            
            // Show a helpful message about imported photos
            console.log(`📸 ${photoCount} photos were imported across ${Object.keys(photosByElement).length} elements`);
            
            // Log which elements have photos for debugging
            Object.keys(photosByElement).forEach(elementId => {
                const count = photosByElement[elementId].length;
                console.log(`   Element ${elementId}: ${count} photo(s)`);
            });
            
            // If we're currently in photos mode, refresh the display
            if (AppState.currentMode === 'photos' && this.activeElement) {
                console.log('🔄 Refreshing photo display for current active element...');
                this.loadAndDisplayThumbnails();
            }
        });
        
        console.log('PhotoManager initialized with JSON storage.');
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
        console.log('%cDEBUG: PhotoManager.handleCanvasClick() HAS FIRED!', 'color: lightgreen; font-weight: bold;');

        // Get the correct coordinates accounting for viewport transform
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const x = (event.clientX - rect.left) - AppState.viewportTransform.x;
        const y = (event.clientY - rect.top) - AppState.viewportTransform.y;
        
        console.log(`DEBUG: Click detected at canvas coordinates: x=${x.toFixed(1)}, y=${y.toFixed(1)}`);

        let clickedElement = null;
        console.log('DEBUG: Starting to loop through elements to find a match...');
        console.log(`DEBUG: Total elements to check: ${AppState.placedElements.length}`);

        for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
            const element = AppState.placedElements[i];
            let isHit = false;

            // Check element type and use the correct boundary calculation
            if (element.type === 'area_label') {
                // For area_labels, x/y is the CENTER, so we need to check bounds differently
                const halfWidth = element.width / 2;
                const halfHeight = element.height / 2;
                isHit = (x >= element.x - halfWidth && x <= element.x + halfWidth &&
                         y >= element.y - halfHeight && y <= element.y + halfHeight);
                
                console.log(`- Checking area_label "${element.content}" at center (${element.x}, ${element.y}) with bounds [${element.x - halfWidth}, ${element.x + halfWidth}] x [${element.y - halfHeight}, ${element.y + halfHeight}]... HIT: ${isHit}`);
            } else {
                // For all other elements (room, icon), x/y is the TOP-LEFT corner
                isHit = (x >= element.x && x <= element.x + element.width &&
                         y >= element.y && y <= element.y + element.height);
                
                console.log(`- Checking ${element.type} "${element.content || element.alt}" at top-left (${element.x}, ${element.y}) with bounds [${element.x}, ${element.x + element.width}] x [${element.y}, ${element.y + element.height}]... HIT: ${isHit}`);
            }

            if (isHit) {
                clickedElement = element;
                break;
            }
        }

        if (clickedElement) {
            console.log('%cSUCCESS: An element was clicked and found!', 'color: lightgreen;', clickedElement);
            this.selectElement(clickedElement);
        } else {
            console.log('%cFAILURE: No element was found at the clicked position.', 'color: red;');
            this.activeElement = null;
            AppState.activePhotoElement = null;
            if (this.photosPalette) {
                this.photosPalette.innerHTML = '';
            }
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
        console.log('%c=== IMAGE UPLOAD DEBUG START ===', 'color: blue; font-weight: bold; font-size: 16px;');
        
        if (!event.target.files || event.target.files.length === 0) {
            console.log('%cDEBUG: No files selected', 'color: red;');
            return;
        }
        
        const file = event.target.files[0];
        console.log('DEBUG: File selected:', {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: new Date(file.lastModified)
        });
        
        if (!this.activeElement) {
            console.log('%cDEBUG: ERROR - No active element selected!', 'color: red; font-weight: bold;');
            alert('Please select a room or element first before uploading a photo.');
            return;
        }
        
        console.log('DEBUG: Active element:', this.activeElement);
        
        try {
            console.log('DEBUG: Starting image processing...');
            const photoData = await this.processImage(file);
            console.log('DEBUG: Image processing completed, data size:', {
                fullSize: photoData.fullSizeData.length,
                thumbnail: photoData.thumbnailData.length
            });
            
            console.log('DEBUG: Saving photo to AppState...');
            this.savePhotoToAppState(photoData);
            console.log('DEBUG: Photo save completed successfully!');
            
        } catch (error) {
            console.error('%cDEBUG: ERROR during upload process:', 'color: red; font-weight: bold;', error);
            alert('Could not process the selected image: ' + error.message);
        }

        event.target.value = '';
        console.log('%c=== IMAGE UPLOAD DEBUG END ===', 'color: blue; font-weight: bold; font-size: 16px;');
    }
    
    processImage(file) {
        console.log('DEBUG: processImage() called with file:', file.name);
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                console.log('DEBUG: FileReader loaded successfully, data length:', e.target.result.length);
                
                const img = new Image();
                img.onload = () => {
                    console.log('DEBUG: Image loaded successfully, dimensions:', img.width, 'x', img.height);
                    
                    try {
                        console.log(`DEBUG: Creating mobile-optimized canvas (max ${this.MAX_300DPI_SIZE}x${this.MAX_300DPI_SIZE})...`);
                        const fullSizeData = this.resizeToOptimalSize(img, this.MAX_300DPI_SIZE, this.MAX_300DPI_SIZE);
                        console.log('DEBUG: Mobile-optimized canvas created, data length:', fullSizeData.length);
                        
                        console.log(`DEBUG: Creating thumbnail canvas (${this.THUMBNAIL_SIZE}x${this.THUMBNAIL_SIZE})...`);
                        const thumbnailData = this.resizeToOptimalSize(img, this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE);
                        console.log('DEBUG: Thumbnail canvas created, data length:', thumbnailData.length);
                        
                        resolve({ fullSizeData, thumbnailData });
                    } catch (canvasError) {
                        console.error('DEBUG: Error during canvas processing:', canvasError);
                        reject(canvasError);
                    }
                };
                img.onerror = (imgError) => {
                    console.error('DEBUG: Error loading image:', imgError);
                    reject(new Error('Failed to load image'));
                };
                img.src = e.target.result;
            };
            reader.onerror = (readerError) => {
                console.error('DEBUG: Error reading file:', readerError);
                reject(new Error('Failed to read file'));
            };
            reader.readAsDataURL(file);
        });
    }
    
    /**
     * Resizes image optimally for 300 DPI mobile photos while maintaining aspect ratio
     * Target: 7"x7" maximum (2100x2100 pixels) to handle mobile landscape/portrait
     */
    resizeToOptimalSize(img, maxWidth, maxHeight) {
        console.log(`DEBUG: resizeToOptimalSize() - input: ${img.width}x${img.height}, max: ${maxWidth}x${maxHeight}`);
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate optimal dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        
        // Scale down if image is larger than maximum dimensions
        const widthRatio = maxWidth / width;
        const heightRatio = maxHeight / height;
        const scaleRatio = Math.min(widthRatio, heightRatio, 1); // Never scale up
        
        width = Math.floor(width * scaleRatio);
        height = Math.floor(height * scaleRatio);
        
        // Log the resulting print size at 300 DPI
        const printWidthInches = (width / 300).toFixed(1);
        const printHeightInches = (height / 300).toFixed(1);
        console.log(`DEBUG: Calculated dimensions: ${width}x${height} (${printWidthInches}"x${printHeightInches}" at 300 DPI, scale: ${scaleRatio.toFixed(3)})`);
        
        // Set canvas size to exact calculated dimensions
        canvas.width = width;
        canvas.height = height;
        
        // Use high-quality rendering settings
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw the image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to JPEG with optimized quality
        const dataURL = canvas.toDataURL('image/jpeg', this.JPEG_QUALITY);
        console.log(`DEBUG: Canvas converted to JPEG (quality: ${this.JPEG_QUALITY}), data length: ${dataURL.length}`);
        
        return dataURL;
    }

    /**
     * Save photo directly to AppState for JSON export compatibility
     */
    savePhotoToAppState(photoData) {
        console.log('DEBUG: savePhotoToAppState() called');
        
        if (!this.activeElement) {
            console.log('%cDEBUG: ERROR - No active element for photo save!', 'color: red;');
            return;
        }
        
        console.log('DEBUG: Creating new photo entry for AppState...');

        const newPhoto = {
            elementId: this.activeElement.id,
            timestamp: Date.now(),
            imageData: photoData.fullSizeData,
            thumbnailData: photoData.thumbnailData,
            // Store metadata for reference
            metadata: {
                addedDate: new Date().toISOString(),
                elementType: this.activeElement.type,
                elementContent: this.activeElement.content || this.activeElement.alt
            }
        };
        
        console.log('DEBUG: Created new photo object:', {
            elementId: newPhoto.elementId,
            timestamp: newPhoto.timestamp,
            imageDataLength: newPhoto.imageData.length,
            thumbnailDataLength: newPhoto.thumbnailData.length,
            metadata: newPhoto.metadata
        });

        // Add photo to AppState photos array
        AppState.photos.push(newPhoto);
        console.log('DEBUG: Added photo to AppState, total count:', AppState.photos.length);
        
        // Save the action for undo/redo functionality
        CanvasManager.saveAction();
        
        // Update thumbnails display
        console.log('DEBUG: Calling loadAndDisplayThumbnails()...');
        this.loadAndDisplayThumbnails();
        
        console.log('✅ Photo successfully saved to AppState!');
    }

 loadAndDisplayThumbnails() {
    console.log('DEBUG: loadAndDisplayThumbnails() called');
    
    const container = document.getElementById('thumbnailContainer');
    if (!container) {
        console.log('%cDEBUG: ERROR - thumbnailContainer not found!', 'color: red;');
        return;
    }
    
    if (!this.activeElement) {
        console.log('DEBUG: No active element, clearing container');
        container.innerHTML = '';
        return;
    }
    
    console.log('DEBUG: Clearing existing thumbnails...');
    container.innerHTML = '';

    // Filter photos for the current active element
    const elementPhotos = AppState.photos.filter(p => p.elementId === this.activeElement.id);
    console.log('DEBUG: Photos for active element:', elementPhotos.length);

    if (elementPhotos.length === 0) {
        console.log('DEBUG: No photos found for active element');
        return;
    }

    elementPhotos.forEach((photo, index) => {
        console.log(`DEBUG: Creating thumbnail ${index + 1}/${elementPhotos.length}`);
        
        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = 'photo-thumbnail-wrapper';
        
        const img = document.createElement('img');
        img.src = photo.thumbnailData;
        img.className = 'photo-thumbnail-image';
        img.onload = () => {
            console.log(`DEBUG: Thumbnail ${index + 1} loaded successfully`);
        };
        img.onerror = () => {
            console.log(`%cDEBUG: ERROR loading thumbnail ${index + 1}`, 'color: red;');
        };
        
        // Create expand button container
        const expandBtn = document.createElement('div');
        expandBtn.className = 'thumbnail-expand-btn';
        expandBtn.onclick = (e) => {
            e.stopPropagation();
            this.expandPhoto(photo);
        };
        
        // Create expand icon
        const expandIcon = document.createElement('img');
        expandIcon.src = 'public/expand.svg';
        expandIcon.style.width = '100%';
        expandIcon.style.height = '100%';
        expandBtn.appendChild(expandIcon);
        
        // Create delete button container
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'thumbnail-delete-btn';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm('Are you sure you want to delete this photo?')) {
                this.deletePhoto(photo.timestamp);
            }
        };
        
        // Create delete icon
        const deleteIcon = document.createElement('img');
        deleteIcon.src = 'public/delete.svg';
        deleteIcon.style.width = '100%';
        deleteIcon.style.height = '100%';
        deleteBtn.appendChild(deleteIcon);
        
        thumbWrapper.appendChild(img);
        thumbWrapper.appendChild(expandBtn);
        thumbWrapper.appendChild(deleteBtn);
        container.appendChild(thumbWrapper);
        
        console.log(`DEBUG: Thumbnail ${index + 1} added to container`);
    });
    
    console.log('DEBUG: All thumbnails processed and added to UI');
}

// STEP 2: ADD this new method to photos.js (after loadAndDisplayThumbnails):

expandPhoto(photo) {
    console.log('Expanding photo:', photo.timestamp);
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'photo-expand-modal';
    modal.onclick = () => modal.remove(); // Click anywhere to close
    
    // Create modal content container
    const modalContent = document.createElement('div');
    modalContent.className = 'photo-expand-content';
    modalContent.onclick = (e) => e.stopPropagation(); // Prevent closing when clicking image
    
    // Create the expanded image
    const expandedImg = document.createElement('img');
    expandedImg.src = photo.imageData;
    expandedImg.className = 'photo-expanded';
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'photo-expand-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => modal.remove();
    
    // Assemble modal
    modalContent.appendChild(expandedImg);
    modalContent.appendChild(closeBtn);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Add class after a small delay for animation
    setTimeout(() => modal.classList.add('active'), 10);
}

    deletePhoto(timestamp) {
        console.log('DEBUG: Deleting photo with timestamp:', timestamp);
        
        // Find and remove the photo from AppState
        const photoIndex = AppState.photos.findIndex(p => p.timestamp === timestamp);
        if (photoIndex > -1) {
            AppState.photos.splice(photoIndex, 1);
            console.log('Photo deleted successfully from AppState.');
            
            // Save the action for undo/redo
            CanvasManager.saveAction();
            
            // Refresh thumbnails display
            this.loadAndDisplayThumbnails();
        } else {
            console.error('Photo not found for deletion.');
        }
    }

    /**
     * Get all photos for a specific element (useful for export/display)
     */
    getPhotosForElement(elementId) {
        return AppState.photos.filter(photo => photo.elementId === elementId);
    }

    /**
     * Get total number of photos in the current sketch
     */
    getTotalPhotoCount() {
        return AppState.photos.length;
    }

    /**
     * Get approximate total size of all photos in bytes (for export size estimation)
     */
    getTotalPhotoSize() {
        return AppState.photos.reduce((total, photo) => {
            // Rough estimation: base64 data URL length correlates to byte size
            return total + (photo.imageData.length * 0.75) + (photo.thumbnailData.length * 0.75);
        }, 0);
    }
}