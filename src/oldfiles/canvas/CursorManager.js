// src/canvas/CursorManager.js - Custom cursor management
import { eventBus } from '../core/EventBus.js';

export class CursorManager {
    constructor() {
        this.customCursor = null;
        this.currentCursor = 'default';
        this.isCustomCursorActive = false;
        this.boundUpdateCursor = this.updateCustomCursor.bind(this);
        this.initialized = false;
        this.isMobile = this.detectMobileDevice();
        this.cursorHistory = [];
        this.maxHistoryLength = 10;
    }

    static getInstance() {
        if (!CursorManager.instance) {
            CursorManager.instance = new CursorManager();
        }
        return CursorManager.instance;
    }

    static init() {
        const manager = CursorManager.getInstance();
        if (manager.initialized) return manager;
        
        console.log('CursorManager: Initializing cursor management');
        
        // Get or create custom cursor element
        manager.customCursor = document.getElementById('customCursor');
        if (!manager.customCursor) {
            manager.createCustomCursorElement();
        }
        
        // Set up event listeners
        manager.setupEventListeners();
        
        manager.initialized = true;
        console.log('CursorManager: Initialized (Mobile device:', manager.isMobile, ')');
        
        eventBus.emit('cursor:initialized', { isMobile: manager.isMobile });
        return manager;
    }

    detectMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0);
    }

    setupEventListeners() {
        // Listen for cursor change events
        eventBus.on('cursor:set', (e) => {
            const { type, content, styling } = e.detail;
            this.setCursor(type, content, styling);
        });
        
        eventBus.on('cursor:hide', () => {
            this.hideCustomCursor();
        });
        
        eventBus.on('cursor:show', () => {
            this.showCustomCursor();
        });

        eventBus.on('cursor:reset', () => {
            this.resetCursor();
        });

        eventBus.on('cursor:push', (e) => {
            const { type, content, styling } = e.detail;
            this.pushCursor(type, content, styling);
        });

        eventBus.on('cursor:pop', () => {
            this.popCursor();
        });

        // Listen for mode changes that might affect cursor
        eventBus.on('mode:changed', (e) => {
            const { mode, subMode } = e.detail;
            this.handleModeChange(mode, subMode);
        });
    }

    createCustomCursorElement() {
        this.customCursor = document.createElement('div');
        this.customCursor.id = 'customCursor';
        this.customCursor.className = 'custom-cursor hidden';
        this.customCursor.style.cssText = `
            position: fixed;
            z-index: 9999;
            pointer-events: none;
            transform: translate(-50%, -50%);
            user-select: none;
            -webkit-user-select: none;
            transition: opacity 0.2s ease;
        `;
        document.body.appendChild(this.customCursor);
        console.log('CursorManager: Created custom cursor element');
    }

    setCursor(type, content = '', styling = {}) {
        if (!this.customCursor) return;
        
        // Don't show custom cursors on mobile devices unless specifically requested
        if (this.isMobile && !styling.forceMobile) {
            this.setStandardCursor(type);
            return;
        }
        
        this.currentCursor = type;
        
        switch (type) {
            case 'room':
                this.setRoomCursor(content, styling);
                break;
            case 'icon':
                this.setIconCursor(content, styling);
                break;
            case 'crosshair':
                this.setCrosshairCursor(styling);
                break;
            case 'move':
                this.setMoveCursor();
                break;
            case 'grab':
                this.setGrabCursor();
                break;
            case 'grabbing':
                this.setGrabbingCursor();
                break;
            case 'drawing':
                this.setDrawingCursor(styling);
                break;
            case 'eraser':
                this.setEraserCursor(styling);
                break;
            case 'measuring':
                this.setMeasuringCursor(styling);
                break;
            case 'default':
            default:
                this.setDefaultCursor();
                break;
        }
        
        eventBus.emit('cursor:changed', { type, content, styling });
    }

    setStandardCursor(type) {
        this.hideCustomCursor();
        const canvas = document.getElementById('drawingCanvas');
        
        if (canvas) {
            switch (type) {
                case 'move':
                case 'grabbing':
                    canvas.style.cursor = 'grabbing';
                    break;
                case 'grab':
                    canvas.style.cursor = 'grab';
                    break;
                case 'crosshair':
                case 'drawing':
                    canvas.style.cursor = 'crosshair';
                    break;
                case 'pointer':
                    canvas.style.cursor = 'pointer';
                    break;
                default:
                    canvas.style.cursor = 'default';
                    break;
            }
        }
    }

    setRoomCursor(content, styling = {}) {
        const textWidth = Math.max(58, content.length * 8 + 8);
        const backgroundColor = styling.backgroundColor || '#3498db';
        const color = styling.color || 'white';
        const fontSize = styling.fontSize || '12px';
        
        this.customCursor.innerHTML = `
            <div style="
                background-color: ${backgroundColor};
                color: ${color};
                padding: 4px 8px;
                border-radius: 6px;
                font: 600 ${fontSize} -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                white-space: nowrap;
                border: 2px solid rgba(255,255,255,0.3);
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                pointer-events: none;
                width: ${textWidth}px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            ">${content}</div>
        `;
        this.showCustomCursor();
    }

    setIconCursor(iconSrc, styling = {}) {
        const size = styling.size || 45;
        const opacity = styling.opacity || 0.8;
        
        this.customCursor.innerHTML = `
            <img src="${iconSrc}" 
                 alt="icon" 
                 style="
                     width: ${size}px;
                     height: ${size}px;
                     pointer-events: none;
                     opacity: ${opacity};
                     filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
                     ${styling.filter ? `filter: ${styling.filter};` : ''}
                 ">
        `;
        this.showCustomCursor();
    }

    setCrosshairCursor(styling = {}) {
        const size = styling.size || 20;
        const color = styling.color || '#3498db';
        const lineWidth = styling.lineWidth || 2;
        
        this.customCursor.innerHTML = `
            <div style="
                width: ${size}px;
                height: ${size}px;
                border: ${lineWidth}px solid ${color};
                border-radius: 50%;
                background: rgba(52, 152, 219, 0.1);
                pointer-events: none;
                position: relative;
                box-shadow: 0 0 10px rgba(52, 152, 219, 0.3);
            ">
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: ${lineWidth}px;
                    height: ${size * 2}px;
                    background: ${color};
                    transform: translate(-50%, -50%);
                    opacity: 0.7;
                "></div>
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: ${size * 2}px;
                    height: ${lineWidth}px;
                    background: ${color};
                    transform: translate(-50%, -50%);
                    opacity: 0.7;
                "></div>
            </div>
        `;
        this.showCustomCursor();
    }

    setDrawingCursor(styling = {}) {
        const color = styling.color || '#27ae60';
        const size = styling.size || 16;
        
        this.customCursor.innerHTML = `
            <div style="
                width: ${size}px;
                height: ${size}px;
                border: 2px solid ${color};
                border-radius: 50%;
                background: rgba(39, 174, 96, 0.2);
                pointer-events: none;
                position: relative;
                box-shadow: 0 0 8px rgba(39, 174, 96, 0.4);
            ">
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 4px;
                    height: 4px;
                    background: ${color};
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                "></div>
            </div>
        `;
        this.showCustomCursor();
    }

    setEraserCursor(styling = {}) {
        const size = styling.size || 24;
        const color = styling.color || '#e74c3c';
        
        this.customCursor.innerHTML = `
            <div style="
                width: ${size}px;
                height: ${size}px;
                border: 2px solid ${color};
                border-radius: 4px;
                background: rgba(231, 76, 60, 0.2);
                pointer-events: none;
                position: relative;
                box-shadow: 0 0 8px rgba(231, 76, 60, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <div style="
                    width: 12px;
                    height: 2px;
                    background: ${color};
                    border-radius: 1px;
                "></div>
            </div>
        `;
        this.showCustomCursor();
    }

    setMeasuringCursor(styling = {}) {
        const color = styling.color || '#f39c12';
        
        this.customCursor.innerHTML = `
            <div style="
                width: 24px;
                height: 24px;
                border: 2px solid ${color};
                border-radius: 50%;
                background: rgba(243, 156, 18, 0.2);
                pointer-events: none;
                position: relative;
                box-shadow: 0 0 8px rgba(243, 156, 18, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <div style="
                    width: 16px;
                    height: 2px;
                    background: ${color};
                    position: relative;
                ">
                    <div style="
                        position: absolute;
                        left: 0;
                        top: -2px;
                        width: 2px;
                        height: 6px;
                        background: ${color};
                    "></div>
                    <div style="
                        position: absolute;
                        right: 0;
                        top: -2px;
                        width: 2px;
                        height: 6px;
                        background: ${color};
                    "></div>
                </div>
            </div>
        `;
        this.showCustomCursor();
    }

    setMoveCursor() {
        this.hideCustomCursor();
        this.setStandardCursor('grabbing');
    }

    setGrabCursor() {
        this.hideCustomCursor();
        this.setStandardCursor('grab');
    }

    setGrabbingCursor() {
        this.hideCustomCursor();
        this.setStandardCursor('grabbing');
    }

    setDefaultCursor() {
        this.hideCustomCursor();
        this.setStandardCursor('default');
    }

    showCustomCursor() {
        if (!this.customCursor || this.isMobile) return;
        
        this.customCursor.classList.remove('hidden');
        this.customCursor.style.display = 'block';
        this.isCustomCursorActive = true;
        
        // Hide canvas cursor when showing custom cursor
        const canvas = document.getElementById('drawingCanvas');
        if (canvas) {
            canvas.style.cursor = 'none';
        }
        
        // Add mouse move listener if not already added
        document.addEventListener('mousemove', this.boundUpdateCursor);
    }

    hideCustomCursor() {
        if (!this.customCursor) return;
        
        this.customCursor.classList.add('hidden');
        this.customCursor.innerHTML = '';
        this.isCustomCursorActive = false;
        
        // Remove mouse move listener
        document.removeEventListener('mousemove', this.boundUpdateCursor);
    }

    updateCustomCursor(e) {
        if (!this.customCursor || !this.isCustomCursorActive || this.isMobile) return;
        
        this.customCursor.style.left = e.clientX + 'px';
        this.customCursor.style.top = e.clientY + 'px';
    }

    resetCursor() {
        this.setDefaultCursor();
        this.currentCursor = 'default';
        eventBus.emit('cursor:reset:complete');
    }

    pushCursor(type, content, styling) {
        // Save current cursor state to history
        this.cursorHistory.push({
            type: this.currentCursor,
            content: content,
            styling: styling,
            timestamp: Date.now()
        });
        
        // Limit history length
        if (this.cursorHistory.length > this.maxHistoryLength) {
            this.cursorHistory.shift();
        }
        
        // Set new cursor
        this.setCursor(type, content, styling);
    }

    popCursor() {
        if (this.cursorHistory.length === 0) {
            this.resetCursor();
            return;
        }
        
        const previousCursor = this.cursorHistory.pop();
        this.setCursor(previousCursor.type, previousCursor.content, previousCursor.styling);
    }

    handleModeChange(mode, subMode) {
        switch (mode) {
            case 'drawing':
                this.setCursor('drawing');
                break;
            case 'edit':
                this.setCursor('default');
                break;
            case 'photos':
                this.setCursor('crosshair');
                break;
            default:
                this.setCursor('default');
                break;
        }
    }

    // Method to check if custom cursor is active
    isCustomActive() {
        return this.isCustomCursorActive && !this.isMobile;
    }

    // Method to get current cursor type
    getCurrentCursor() {
        return this.currentCursor;
    }

    // Method to check if device is mobile
    isMobileDevice() {
        return this.isMobile;
    }

    // Method to get cursor history
    getCursorHistory() {
        return [...this.cursorHistory];
    }

    // Method to clear cursor history
    clearHistory() {
        this.cursorHistory = [];
        eventBus.emit('cursor:history:cleared');
    }

    // Static methods for easy access
    static setCursor(type, content, styling) {
        const manager = CursorManager.getInstance();
        manager.setCursor(type, content, styling);
    }

    static hideCursor() {
        const manager = CursorManager.getInstance();
        manager.hideCustomCursor();
    }

    static resetCursor() {
        const manager = CursorManager.getInstance();
        manager.resetCursor();
    }

    static pushCursor(type, content, styling) {
        const manager = CursorManager.getInstance();
        manager.pushCursor(type, content, styling);
    }

    static popCursor() {
        const manager = CursorManager.getInstance();
        manager.popCursor();
    }

    static getCurrentCursor() {
        const manager = CursorManager.getInstance();
        return manager.getCurrentCursor();
    }

    static isMobileDevice() {
        const manager = CursorManager.getInstance();
        return manager.isMobile;
    }

    // Cleanup method
    destroy() {
        if (this.customCursor && this.customCursor.parentNode) {
            this.customCursor.parentNode.removeChild(this.customCursor);
        }
        document.removeEventListener('mousemove', this.boundUpdateCursor);
        this.initialized = false;
        console.log('CursorManager: Destroyed');
    }
}
