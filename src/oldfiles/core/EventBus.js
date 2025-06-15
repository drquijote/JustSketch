// src/core/EventBus.js
// Dedicated event bus for module communication

export class EventBus {
    constructor() {
        this.target = new EventTarget();
        this.listeners = new Map();
        console.log('EventBus: Initialized');
    }
    
    init() {
        console.log('EventBus: Init method called');
        return this;
    }
    
    emit(eventType, data = {}) {
        const event = new CustomEvent(eventType, { detail: data });
        this.target.dispatchEvent(event);
        
        if (!eventType.includes('redraw')) {
            console.log(`EventBus: ${eventType}`, data);
        }
    }
    
    on(eventType, callback, options = {}) {
        this.target.addEventListener(eventType, callback, options);
        
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType).push(callback);
    }
    
    off(eventType, callback) {
        this.target.removeEventListener(eventType, callback);
        
        if (this.listeners.has(eventType)) {
            const callbacks = this.listeners.get(eventType);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    once(eventType, callback) {
        this.on(eventType, callback, { once: true });
    }
    
    getListenerCount(eventType) {
        return this.listeners.get(eventType)?.length || 0;
    }
    
    getAllListeners() {
        const result = {};
        for (const [eventType, callbacks] of this.listeners) {
            result[eventType] = callbacks.length;
        }
        return result;
    }
}

// Global instance
export const eventBus = new EventBus();