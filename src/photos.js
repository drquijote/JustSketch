// src/photos.js - UPDATED FOR JSON STORAGE AT 300 DPI

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { photoHelperButtons } from './photoHelperButtons.js';  // ADD THIS LINE


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
    // ---- THIS IS THE FIX ----
    // First, sync the states of helper buttons from any existing photos.
    // This ensures they are grayed out correctly upon entering photo mode.
    this._syncHelperButtonStates();
    // ---- END FIX ----

    this.boundHandleCanvasClick = (e) => this.handleCanvasClick(e);
    
    // Add click listener to canvas, not viewport, to avoid interfering with panning
    AppState.canvas.addEventListener('click', this.boundHandleCanvasClick);
    
    // Don't change the cursor to pointer - keep it as default to allow grab cursor for panning
    // AppState.canvas.style.cursor = 'pointer'; // REMOVED
    
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

    // CHECK FOR HELPER BUTTON CLICKS FIRST
    const buttonClick = photoHelperButtons.handleButtonClick(x, y);
    if (buttonClick) {
        console.log(`Photo helper button clicked: ${buttonClick.pictureType} for polygon ${buttonClick.polygonId}`);
        
        // Find the polygon to get its label
        const polygon = AppState.drawnPolygons.find(p => p.id === buttonClick.polygonId);
        if (polygon) {
            // Create element object that matches regular elements structure
            const tempElement = {
                id: buttonClick.polygonId,
                type: 'area',
                content: polygon.label + ' - ' + buttonClick.pictureType, // Include picture type in label
                alt: polygon.label,
                pictureType: buttonClick.pictureType,
                // These properties ensure it works like regular elements
                width: 100,
                height: 50,
                x: polygon.centroid.x,
                y: polygon.centroid.y
            };
            
            // USE THE EXACT SAME selectElement FUNCTION
            this.selectElement(tempElement);
        }
        
        return; // Stop processing other clicks
    }

    // EXISTING CODE - Check for regular element clicks
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
        console.log('%cFAILURE: No element was found at the clicked position.', 'color: lightcoral;');
        // Deselect if clicking on empty space
        this.activeElement = null;
        AppState.activePhotoElement = null;
        // Clear the photo palette
        if (this.photosPalette) {
            this.photosPalette.innerHTML = '';
        }
        CanvasManager.redraw();
    }
}

 selectElement(element) {
    console.log('Selected element for photos:', element.content || element.alt || 'Unknown');
    console.log('Element details:', element);
    
    this.activeElement = element;
    AppState.activePhotoElement = element;
    
    // Always rebuild the palette UI when selecting an element
    this.buildPaletteUI();
    
    // Then load and display any existing thumbnails
    this.loadAndDisplayThumbnails();
    
    // Redraw canvas to show selection
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

 // src/photos.js

 // src/photos.js

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

        // Resize image to 300 DPI dimensions
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let width = img.width;
        let height = img.height;
        const aspectRatio = width / height;
        
        if (width > height) {
            if (width > this.MAX_300DPI_SIZE) {
                width = this.MAX_300DPI_SIZE;
                height = width / aspectRatio;
            }
        } else {
            if (height > this.MAX_300DPI_SIZE) {
                height = this.MAX_300DPI_SIZE;
                width = height * aspectRatio;
            }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        const fullSizeData = canvas.toDataURL('image/jpeg', this.JPEG_QUALITY);
        
        // Create thumbnail
        const thumbCanvas = document.createElement('canvas');
        const thumbCtx = thumbCanvas.getContext('2d');
        thumbCanvas.width = this.THUMBNAIL_SIZE;
        thumbCanvas.height = this.THUMBNAIL_SIZE;
        
        const size = Math.min(width, height);
        const sx = (width - size) / 2;
        const sy = (height - size) / 2;
        
        thumbCtx.drawImage(canvas, sx, sy, size, size, 0, 0, this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE);
        const thumbnailData = thumbCanvas.toDataURL('image/jpeg', 0.8);
        
        // Create photo object
        const photo = {
            id: Date.now(),
            elementId: this.activeElement.id,
            elementType: this.activeElement.type,
            elementContent: this.activeElement.content,
            pictureType: this.activeElement.pictureType || null,
            // **** THIS IS THE FIX: The property is now named 'imageData' ****
            imageData: fullSizeData,
            // **** END FIX ****
            thumbnailData: thumbnailData,
            timestamp: new Date().toISOString(),
            dimensions: { width, height }
        };
        
        // Add to AppState photos
        AppState.photos.push(photo);
        
        // Mark the helper button as taken if this was from a helper button click
        if (this.activeElement && this.activeElement.pictureType) {
            photoHelperButtons.markPhotoTaken(this.activeElement.id, this.activeElement.pictureType);
        }
        
        console.log(`Photo added for element ${this.activeElement.id}. Total photos: ${AppState.photos.length}`);
        console.log(`Photo size: ${Math.round(fullSizeData.length / 1024)}KB (300 DPI: ${width}x${height}px)`);
        
        this.loadAndDisplayThumbnails();
        CanvasManager.redraw();
        
    } catch (error) {
        console.error('Error processing photo:', error);
        alert('Failed to process the photo. Please try again.');
    }
    
    event.target.value = '';
}


// src/photos.js

_syncHelperButtonStates() {
    console.log('Syncing helper button states from existing photos...');
    if (!AppState.photos || AppState.photos.length === 0) {
        console.log('No photos in state to sync.');
        return;
    }

    let syncedCount = 0;
    // Go through every photo in the application state
    AppState.photos.forEach(photo => {
        // A photo is from a helper button if it has both an elementId and a pictureType
        if (photo.elementId && photo.pictureType) {
            // Use the existing function to mark this button's photo as 'taken'
            photoHelperButtons.markPhotoTaken(photo.elementId, photo.pictureType);
            syncedCount++;
        }
    });

    console.log(`Sync complete. Marked ${syncedCount} helper buttons as 'taken'.`);
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

// src/photos.js

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

    // --- THIS IS THE FIX ---
    // First, get all photos associated with the main element ID.
    let allElementPhotos = AppState.photos.filter(p => p.elementId === this.activeElement.id);
    let photosToShow = [];

    // If the selected element is from a helper button (it will have a pictureType),
    // we must further filter the photos to only show ones for that specific type.
    if (this.activeElement.pictureType) {
        photosToShow = allElementPhotos.filter(p => p.pictureType === this.activeElement.pictureType);
        console.log(`DEBUG: Filtering for helper button. Found ${photosToShow.length} photos with pictureType "${this.activeElement.pictureType}".`);
    } else {
        // For regular room/icon labels, only show photos that do NOT have a pictureType.
        // This prevents helper button photos from appearing on regular label selections.
        photosToShow = allElementPhotos.filter(p => !p.pictureType);
        console.log(`DEBUG: Filtering for regular element. Found ${photosToShow.length} photos without a pictureType.`);
    }
    // --- END FIX ---

    if (photosToShow.length === 0) {
        console.log('DEBUG: No photos found for this specific selection.');
        return;
    }

    photosToShow.forEach((photo, index) => {
        console.log(`DEBUG: Creating thumbnail ${index + 1}/${photosToShow.length}`);
        
        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = 'photo-thumbnail-wrapper';
        
        const img = document.createElement('img');
        img.src = photo.thumbnailData;
        img.className = 'photo-thumbnail-image';
        
        const expandBtn = document.createElement('div');
        expandBtn.className = 'thumbnail-expand-btn';
        expandBtn.onclick = (e) => {
            e.stopPropagation();
            this.expandPhoto(photo);
        };
        
        const expandIcon = document.createElement('img');
        expandIcon.src = 'public/expand.svg';
        expandIcon.style.width = '100%';
        expandIcon.style.height = '100%';
        expandBtn.appendChild(expandIcon);
        
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'thumbnail-delete-btn';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm('Are you sure you want to delete this photo?')) {
                this.deletePhoto(photo.timestamp);
            }
        };
        
        const deleteIcon = document.createElement('img');
        deleteIcon.src = 'public/delete.svg';
        deleteIcon.style.width = '100%';
        deleteIcon.style.height = '100%';
        deleteBtn.appendChild(deleteIcon);
        
        thumbWrapper.appendChild(img);
        thumbWrapper.appendChild(expandBtn);
        thumbWrapper.appendChild(deleteBtn);
        container.appendChild(thumbWrapper);
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