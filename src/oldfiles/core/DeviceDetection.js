// src/core/DeviceDetection.js - NEW MODULAR VERSION

/**
 * Device detection and capability management
 * Handles mobile vs desktop detection and device-specific features
 */
export class DeviceDetection {
    constructor() {
        this.isMobile = false;
        this.isTablet = false;
        this.isDesktop = false;
        this.hasTouch = false;
        this.userAgent = '';
        this.screenInfo = {};
        this.capabilities = {};
        
        console.log('DeviceDetection: Initialized');
    }

    /**
     * Initialize device detection
     */
    init() {
        this.detectDevice();
        this.detectCapabilities();
        this.setupResizeListener();
        
        console.log('DeviceDetection: Detection complete', {
            isMobile: this.isMobile,
            isTablet: this.isTablet,
            isDesktop: this.isDesktop,
            hasTouch: this.hasTouch
        });
    }

    /**
     * Detect device type
     */
    detectDevice() {
        this.userAgent = navigator.userAgent;
        
        // Touch detection
        this.hasTouch = 'ontouchstart' in window || 
                       navigator.maxTouchPoints > 0 || 
                       navigator.msMaxTouchPoints > 0;

        // Screen size detection
        this.updateScreenInfo();

        // User agent detection
        const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        const tabletRegex = /iPad|Android(?=.*\bMobile\b)(?=.*\bSafari\b)|KFAPWI|LG-V500|Nexus 7|Nexus 10|SM-T|GT-P|SCH-I800|kindle|silk|playbook|bb10|rim|tab/i;
        
        this.isMobile = mobileRegex.test(this.userAgent) || 
                       (this.hasTouch && this.screenInfo.width < 768);
        
        this.isTablet = tabletRegex.test(this.userAgent) || 
                       (this.hasTouch && this.screenInfo.width >= 768 && this.screenInfo.width < 1024);
        
        this.isDesktop = !this.isMobile && !this.isTablet;

        // Specific device detection
        this.detectSpecificDevices();
    }

    /**
     * Detect specific devices for targeted optimizations
     */
    detectSpecificDevices() {
        this.capabilities.isIPhone = /iPhone/i.test(this.userAgent);
        this.capabilities.isIPad = /iPad/i.test(this.userAgent);
        this.capabilities.isAndroid = /Android/i.test(this.userAgent);
        this.capabilities.isChrome = /Chrome/i.test(this.userAgent);
        this.capabilities.isSafari = /Safari/i.test(this.userAgent) && !/Chrome/i.test(this.userAgent);
        this.capabilities.isFirefox = /Firefox/i.test(this.userAgent);
        this.capabilities.isEdge = /Edge/i.test(this.userAgent);
    }

    /**
     * Update screen information
     */
    updateScreenInfo() {
        this.screenInfo = {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1,
            orientation: this.getOrientation(),
            availWidth: screen.availWidth,
            availHeight: screen.availHeight
        };
    }

    /**
     * Get device orientation
     */
    getOrientation() {
        if (screen.orientation) {
            return screen.orientation.angle;
        } else if (window.orientation !== undefined) {
            return window.orientation;
        } else {
            return window.innerWidth > window.innerHeight ? 90 : 0;
        }
    }

    /**
     * Detect device capabilities
     */
    detectCapabilities() {
        this.capabilities.supportsPointerEvents = 'PointerEvent' in window;
        this.capabilities.supportsPassiveEvents = this.checkPassiveEventSupport();
        this.capabilities.supportsWebGL = this.checkWebGLSupport();
        this.capabilities.supportsLocalStorage = this.checkLocalStorageSupport();
        this.capabilities.supportsIndexedDB = this.checkIndexedDBSupport();
        this.capabilities.supportsServiceWorkers = 'serviceWorker' in navigator;
        this.capabilities.supportsClipboard = navigator.clipboard !== undefined;
        this.capabilities.supportsFileAPI = window.File && window.FileReader;
        this.capabilities.supportsGeolocation = 'geolocation' in navigator;
        this.capabilities.supportsVibration = 'vibrate' in navigator;
        
        // Canvas capabilities
        this.capabilities.maxCanvasSize = this.getMaxCanvasSize();
        this.capabilities.supportsOffscreenCanvas = 'OffscreenCanvas' in window;
        
        // Input capabilities
        this.capabilities.maxTouchPoints = navigator.maxTouchPoints || 0;
        this.capabilities.hasKeyboard = !this.isMobile; // Rough approximation
        this.capabilities.hasMouse = !this.isMobile && !this.hasTouch;
    }

    /**
     * Check passive event listener support
     */
    checkPassiveEventSupport() {
        let supportsPassive = false;
        try {
            const options = {
                get passive() {
                    supportsPassive = true;
                    return false;
                }
            };
            window.addEventListener('test', null, options);
            window.removeEventListener('test', null, options);
        } catch (err) {
            supportsPassive = false;
        }
        return supportsPassive;
    }

    /**
     * Check WebGL support
     */
    checkWebGLSupport() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && 
                     canvas.getContext('webgl'));
        } catch (e) {
            return false;
        }
    }

    /**
     * Check localStorage support
     */
    checkLocalStorageSupport() {
        try {
            const test = 'test';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Check IndexedDB support
     */
    checkIndexedDBSupport() {
        return 'indexedDB' in window;
    }

    /**
     * Get maximum canvas size for this device
     */
    getMaxCanvasSize() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let maxSize = 32767; // WebGL limit
        
        // Test actual canvas limits
        for (let size = 16384; size <= maxSize; size *= 2) {
            canvas.width = size;
            canvas.height = size;
            
            if (!ctx || canvas.width !== size || canvas.height !== size) {
                maxSize = size / 2;
                break;
            }
        }
        
        return maxSize;
    }

    /**
     * Setup resize listener to update device info
     */
    setupResizeListener() {
        let resizeTimeout;
        
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.updateScreenInfo();
                this.onResize();
            }, 250);
        });

        // Listen for orientation changes
        if ('onorientationchange' in window) {
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    this.updateScreenInfo();
                    this.onOrientationChange();
                }, 100);
            });
        }
    }

    /**
     * Handle resize events
     */
    onResize() {
        console.log('DeviceDetection: Screen resized', this.screenInfo);
        
        // Re-detect device type based on new dimensions
        const wasMobile = this.isMobile;
        this.detectDevice();
        
        if (wasMobile !== this.isMobile) {
            console.log('DeviceDetection: Device type changed during resize');
        }
    }

    /**
     * Handle orientation change events
     */
    onOrientationChange() {
        console.log('DeviceDetection: Orientation changed', this.screenInfo.orientation);
    }

    /**
     * Get appropriate click radius based on device
     */
    getClickRadius() {
        if (this.isMobile) {
            return 30; // Larger for touch interfaces
        } else if (this.isTablet) {
            return 25;
        } else {
            return 15; // Smaller for precise mouse input
        }
    }

    /**
     * Get appropriate scroll sensitivity
     */
    getScrollSensitivity() {
        if (this.isMobile) {
            return 0.5; // Less sensitive for touch
        } else {
            return 1.0;
        }
    }

    /**
     * Get optimal canvas size for device
     */
    getOptimalCanvasSize() {
        const maxSize = Math.min(this.capabilities.maxCanvasSize, 16384);
        
        if (this.isMobile) {
            return Math.min(maxSize, 8192); // Smaller for mobile performance
        } else {
            return maxSize;
        }
    }

    /**
     * Check if device should use high DPI rendering
     */
    shouldUseHighDPI() {
        return this.screenInfo.devicePixelRatio > 1 && !this.isMobile;
    }

    /**
     * Get recommended event listener options
     */
    getEventOptions(passive = true) {
        if (this.capabilities.supportsPassiveEvents) {
            return { passive };
        }
        return false;
    }

    /**
     * Vibrate device if supported (mobile only)
     */
    vibrate(pattern = 100) {
        if (this.capabilities.supportsVibration && this.isMobile) {
            navigator.vibrate(pattern);
        }
    }

    /**
     * Get device-specific CSS classes
     */
    getCSSClasses() {
        const classes = [];
        
        if (this.isMobile) classes.push('mobile-device');
        if (this.isTablet) classes.push('tablet-device');
        if (this.isDesktop) classes.push('desktop-device');
        if (this.hasTouch) classes.push('touch-device');
        if (this.capabilities.isIPhone) classes.push('iphone');
        if (this.capabilities.isIPad) classes.push('ipad');
        if (this.capabilities.isAndroid) classes.push('android');
        
        return classes;
    }

    /**
     * Apply device-specific CSS classes to body
     */
    applyCSSClasses() {
        const classes = this.getCSSClasses();
        document.body.classList.add(...classes);
        console.log('DeviceDetection: Applied CSS classes:', classes);
    }

    /**
     * Get complete device information
     */
    getDeviceInfo() {
        return {
            type: {
                isMobile: this.isMobile,
                isTablet: this.isTablet,
                isDesktop: this.isDesktop,
                hasTouch: this.hasTouch
            },
            screen: this.screenInfo,
            capabilities: this.capabilities,
            userAgent: this.userAgent,
            recommendations: {
                clickRadius: this.getClickRadius(),
                scrollSensitivity: this.getScrollSensitivity(),
                optimalCanvasSize: this.getOptimalCanvasSize(),
                useHighDPI: this.shouldUseHighDPI()
            }
        };
    }

    /**
     * Check if device meets minimum requirements
     */
    meetsMinimumRequirements() {
        return this.capabilities.supportsIndexedDB && 
               this.capabilities.supportsFileAPI &&
               this.capabilities.maxCanvasSize >= 4096;
    }

    /**
     * Get performance tier for this device
     */
    getPerformanceTier() {
        let score = 0;
        
        // Screen size factor
        if (this.screenInfo.width >= 1920) score += 2;
        else if (this.screenInfo.width >= 1280) score += 1;
        
        // Device type factor
        if (this.isDesktop) score += 2;
        else if (this.isTablet) score += 1;
        
        // Capability factors
        if (this.capabilities.supportsWebGL) score += 1;
        if (this.capabilities.maxCanvasSize >= 16384) score += 1;
        if (this.screenInfo.devicePixelRatio > 1) score += 1;
        
        if (score >= 6) return 'high';
        if (score >= 3) return 'medium';
        return 'low';
    }
}