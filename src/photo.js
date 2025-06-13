// src/photo.js - Correct version with robust file handling for mobile

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

export class PhotoManager {
    constructor() {
        this.photoPalette = document.getElementById('photoPalette');
        this.activeRoomElement = null;
        this.STORAGE_KEY = 'roomPhotos';
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
        this.handleCanvasTouch = this.handleCanvasTouch.bind(this);
    }

    init() {
        AppState.on('mode:changed', (e) => {
            if (e.detail.mode !== 'photo') this.closePhotoPalette();
        });
        AppState.on('canvas:redraw:ui', () => this.drawActiveRoomHighlight());
        const viewport = document.getElementById('canvasViewport');
        viewport.addEventListener('touchend', this.handleCanvasTouch, { passive: false });
        console.log("PhotoManager Initialized with robust mobile camera fix.");
    }

    drawActiveRoomHighlight() {
        if (AppState.currentMode !== 'photo' || !this.activeRoomElement) return;
        const ctx = AppState.ctx;
        if (!ctx) return;
        const el = this.activeRoomElement;
        ctx.save();
        ctx.shadowColor = 'rgba(52, 152, 219, 0.9)';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(52, 152, 219, 1)';
        ctx.lineWidth = 4;
        ctx.strokeRect(el.x - 2, el.y - 2, el.width + 4, el.height + 4);
        ctx.restore();
    }

    handleCanvasTouch(e) {
        if (AppState.currentMode !== 'photo') return;
        if (this.processInteraction(e)) e.preventDefault();
    }

    handleCanvasClick(e) {
        if (AppState.currentMode !== 'photo') return;
        this.processInteraction(e);
    }

    processInteraction(e) {
        const pos = this.getCanvasCoordinates(e);
        const clickedRoom = this.getClickedRoom(pos.x, pos.y);
        if (clickedRoom) {
            if (this.activeRoomElement?.id === clickedRoom.id) return false;
            this.activeRoomElement = clickedRoom;
            this.openPhotoPaletteFor(clickedRoom);
            CanvasManager.redraw();
            return true;
        } else {
            this.closePhotoPalette();
            CanvasManager.redraw();
            return false;
        }
    }

    openPhotoPaletteFor(roomElement) {
        const photos = this.loadPhotosFromStorage(roomElement.id) || [];
        this.photoPalette.classList.remove('hidden');
        this.photoPalette.innerHTML = ''; 
        const wrapper = document.createElement('div');
        wrapper.className = 'photo-palette-wrapper';
        const header = document.createElement('h3');
        header.textContent = roomElement.content;
        wrapper.appendChild(header);
        photos.forEach((url, index) => wrapper.appendChild(this.createThumbnailElement(url, index)));
        if (photos.length < 5) {
            wrapper.appendChild(this.createUploaderElement());
        }
        this.photoPalette.appendChild(wrapper);
        this.photoPalette.scrollLeft = this.photoPalette.scrollWidth;
    }
    
    createUploaderElement() {
        const uploaderContainer = document.createElement('div');
        uploaderContainer.className = 'palette-uploader-container';
        const uploadButton = document.createElement('div');
        uploadButton.className = 'palette-upload-button';
        uploadButton.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg><span>Library</span>`;
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = 'image/*';
        uploadButton.appendChild(fileInput);
        uploadButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
        const cameraButton = document.createElement('div');
        cameraButton.className = 'palette-upload-button';
        cameraButton.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg><span>Camera</span>`;
        const cameraInput = document.createElement('input');
        cameraInput.type = 'file';
        cameraInput.accept = 'image/*';
        cameraInput.capture = 'environment';
        cameraButton.appendChild(cameraInput);
        cameraButton.addEventListener('click', () => cameraInput.click());
        cameraInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
        uploaderContainer.appendChild(uploadButton);
        uploaderContainer.appendChild(cameraButton);
        return uploaderContainer;
    }
    
    createThumbnailElement(photoDataUrl, index) {
        const thumb = document.createElement('div');
        thumb.className = 'gallery-thumbnail-inline';
        const img = document.createElement('img');
        img.src = photoDataUrl;
        const del = document.createElement('button');
        del.textContent = '×';
        del.onclick = () => this.deletePhoto(index);
        thumb.appendChild(img);
        thumb.appendChild(del);
        return thumb;
    }

    // --- MODIFIED: This function now uses async/await and Promise.all for reliability ---
    async handleFileSelect(files) {
        if (!files || files.length === 0 || !this.activeRoomElement) {
            console.log("File selection cancelled or no active room.");
            return;
        }

        let photos = this.loadPhotosFromStorage(this.activeRoomElement.id) || [];
        const remainingSlots = 5 - photos.length;

        if (files.length > remainingSlots) {
            alert(`You can only add ${remainingSlots} more photo(s). Only the first ${remainingSlots} will be added.`);
        }
        
        const filesToProcess = Array.from(files).slice(0, remainingSlots);
        if (filesToProcess.length === 0) return;

        // Creates a promise that resolves with the file's data URL
        const readFileAsDataURL = (file) => {
            return new Promise((resolve, reject) => {
                // We no longer check file.type, as it's unreliable on iOS for camera captures
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            });
        };

        try {
            console.log(`Processing ${filesToProcess.length} file(s)...`);
            // Wait for ALL files to be read into memory before proceeding
            const newPhotoDataUrls = await Promise.all(filesToProcess.map(readFileAsDataURL));
            
            // Now that all files are read, we can safely update the photos array
            const updatedPhotos = photos.concat(newPhotoDataUrls);
            
            console.log("All files processed successfully. Saving and refreshing palette.");
            this.saveAndRefreshPalette(updatedPhotos);

        } catch (error) {
            console.error("An error occurred while reading files:", error);
            alert("There was an error processing one or more photos. Please try again.");
        }
    }

    deletePhoto(index) {
        if (!this.activeRoomElement) return;
        let photos = this.loadPhotosFromStorage(this.activeRoomElement.id) || [];
        photos.splice(index, 1);
        this.saveAndRefreshPalette(photos);
    }
    
    // This is now the single source of truth for saving and re-rendering
    saveAndRefreshPalette(updatedPhotosArray) {
        if (!this.activeRoomElement) return;

        console.log(`Saving ${updatedPhotosArray.length} photos for room ${this.activeRoomElement.id}`);
        
        const allPhotos = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
        allPhotos[this.activeRoomElement.id] = updatedPhotosArray;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allPhotos));

        // Re-render the palette from the new source of truth
        this.openPhotoPaletteFor(this.activeRoomElement);
    }
    
    closePhotoPalette() {
        this.photoPalette.classList.add('hidden');
        this.photoPalette.innerHTML = '';
        this.activeRoomElement = null;
    }

    getCanvasCoordinates(e) {
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const touch = e.changedTouches ? e.changedTouches[0] : e;
        return { x: (touch.clientX - rect.left) - AppState.viewportTransform.x, y: (touch.clientY - rect.top) - AppState.viewportTransform.y };
    }

    getClickedRoom(x, y) {
        for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
            const el = AppState.placedElements[i];
            if (el.type === 'room' && (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height)) return el;
        }
        return null;
    }
    
    loadPhotosFromStorage(id) {
        const all = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
        return all[id];
    }
}
