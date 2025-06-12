// src/photo.js - All photo mode logic, including drawing overlays

import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

export class PhotoManager {
    constructor() {
        // --- DOM Elements ---
        this.photoModal = document.getElementById('photoModal');
        this.cameraFeed = document.getElementById('cameraFeed');
        this.photoCaptureCanvas = document.getElementById('photoCaptureCanvas');
        this.photoGallery = document.getElementById('photoGallery');
        this.roomNameHeader = document.getElementById('roomNameHeader');
        this.takePhotoBtn = document.getElementById('takePhotoBtn');
        this.savePhotosBtn = document.getElementById('savePhotosBtn');
        this.cancelPhotoBtn = document.getElementById('cancelPhotoBtn');

        // --- State ---
        this.activeStream = null;
        this.currentRoomElement = null;
        this.photosForCurrentRoom = [];
        this.STORAGE_KEY = 'roomPhotos';

        // Bind the handler once to maintain 'this' context
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
    }

    init() {
        // Setup modal button listeners
        this.takePhotoBtn.addEventListener('click', () => this.capturePhoto());
        this.savePhotosBtn.addEventListener('click', () => this.saveAndClose());
        this.cancelPhotoBtn.addEventListener('click', () => this.closePhotoModal());
        
        // Listen for the UI redraw event to draw our overlays on top of everything else
        AppState.on('canvas:redraw:ui', () => this.drawPhotoOverlays());

        console.log("PhotoManager Initialized and listening for redraw events.");
    }

    // This is called by the central router in main.js
    handleCanvasClick(e) {
        if (AppState.currentMode !== 'photo') return;

        console.log("PhotoManager handling click...");
        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left) - AppState.viewportTransform.x;
        const canvasY = (e.clientY - rect.top) - AppState.viewportTransform.y;

        const clickedRoom = this.getClickedRoom(canvasX, canvasY);

        if (clickedRoom) {
            this.openPhotoModal(clickedRoom);
        }
    }

    // New function to draw the camera icons on the canvas
    drawPhotoOverlays() {
        if (AppState.currentMode !== 'photo') return;

        const ctx = AppState.ctx;
        if (!ctx) return;

        ctx.save();
        // Iterate over all placed elements to find rooms
        AppState.placedElements.forEach(element => {
            if (element.type === 'room') {
                const photoCount = this.getPhotoCount(element.id);
                const iconRadius = 9;
                const iconX = element.x + element.width - iconRadius - 2;
                const iconY = element.y + iconRadius + 2;

                // --- Drawing logic is now self-contained in this module ---
                ctx.fillStyle = photoCount > 0 ? '#27ae60' : '#7f8c8d'; // Green if photos exist
                ctx.beginPath();
                ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(iconX, iconY, iconRadius * 0.4, 0, Math.PI * 2);
                ctx.fill();

                if (photoCount > 0) {
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(photoCount, iconX, iconY + 1);
                }
            }
        });
        ctx.restore();
    }

    getClickedRoom(x, y) {
        for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
            const el = AppState.placedElements[i];
            if (el.type === 'room' &&
                x >= el.x && x <= el.x + el.width &&
                y >= el.y && y <= el.y + el.height) {
                return el;
            }
        }
        return null;
    }

    async openPhotoModal(roomElement) {
        this.currentRoomElement = roomElement;
        this.roomNameHeader.textContent = `Photos for: ${roomElement.content}`;
        this.photosForCurrentRoom = this.loadPhotosFromStorage(roomElement.id) || [];
        this.renderGallery();
        
        this.photoModal.classList.remove('hidden');

        try {
            this.activeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            this.cameraFeed.srcObject = this.activeStream;
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Could not access camera. Please ensure you have given permission.");
            this.closePhotoModal();
        }
    }

    closePhotoModal() {
        if (this.activeStream) {
            this.activeStream.getTracks().forEach(track => track.stop());
        }
        this.photoModal.classList.add('hidden');
    }

    capturePhoto() {
        if (this.photosForCurrentRoom.length >= 5) {
            alert("You can add up to 5 photos per room.");
            return;
        }
        const context = this.photoCaptureCanvas.getContext('2d');
        this.photoCaptureCanvas.width = this.cameraFeed.videoWidth;
        this.photoCaptureCanvas.height = this.cameraFeed.videoHeight;
        context.drawImage(this.cameraFeed, 0, 0);
        const dataUrl = this.photoCaptureCanvas.toDataURL('image/jpeg', 0.8);
        this.photosForCurrentRoom.push(dataUrl);
        this.renderGallery();
    }

    renderGallery() {
        this.photoGallery.innerHTML = '';
        this.photosForCurrentRoom.forEach((photoDataUrl, index) => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'gallery-thumbnail';
            const img = document.createElement('img');
            img.src = photoDataUrl;
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '×';
            deleteBtn.className = 'gallery-delete-btn';
            deleteBtn.onclick = () => {
                this.photosForCurrentRoom.splice(index, 1);
                this.renderGallery();
            };
            imgContainer.appendChild(img);
            imgContainer.appendChild(deleteBtn);
            this.photoGallery.appendChild(imgContainer);
        });
    }

    saveAndClose() {
        if (this.currentRoomElement) {
            const allPhotos = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
            allPhotos[this.currentRoomElement.id] = this.photosForCurrentRoom;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allPhotos));
        }
        this.closePhotoModal();
        CanvasManager.redraw();
    }
    
    loadPhotosFromStorage(roomElementId) {
        const allPhotos = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
        return allPhotos[roomElementId];
    }

    getPhotoCount(roomElementId) {
        if (!roomElementId) return 0;
        const photos = this.loadPhotosFromStorage(roomElementId);
        return photos ? photos.length : 0;
    }
}
