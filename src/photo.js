// src/photo.js - Reverted to a simpler, single uploader for reliability

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
        console.log("PhotoManager Initialized with single uploader fix.");
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
    
    // --- REVERTED to a single uploader element ---
    createUploaderElement() {
        const dropArea = document.createElement('div');
        dropArea.className = 'palette-file-drop-area';
        dropArea.innerHTML = `
            <div style="pointer-events: none;">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="#888" viewBox="0 0 16 16">
                  <path fill-rule="evenodd" d="M7.646 5.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 6.707V10.5a.5.5 0 0 1-1 0V6.707L6.354 7.854a.5.5 0 1 1-.708-.708l2-2z"/>
                  <path d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383zm.653.757c-.757.653-1.153 1.44-1.153 2.056v.448l-.445.049C2.064 6.805 1 7.952 1 9.318 1 10.785 2.23 12 3.781 12h8.906C13.98 12 15 10.988 15 9.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 4.825 10.328 3 8 3a4.53 4.53 0 0 0-2.941 1.1z"/>
                </svg>
                <p style="font-size: 0.9em; color: #666; margin-top: 5px;">Add Photo</p>
            </div>`;
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = 'image/*';
        // This 'capture' attribute tells mobile devices to offer the camera
        fileInput.capture = 'environment'; 
        fileInput.style.display = 'none';
        
        dropArea.appendChild(fileInput);

        // Add event listeners
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

    async handleFileSelect(files) {
        if (!files || files.length === 0 || !this.activeRoomElement) return;

        let photos = this.loadPhotosFromStorage(this.activeRoomElement.id) || [];
        const remainingSlots = 5 - photos.length;
        if (files.length > remainingSlots) {
            alert(`You can only add ${remainingSlots} more photo(s).`);
        }
        
        const filesToProcess = Array.from(files).slice(0, remainingSlots);
        if (filesToProcess.length === 0) return;

        const processImageFile = (file) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        const MAX_DIMENSION = 1920;
                        let { width, height } = img;
                        if (width > height) {
                            if (width > MAX_DIMENSION) { height *= MAX_DIMENSION / width; width = MAX_DIMENSION; }
                        } else {
                            if (height > MAX_DIMENSION) { width *= MAX_DIMENSION / height; height = MAX_DIMENSION; }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', 0.85));
                    };
                    img.onerror = reject;
                    img.src = event.target.result;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        };

        try {
            this.showLoadingState();
            const newPhotoDataUrls = await Promise.all(filesToProcess.map(processImageFile));
            const updatedPhotos = photos.concat(newPhotoDataUrls);
            this.saveAndRefreshPalette(updatedPhotos);
        } catch (error) {
            console.error("An error occurred while processing images:", error);
            alert("There was an error processing one or more photos. Please try again.");
            this.openPhotoPaletteFor(this.activeRoomElement);
        }
    }
    
    showLoadingState() {
        this.photoPalette.innerHTML = `<div class="photo-palette-wrapper" style="justify-content: center; width: 100%;"><h3>Processing...</h3></div>`;
    }

    deletePhoto(index) {
        if (!this.activeRoomElement) return;
        let photos = this.loadPhotosFromStorage(this.activeRoomElement.id) || [];
        photos.splice(index, 1);
        this.saveAndRefreshPalette(photos);
    }
    
    saveAndRefreshPalette(updatedPhotosArray) {
        if (!this.activeRoomElement) return;
        const allPhotos = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
        allPhotos[this.activeRoomElement.id] = updatedPhotosArray;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allPhotos));
        this.openPhotoPaletteFor(this.activeRoomElement);
    }
    
    closePhotoPalette() {
        this.photoPalette.classList.add('hidden');
        this.photoPalette.innerHTML = '';
        this.activeRoomElement = null;
        CanvasManager.redraw();
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
