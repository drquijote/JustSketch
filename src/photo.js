// src/photo.js - All photo mode logic, including drawing overlays and thumbnail gallery

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
        this.photoPaletteContainer = document.getElementById('photoPalette');

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
                // Draw a semi-transparent overlay to indicate clickability
                ctx.fillStyle = 'rgba(52, 152, 219, 0.2)';
                ctx.beginPath();
                ctx.roundRect(element.x, element.y, element.width, element.height, 4);
                ctx.fill();

                // Draw a camera icon in the center of the label
                const iconSize = Math.min(element.width, element.height) * 0.5;
                const centerX = element.x + element.width / 2;
                const centerY = element.y + element.height / 2;
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.lineWidth = 2;

                // Camera Body
                ctx.beginPath();
                ctx.roundRect(centerX - iconSize / 2, centerY - iconSize / 2.5, iconSize, iconSize / 1.25, 4);
                ctx.fill();
                ctx.stroke();

                // Lens
                ctx.beginPath();
                ctx.arc(centerX, centerY, iconSize * 0.25, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            }
        });
        ctx.restore();
    }

    getClickedRoom(x, y) {
        // Find the room label that was clicked. Search from top-most layer down.
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
        this.renderGalleryInModal(); // Render existing photos in the modal
        
        this.photoModal.classList.remove('hidden');

        try {
            this.activeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            this.cameraFeed.srcObject = this.activeStream;
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Could not access camera. Please ensure you have given permission and are on a secure (https) connection.");
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
            alert("You can only add up to 5 photos per room.");
            return;
        }
        const context = this.photoCaptureCanvas.getContext('2d');
        this.photoCaptureCanvas.width = this.cameraFeed.videoWidth;
        this.photoCaptureCanvas.height = this.cameraFeed.videoHeight;
        context.drawImage(this.cameraFeed, 0, 0, this.cameraFeed.videoWidth, this.cameraFeed.videoHeight);
        const dataUrl = this.photoCaptureCanvas.toDataURL('image/jpeg', 0.8);
        this.photosForCurrentRoom.push(dataUrl);

        // Instantly update the gallery inside the modal
        this.renderGalleryInModal();
    }

    renderGalleryInModal() {
        this.photoGallery.innerHTML = ''; // Clear previous thumbnails
        this.photosForCurrentRoom.forEach((photoDataUrl, index) => {
            const thumbContainer = document.createElement('div');
            thumbContainer.className = 'gallery-thumbnail';
            
            const img = document.createElement('img');
            img.src = photoDataUrl;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '×';
            deleteBtn.className = 'gallery-delete-btn';
            deleteBtn.onclick = () => {
                this.photosForCurrentRoom.splice(index, 1);
                this.renderGalleryInModal(); // Re-render the gallery after deletion
            };
            
            thumbContainer.appendChild(img);
            thumbContainer.appendChild(deleteBtn);
            this.photoGallery.appendChild(thumbContainer);
        });

        // Make the gallery scroll to the end to show the latest photo
        this.photoGallery.scrollLeft = this.photoGallery.scrollWidth;
    }

    saveAndClose() {
        if (this.currentRoomElement) {
            const allPhotos = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
            allPhotos[this.currentRoomElement.id] = this.photosForCurrentRoom;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allPhotos));
        }
        this.closePhotoModal();
        CanvasManager.redraw(); // Redraw canvas to update any persistent indicators if needed
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
