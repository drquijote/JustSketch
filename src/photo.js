// src/photo.js - Correct version with mobile touch support

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

export class PhotoManager {
    constructor() {
        this.photoPalette = document.getElementById('photoPalette');
        
        // --- State handled within this module ---
        this.activeRoomElement = null;
        this.STORAGE_KEY = 'roomPhotos';

        this.handleCanvasClick = this.handleCanvasClick.bind(this);
        // Bind the new touch handler
        this.handleCanvasTouch = this.handleCanvasTouch.bind(this);
    }

    init() {
        // When the mode changes, clear the active room
        AppState.on('mode:changed', (e) => {
            if (e.detail.mode !== 'photo') {
                this.closePhotoPalette(); // This also clears the active room
            }
        });

        // Listen for the UI redraw event to draw our highlight
        AppState.on('canvas:redraw:ui', () => this.drawActiveRoomHighlight());
        
        // --- NEW: Add a dedicated touch listener for mobile devices ---
        const viewport = document.getElementById('canvasViewport');
        // We use 'touchend' as it's the closest equivalent to a 'click'.
        // { passive: false } allows us to call preventDefault if needed.
        viewport.addEventListener('touchend', this.handleCanvasTouch, { passive: false });

        console.log("PhotoManager Initialized with highlight and mobile touch logic.");
    }
    
    // This function draws the highlight on the canvas
    drawActiveRoomHighlight() {
        if (AppState.currentMode !== 'photo' || !this.activeRoomElement) {
            return;
        }

        const ctx = AppState.ctx;
        if (!ctx) return;
        
        const el = this.activeRoomElement;

        ctx.save();
        // Draw a bright, glowing highlight effect
        ctx.shadowColor = 'rgba(52, 152, 219, 0.9)';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(52, 152, 219, 1)';
        ctx.lineWidth = 4;
        ctx.strokeRect(el.x - 2, el.y - 2, el.width + 4, el.height + 4);
        ctx.restore();
    }

    // --- NEW: Handler specifically for touch events ---
    handleCanvasTouch(e) {
        if (AppState.currentMode !== 'photo') return;
        
        // The core logic is now in a shared function.
        const wasHandled = this.processInteraction(e);

        // If our handler successfully selected a room, we call preventDefault.
        // This stops the browser from also firing a "ghost" click event,
        // and can prevent other listeners (like for panning) from interfering.
        if (wasHandled) {
            e.preventDefault();
        }
    }

    // This is the original handler for desktop clicks (called by main.js)
    handleCanvasClick(e) {
        if (AppState.currentMode !== 'photo') return;
        this.processInteraction(e);
    }

    // --- NEW: Shared logic for processing clicks and touches ---
    processInteraction(e) {
        const pos = this.getCanvasCoordinates(e);
        const clickedRoom = this.getClickedRoom(pos.x, pos.y);

        if (clickedRoom) {
            // If the same room is clicked again, do nothing.
            if (this.activeRoomElement?.id === clickedRoom.id) return false;
            
            this.activeRoomElement = clickedRoom;
            this.openPhotoPaletteFor(clickedRoom);
            CanvasManager.redraw();
            return true; // Return true to indicate we handled the event
        } else {
            this.closePhotoPalette();
            CanvasManager.redraw();
            return false; // Return false, we didn't handle it
        }
    }

    openPhotoPaletteFor(roomElement) {
        const photosForCurrentRoom = this.loadPhotosFromStorage(roomElement.id) || [];
        
        this.photoPalette.classList.remove('hidden');
        this.photoPalette.innerHTML = ''; 

        const wrapper = document.createElement('div');
        wrapper.className = 'photo-palette-wrapper';

        const header = document.createElement('h3');
        header.textContent = `Photos for: ${roomElement.content}`;
        wrapper.appendChild(header);
        
        photosForCurrentRoom.forEach((photoDataUrl, index) => {
            wrapper.appendChild(this.createThumbnailElement(photoDataUrl, index));
        });

        if (photosForCurrentRoom.length < 5) {
            wrapper.appendChild(this.createUploaderElement());
        }

        this.photoPalette.appendChild(wrapper);
        this.photoPalette.scrollLeft = this.photoPalette.scrollWidth;
    }
    
    createUploaderElement() {
        const dropArea = document.createElement('div');
        dropArea.className = 'palette-file-drop-area';
        dropArea.innerHTML = `<div style="pointer-events: none;"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="#888" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M7.646 5.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 6.707V10.5a.5.5 0 0 1-1 0V6.707L6.354 7.854a.5.5 0 1 1-.708-.708l2-2z"/><path d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383zm.653.757c-.757.653-1.153 1.44-1.153 2.056v.448l-.445.049C2.064 6.805 1 7.952 1 9.318 1 10.785 2.23 12 3.781 12h8.906C13.98 12 15 10.988 15 9.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 4.825 10.328 3 8 3a4.53 4.53 0 0 0-2.941 1.1z"/></svg></div>`;

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        dropArea.appendChild(fileInput);
        
        dropArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
        dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('active'); });
        dropArea.addEventListener('dragleave', () => dropArea.classList.remove('active'));
        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.classList.remove('active');
            this.handleFileSelect(e.dataTransfer.files);
        });

        return dropArea;
    }
    
    createThumbnailElement(photoDataUrl, index) {
        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'gallery-thumbnail-inline';
        const img = document.createElement('img');
        img.src = photoDataUrl;
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.onclick = () => this.deletePhoto(index);
        thumbContainer.appendChild(img);
        thumbContainer.appendChild(deleteBtn);
        return thumbContainer;
    }

    handleFileSelect(files) {
        if (!files || !this.activeRoomElement) return;
        
        let photos = this.loadPhotosFromStorage(this.activeRoomElement.id) || [];
        const remainingSlots = 5 - photos.length;

        let filesToProcess = Array.from(files).slice(0, remainingSlots);
        if (files.length > remainingSlots) {
            alert(`You can only upload ${remainingSlots} more photos for this room.`);
        }
        
        let processedCount = 0;
        if (filesToProcess.length === 0) return;

        filesToProcess.forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    photos.push(e.target.result);
                    processedCount++;
                    if (processedCount === filesToProcess.length) this.saveAndRefreshPalette(photos);
                };
                reader.readAsDataURL(file);
            } else {
                processedCount++;
                if (processedCount === filesToProcess.length) this.saveAndRefreshPalette(photos);
            }
        });
    }

    deletePhoto(index) {
        let photos = this.loadPhotosFromStorage(this.activeRoomElement.id) || [];
        photos.splice(index, 1);
        this.saveAndRefreshPalette(photos);
    }
    
    saveAndRefreshPalette(photos) {
        if (this.activeRoomElement) {
            const allPhotos = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
            allPhotos[this.activeRoomElement.id] = photos;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allPhotos));
            this.openPhotoPaletteFor(this.activeRoomElement);
        }
    }
    
    closePhotoPalette() {
        this.photoPalette.classList.add('hidden');
        this.photoPalette.innerHTML = '';
        this.activeRoomElement = null;
        CanvasManager.redraw();
    }

    // --- MODIFIED: This now handles both mouse and touch events ---
    getCanvasCoordinates(e) {
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        
        // Use `changedTouches` if it exists (for touchend), otherwise use the direct event properties.
        const touch = e.changedTouches ? e.changedTouches[0] : e;

        return {
            x: (touch.clientX - rect.left) - AppState.viewportTransform.x,
            y: (touch.clientY - rect.top) - AppState.viewportTransform.y
        };
    }

    getClickedRoom(x, y) {
        for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
            const el = AppState.placedElements[i];
            if (el.type === 'room' && (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height)) return el;
        }
        return null;
    }
    
    loadPhotosFromStorage(roomElementId) {
        const allPhotos = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
        return allPhotos[roomElementId];
    }
}
