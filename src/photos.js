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
            console.log(`DEBUG: PhotoManager detected "mode:changed" event. New mode: "${e.detail.mode}"`);

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

            // *** THIS IS THE CRITICAL FIX ***
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
        console.log('DEBUG: Current sketch ID:', AppState.currentSketchId);
        
        try {
            console.log('DEBUG: Starting image processing...');
            const photoData = await this.processImage(file);
            console.log('DEBUG: Image processing completed, data size:', {
                fullSize: photoData.fullSizeData.length,
                thumbnail: photoData.thumbnailData.length
            });
            
            console.log('DEBUG: Starting database save...');
            await this.savePhotoToDb(photoData);
            console.log('DEBUG: Database save completed successfully!');
            
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
                        console.log('DEBUG: Creating full-size canvas (max 1024x1024)...');
                        const fullSizeData = this.resizeCanvas(img, 1024, 1024);
                        console.log('DEBUG: Full-size canvas created, data length:', fullSizeData.length);
                        
                        console.log('DEBUG: Creating thumbnail canvas (80x80)...');
                        const thumbnailData = this.resizeCanvas(img, 80, 80);
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
    
    resizeCanvas(img, maxWidth, maxHeight) {
        console.log(`DEBUG: resizeCanvas() called - input: ${img.width}x${img.height}, max: ${maxWidth}x${maxHeight}`);
        
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
        
        console.log(`DEBUG: Calculated output dimensions: ${width}x${height}`);
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataURL = canvas.toDataURL('image/jpeg', 0.85);
        console.log(`DEBUG: Canvas converted to data URL, length: ${dataURL.length}`);
        
        return dataURL;
    }

    async savePhotoToDb(photoData) {
        console.log('DEBUG: savePhotoToDb() called');
        
        if (!this.activeElement) {
            console.log('%cDEBUG: ERROR - No active element for photo save!', 'color: red;');
            return;
        }
        
        if (!AppState.currentSketchId) {
            console.log('%cDEBUG: ERROR - No current sketch ID for photo save!', 'color: red;');
            alert('Please save your sketch first before adding photos.');
            return;
        }
        
        console.log('DEBUG: Attempting to get sketch from DB, ID:', AppState.currentSketchId);

        try {
            const sketch = await db.sketches.get(AppState.currentSketchId);
            console.log('DEBUG: Retrieved sketch from DB:', sketch ? 'SUCCESS' : 'NOT FOUND');
            
            if (!sketch) {
                console.log('%cDEBUG: ERROR - Sketch not found in database!', 'color: red;');
                return;
            }

            if (!sketch.photos) {
                console.log('DEBUG: Initializing photos array for sketch');
                sketch.photos = [];
            } else {
                console.log('DEBUG: Existing photos count:', sketch.photos.length);
            }
            
            const newPhoto = {
                elementId: this.activeElement.id,
                timestamp: Date.now(),
                imageData: photoData.fullSizeData,
                thumbnailData: photoData.thumbnailData
            };
            
            console.log('DEBUG: Created new photo object:', {
                elementId: newPhoto.elementId,
                timestamp: newPhoto.timestamp,
                imageDataLength: newPhoto.imageData.length,
                thumbnailDataLength: newPhoto.thumbnailData.length
            });

            sketch.photos.push(newPhoto);
            console.log('DEBUG: Added photo to sketch, new total count:', sketch.photos.length);
            
            console.log('DEBUG: Saving updated sketch to database...');
            await db.sketches.put(sketch);
            console.log('DEBUG: Sketch saved to database successfully!');

            console.log('DEBUG: Calling loadAndDisplayThumbnails()...');
            this.loadAndDisplayThumbnails();

        } catch (error) {
            console.error('%cDEBUG: ERROR in savePhotoToDb:', 'color: red; font-weight: bold;', error);
            alert('Failed to save photo to database: ' + error.message);
        }
    }

    async loadAndDisplayThumbnails() {
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
        
        if (!AppState.currentSketchId) {
            console.log('DEBUG: No current sketch ID, clearing container');
            container.innerHTML = '';
            return;
        }
        
        console.log('DEBUG: Clearing existing thumbnails...');
        container.innerHTML = '';

        try {
            console.log('DEBUG: Getting sketch from DB for thumbnails...');
            const sketch = await db.sketches.get(AppState.currentSketchId);
            
            if (!sketch) {
                console.log('DEBUG: No sketch found for thumbnails');
                return;
            }
            
            if (!sketch.photos) {
                console.log('DEBUG: No photos array in sketch');
                return;
            }
            
            console.log('DEBUG: Total photos in sketch:', sketch.photos.length);
            
            const elementPhotos = sketch.photos.filter(p => p.elementId === this.activeElement.id);
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
                img.onload = () => {
                    console.log(`DEBUG: Thumbnail ${index + 1} loaded successfully`);
                };
                img.onerror = () => {
                    console.log(`%cDEBUG: ERROR loading thumbnail ${index + 1}`, 'color: red;');
                };
                
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
                
                console.log(`DEBUG: Thumbnail ${index + 1} added to container`);
            });
            
            console.log('DEBUG: All thumbnails processed and added to UI');
            
        } catch (error) {
            console.error('%cDEBUG: ERROR in loadAndDisplayThumbnails:', 'color: red; font-weight: bold;', error);
        }
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