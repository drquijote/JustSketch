// src/input/KeyboardHandler.js - Keyboard shortcuts and key combinations
// This file is completely independent and does not depend on any existing files

/**
 * KeyboardHandler manages keyboard input, shortcuts, and key combinations
 * Provides a flexible system for registering and handling keyboard shortcuts
 */
export class KeyboardHandler {
    constructor() {
        this.isInitialized = false;
        this.eventTarget = new EventTarget();
        
        // Registered shortcuts
        this.shortcuts = new Map();
        this.shortcutSequences = new Map(); // For multi-key sequences
        
        // Key state tracking
        this.pressedKeys = new Set();
        this.keySequence = [];
        this.sequenceTimeout = null;
        
        // Input field tracking
        this.activeInputFields = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
        this.isInputFocused = false;
        
        // Configuration
        this.config = {
            sequenceTimeout: 1000, // ms for key sequences
            preventDefaultKeys: new Set(['F5', 'F11', 'F12']), // Keys to always prevent
            ignoreInInput: true, // Ignore shortcuts when input is focused
            caseSensitive: false
        };
        
        console.log('KeyboardHandler: Created');
    }

    /**
     * Initialize keyboard handler
     */
    init() {
        if (this.isInitialized) {
            console.warn('KeyboardHandler: Already initialized');
            return;
        }

        this.setupKeyboardListeners();
        this.setupInputTracking();
        this.isInitialized = true;
        
        console.log('KeyboardHandler: Initialized');
    }

    /**
     * Clean up keyboard handler
     */
    destroy() {
        if (!this.isInitialized) return;

        this.removeKeyboardListeners();
        this.removeInputTracking();
        this.clearSequenceTimeout();
        this.shortcuts.clear();
        this.shortcutSequences.clear();
        this.pressedKeys.clear();
        this.keySequence = [];
        this.isInitialized = false;
        
        console.log('KeyboardHandler: Destroyed');
    }

    /**
     * Setup keyboard event listeners
     */
    setupKeyboardListeners() {
        document.addEventListener('keydown', this.handleKeyDown.bind(this), true);
        document.addEventListener('keyup', this.handleKeyUp.bind(this), true);
        window.addEventListener('blur', this.handleWindowBlur.bind(this));
    }

    /**
     * Remove keyboard event listeners
     */
    removeKeyboardListeners() {
        document.removeEventListener('keydown', this.handleKeyDown, true);
        document.removeEventListener('keyup', this.handleKeyUp, true);
        window.removeEventListener('blur', this.handleWindowBlur);
    }

    /**
     * Setup input field tracking
     */
    setupInputTracking() {
        document.addEventListener('focusin', this.handleFocusIn.bind(this));
        document.addEventListener('focusout', this.handleFocusOut.bind(this));
    }

    /**
     * Remove input field tracking
     */
    removeInputTracking() {
        document.removeEventListener('focusin', this.handleFocusIn);
        document.removeEventListener('focusout', this.handleFocusOut);
    }

    /**
     * Handle keydown event
     */
    handleKeyDown(e) {
        const keyInfo = this.getKeyInfo(e);
        
        // Track pressed key
        this.pressedKeys.add(keyInfo.code);
        
        // Update input focus state
        this.updateInputFocusState(e.target);
        
        // Check if we should ignore this key
        if (this.shouldIgnoreKey(e, keyInfo)) {
            return;
        }

        // Prevent default for specific keys
        if (this.config.preventDefaultKeys.has(keyInfo.key)) {
            e.preventDefault();
        }

        // Emit raw keydown event
        this.emit('keyDown', {
            ...keyInfo,
            pressedKeys: Array.from(this.pressedKeys),
            originalEvent: e
        });

        // Check for shortcut matches
        this.checkShortcuts(keyInfo, e);
        
        // Handle key sequences
        this.handleKeySequence(keyInfo, e);
    }

    /**
     * Handle keyup event
     */
    handleKeyUp(e) {
        const keyInfo = this.getKeyInfo(e);
        
        // Remove from pressed keys
        this.pressedKeys.delete(keyInfo.code);
        
        // Emit raw keyup event
        this.emit('keyUp', {
            ...keyInfo,
            pressedKeys: Array.from(this.pressedKeys),
            originalEvent: e
        });
    }

    /**
     * Handle window blur (reset all key states)
     */
    handleWindowBlur() {
        this.pressedKeys.clear();
        this.keySequence = [];
        this.clearSequenceTimeout();
        
        this.emit('allKeysReleased', {});
    }

    /**
     * Handle focus in (track input fields)
     */
    handleFocusIn(e) {
        this.updateInputFocusState(e.target);
    }

    /**
     * Handle focus out
     */
    handleFocusOut(e) {
        this.updateInputFocusState(null);
    }

    /**
     * Update input focus state
     */
    updateInputFocusState(target) {
        if (!target) {
            this.isInputFocused = false;
            return;
        }

        const tagName = target.tagName.toUpperCase();
        const isContentEditable = target.contentEditable === 'true';
        
        this.isInputFocused = this.activeInputFields.has(tagName) || isContentEditable;
    }

    /**
     * Get normalized key information
     */
    getKeyInfo(e) {
        return {
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            repeat: e.repeat,
            location: e.location,
            
            // Computed properties
            isModifier: this.isModifierKey(e.code),
            modifierString: this.getModifierString(e),
            shortcutString: this.getShortcutString(e)
        };
    }

    /**
     * Check if key is a modifier
     */
    isModifierKey(code) {
        return ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 
                'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code);
    }

    /**
     * Get modifier string (e.g., "Ctrl+Shift")
     */
    getModifierString(e) {
        const modifiers = [];
        
        if (e.ctrlKey) modifiers.push('Ctrl');
        if (e.altKey) modifiers.push('Alt');
        if (e.shiftKey) modifiers.push('Shift');
        if (e.metaKey) modifiers.push('Meta');
        
        return modifiers.join('+');
    }

    /**
     * Get full shortcut string (e.g., "Ctrl+Shift+A")
     */
    getShortcutString(e) {
        const modifiers = this.getModifierString(e);
        const key = this.config.caseSensitive ? e.key : e.key.toLowerCase();
        
        if (this.isModifierKey(e.code)) {
            return modifiers;
        }
        
        return modifiers ? `${modifiers}+${key}` : key;
    }

    /**
     * Check if key should be ignored
     */
    shouldIgnoreKey(e, keyInfo) {
        // Ignore if input is focused and configured to do so
        if (this.config.ignoreInInput && this.isInputFocused && !keyInfo.ctrlKey && !keyInfo.metaKey) {
            return true;
        }
        
        // Don't ignore modifier-only presses for shortcuts
        if (this.isModifierKey(e.code)) {
            return false;
        }
        
        return false;
    }

    /**
     * Check for shortcut matches
     */
    checkShortcuts(keyInfo, originalEvent) {
        const shortcutString = keyInfo.shortcutString;
        
        if (this.shortcuts.has(shortcutString)) {
            const shortcut = this.shortcuts.get(shortcutString);
            
            // Prevent default if specified
            if (shortcut.preventDefault) {
                originalEvent.preventDefault();
                originalEvent.stopPropagation();
            }
            
            // Execute callback
            if (shortcut.callback) {
                try {
                    shortcut.callback({
                        shortcut: shortcutString,
                        keyInfo: keyInfo,
                        originalEvent: originalEvent
                    });
                } catch (error) {
                    console.error('KeyboardHandler: Error executing shortcut callback:', error);
                }
            }
            
            // Emit shortcut event
            this.emit('shortcut', {
                shortcut: shortcutString,
                keyInfo: keyInfo,
                originalEvent: originalEvent
            });
            
            return true;
        }
        
        return false;
    }

    /**
     * Handle key sequences (like Vim-style commands)
     */
    handleKeySequence(keyInfo, originalEvent) {
        // Skip modifiers for sequences
        if (this.isModifierKey(keyInfo.code)) {
            return;
        }
        
        // Add to sequence
        this.keySequence.push(keyInfo.key);
        
        // Clear existing timeout
        this.clearSequenceTimeout();
        
        // Check for sequence matches
        const sequenceString = this.keySequence.join(' ');
        
        if (this.shortcutSequences.has(sequenceString)) {
            const sequence = this.shortcutSequences.get(sequenceString);
            
            // Execute callback
            if (sequence.callback) {
                try {
                    sequence.callback({
                        sequence: sequenceString,
                        keys: [...this.keySequence],
                        originalEvent: originalEvent
                    });
                } catch (error) {
                    console.error('KeyboardHandler: Error executing sequence callback:', error);
                }
            }
            
            // Emit sequence event
            this.emit('sequence', {
                sequence: sequenceString,
                keys: [...this.keySequence],
                originalEvent: originalEvent
            });
            
            // Clear sequence
            this.keySequence = [];
            return;
        }
        
        // Set timeout to clear sequence
        this.sequenceTimeout = setTimeout(() => {
            this.keySequence = [];
        }, this.config.sequenceTimeout);
        
        // Emit partial sequence event
        this.emit('partialSequence', {
            sequence: sequenceString,
            keys: [...this.keySequence]
        });
    }

    /**
     * Clear sequence timeout
     */
    clearSequenceTimeout() {
        if (this.sequenceTimeout) {
            clearTimeout(this.sequenceTimeout);
            this.sequenceTimeout = null;
        }
    }

    // ============ PUBLIC API ============

    /**
     * Register a keyboard shortcut
     * @param {string} shortcut - Shortcut string (e.g., "Ctrl+S", "Alt+Shift+D")
     * @param {Function} callback - Callback function
     * @param {Object} options - Options (preventDefault, description, etc.)
     */
    registerShortcut(shortcut, callback, options = {}) {
        const normalizedShortcut = this.normalizeShortcut(shortcut);
        
        this.shortcuts.set(normalizedShortcut, {
            callback: callback,
            preventDefault: options.preventDefault !== false, // Default to true
            description: options.description || '',
            category: options.category || 'general',
            enabled: options.enabled !== false // Default to true
        });
        
        console.log(`KeyboardHandler: Registered shortcut "${normalizedShortcut}"`);
    }

    /**
     * Register a key sequence (multi-key command)
     * @param {string} sequence - Sequence string (e.g., "g g", "d d")
     * @param {Function} callback - Callback function
     * @param {Object} options - Options
     */
    registerSequence(sequence, callback, options = {}) {
        this.shortcutSequences.set(sequence, {
            callback: callback,
            description: options.description || '',
            category: options.category || 'general',
            enabled: options.enabled !== false
        });
        
        console.log(`KeyboardHandler: Registered sequence "${sequence}"`);
    }

    /**
     * Unregister a shortcut
     * @param {string} shortcut - Shortcut to remove
     */
    unregisterShortcut(shortcut) {
        const normalizedShortcut = this.normalizeShortcut(shortcut);
        const removed = this.shortcuts.delete(normalizedShortcut);
        
        if (removed) {
            console.log(`KeyboardHandler: Unregistered shortcut "${normalizedShortcut}"`);
        }
        
        return removed;
    }

    /**
     * Unregister a sequence
     * @param {string} sequence - Sequence to remove
     */
    unregisterSequence(sequence) {
        const removed = this.shortcutSequences.delete(sequence);
        
        if (removed) {
            console.log(`KeyboardHandler: Unregistered sequence "${sequence}"`);
        }
        
        return removed;
    }

    /**
     * Normalize shortcut string
     */
    normalizeShortcut(shortcut) {
        // Split by + and normalize each part
        const parts = shortcut.split('+').map(part => part.trim());
        
        // Separate modifiers and key
        const modifiers = [];
        let key = '';
        
        parts.forEach(part => {
            const normalizedPart = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            
            if (['Ctrl', 'Alt', 'Shift', 'Meta'].includes(normalizedPart)) {
                modifiers.push(normalizedPart);
            } else {
                key = this.config.caseSensitive ? part : part.toLowerCase();
            }
        });
        
        // Sort modifiers for consistency
        modifiers.sort();
        
        return modifiers.length ? `${modifiers.join('+')}+${key}` : key;
    }

    /**
     * Get all registered shortcuts
     * @returns {Array} Array of shortcut information
     */
    getShortcuts() {
        const shortcuts = [];
        
        for (const [shortcut, info] of this.shortcuts) {
            shortcuts.push({
                shortcut: shortcut,
                description: info.description,
                category: info.category,
                enabled: info.enabled
            });
        }
        
        return shortcuts;
    }

    /**
     * Get all registered sequences
     * @returns {Array} Array of sequence information
     */
    getSequences() {
        const sequences = [];
        
        for (const [sequence, info] of this.shortcutSequences) {
            sequences.push({
                sequence: sequence,
                description: info.description,
                category: info.category,
                enabled: info.enabled
            });
        }
        
        return sequences;
    }

    /**
     * Check if a key is currently pressed
     * @param {string} keyCode - Key code to check
     * @returns {boolean} True if key is pressed
     */
    isKeyPressed(keyCode) {
        return this.pressedKeys.has(keyCode);
    }

    /**
     * Get all currently pressed keys
     * @returns {Array} Array of pressed key codes
     */
    getPressedKeys() {
        return Array.from(this.pressedKeys);
    }

    /**
     * Check if any modifier keys are pressed
     * @returns {boolean} True if any modifier is pressed
     */
    hasModifierPressed() {
        const modifierKeys = ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 
                             'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];
        
        return modifierKeys.some(key => this.pressedKeys.has(key));
    }

    /**
     * Enable or disable input field ignoring
     * @param {boolean} ignore - Whether to ignore shortcuts in input fields
     */
    setIgnoreInputFields(ignore) {
        this.config.ignoreInInput = ignore;
    }

    /**
     * Add custom input field types to ignore
     * @param {string|Array} tagNames - Tag name(s) to add
     */
    addInputFieldTypes(tagNames) {
        const tags = Array.isArray(tagNames) ? tagNames : [tagNames];
        tags.forEach(tag => this.activeInputFields.add(tag.toUpperCase()));
    }

    /**
     * Remove input field types from ignore list
     * @param {string|Array} tagNames - Tag name(s) to remove
     */
    removeInputFieldTypes(tagNames) {
        const tags = Array.isArray(tagNames) ? tagNames : [tagNames];
        tags.forEach(tag => this.activeInputFields.delete(tag.toUpperCase()));
    }

    /**
     * Enable or disable a specific shortcut
     * @param {string} shortcut - Shortcut to enable/disable
     * @param {boolean} enabled - Whether to enable the shortcut
     */
    setShortcutEnabled(shortcut, enabled) {
        const normalizedShortcut = this.normalizeShortcut(shortcut);
        
        if (this.shortcuts.has(normalizedShortcut)) {
            this.shortcuts.get(normalizedShortcut).enabled = enabled;
            return true;
        }
        
        return false;
    }

    /**
     * Temporarily disable all shortcuts
     */
    disableAllShortcuts() {
        for (const shortcut of this.shortcuts.values()) {
            shortcut.enabled = false;
        }
    }

    /**
     * Re-enable all shortcuts
     */
    enableAllShortcuts() {
        for (const shortcut of this.shortcuts.values()) {
            shortcut.enabled = true;
        }
    }

    // ============ EVENT SYSTEM ============

    on(eventType, callback) {
        this.eventTarget.addEventListener(eventType, callback);
    }

    off(eventType, callback) {
        this.eventTarget.removeEventListener(eventType, callback);
    }

    emit(eventType, data) {
        this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail: data }));
    }

    // ============ PREDEFINED SHORTCUTS ============

    /**
     * Register common application shortcuts
     */
    registerCommonShortcuts() {
        this.registerShortcut('Ctrl+Z', null, { description: 'Undo', category: 'edit' });
        this.registerShortcut('Ctrl+Y', null, { description: 'Redo', category: 'edit' });
        this.registerShortcut('Ctrl+Shift+Z', null, { description: 'Redo', category: 'edit' });
        this.registerShortcut('Ctrl+S', null, { description: 'Save', category: 'file' });
        this.registerShortcut('Ctrl+O', null, { description: 'Open', category: 'file' });
        this.registerShortcut('Ctrl+N', null, { description: 'New', category: 'file' });
        this.registerShortcut('Ctrl+C', null, { description: 'Copy', category: 'edit' });
        this.registerShortcut('Ctrl+X', null, { description: 'Cut', category: 'edit' });
        this.registerShortcut('Ctrl+V', null, { description: 'Paste', category: 'edit' });
        this.registerShortcut('Ctrl+A', null, { description: 'Select All', category: 'edit' });
        this.registerShortcut('Delete', null, { description: 'Delete', category: 'edit' });
        this.registerShortcut('Backspace', null, { description: 'Delete Backward', category: 'edit' });
        this.registerShortcut('Escape', null, { description: 'Cancel/Close', category: 'navigation' });
        this.registerShortcut('Enter', null, { description: 'Confirm/Execute', category: 'navigation' });
        this.registerShortcut('Tab', null, { description: 'Next Field', category: 'navigation' });
        this.registerShortcut('Shift+Tab', null, { description: 'Previous Field', category: 'navigation' });
    }
}