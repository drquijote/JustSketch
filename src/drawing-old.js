// src/drawing.js - FIXED VERSION - Resolved blinking interference with mobile input
import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

export class DrawingManager {
  constructor() {
    console.log('DrawingManager: Initializing');
    
    // Scale constants - IMPORTANT: Keep these in sync with CSS grid size
    this.PIXELS_PER_FOOT = 8;      // 8 pixels = 1 foot
    this.FEET_PER_GRID_SQUARE = 5; // Each background grid square = 5 feet  
    this.GRID_SIZE_PIXELS = 40;    // Each grid square = 40 pixels
    
    console.log('DrawingManager: Scale - 1 foot =', this.PIXELS_PER_FOOT, 'pixels');
    console.log('DrawingManager: Grid squares =', this.FEET_PER_GRID_SQUARE, 'feet each');
    
    // Drawing state
    this.isActive = false;
    this.currentPolygon = null;
    this.waitingForFirstVertex = false;
    this.waitingForDirection = false;
    this.waitingForVertexSelection = false; // NEW: for selecting resume point
    this.cursorBlinkInterval = null;
    this.showCursor = true;
    this.previewLine = null;
    
    // NEW: Blinking state for last vertex
    this.lastVertexBlinkInterval = null;
    this.showLastVertex = true;
    
    // FIXED: Add flag to prevent redraw during input
    this.suppressRedrawForInput = false;
    
    // Setup event listeners for integration
    this.setupEventListeners();
    
    console.log('DrawingManager: Initialized');
  }
  
  setupEventListeners() {
    // Listen for canvas redraw events
    AppState.on('canvas:redraw:lines', () => this.drawLines());
    AppState.on('canvas:redraw:polygons', () => this.drawPolygons());
    AppState.on('canvas:redraw:ui', () => this.drawUI());
    
    // Listen for mode changes
    AppState.on('mode:changed', (e) => {
      if (e.detail.mode === 'drawing') {
        this.activate();
      } else {
        this.deactivate();
      }
    });
    
    // NEW: Listen for polygon interaction events
    AppState.on('polygon:mousedown', (e) => this.handlePolygonMouseDown(e.detail));
    AppState.on('polygon:mousemove', (e) => this.handlePolygonMouseMove(e.detail));
    AppState.on('polygon:mouseup', (e) => this.handlePolygonMouseUp(e.detail));
    
    console.log('DrawingManager: Event listeners setup complete');
  }
  
  activate() {
    if (this.isActive) return;
    
    console.log('DrawingManager: Activating drawing mode');
    this.isActive = true;
    this.mousePosition = { x: 0, y: 0 };
    
    // Initialize dragging state
    this.draggedPolygon = null;
    this.dragStartPos = null;
    this.originalPolygonPoints = null;
    this.draggedElements = null;
    this.originalElementPositions = null;
    
    // Remove polygon dragging when entering drawing mode
    this.removePolygonDragging();
    
    // Check if we have an existing incomplete polygon to resume
    if (AppState.currentPolygonPoints.length > 0) {
      console.log('DrawingManager: Found existing polygon with', AppState.currentPolygonPoints.length, 'points - entering resume mode');
      this.waitingForFirstVertex = false;
      this.waitingForDirection = false;
      this.waitingForVertexSelection = true; // NEW state for selecting resume point
      
      // FIXED: Use less aggressive blinking for vertex selection
      this.startBlinkingCursor(1000); // Slower blink for vertex selection
    } else {
      console.log('DrawingManager: No existing polygon - starting fresh');
      this.waitingForFirstVertex = true;
      this.waitingForDirection = false;
      this.waitingForVertexSelection = false;
      
      // FIXED: Use slower blinking to reduce interference
      this.startBlinkingCursor(750); // Slower blink to reduce interference
    }
    
    // Show drawing UI elements
    this.showDrawingUI();
    
    // Add event listeners for canvas interactions (both mouse and touch)
    const canvas = AppState.canvas;
    if (canvas) {
      // Use mousedown/touchstart instead of click for better control
      canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
      canvas.addEventListener('touchstart', this.handleCanvasMouseDown.bind(this), { passive: false });
      canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
      canvas.addEventListener('touchmove', this.handleMouseMove.bind(this), { passive: false });
    }
    
    // Add directional pad listeners
    this.setupDirectionalPad();
    
    // Listen for undo/redo events to handle current polygon state
    AppState.on('history:undo', this.handleHistoryChange.bind(this));
    AppState.on('history:redo', this.handleHistoryChange.bind(this));
    
    const modeText = this.waitingForVertexSelection ? 'click near any vertex to resume drawing' : 'click to place first vertex';
    console.log('DrawingManager:', modeText);
    AppState.emit('ui:drawing:activated');
  }
  

updateActiveInputVisuals(activeInput) {
  if (!this.isMobileDevice()) return; // Only run on mobile

  const distanceInput = document.getElementById('distanceDisplay');
  const angleInput = document.getElementById('angleDisplay');

  // First, remove the class from both inputs
  if (distanceInput) distanceInput.classList.remove('mobile-input-active');
  if (angleInput) angleInput.classList.remove('mobile-input-active');

  // Then, add it to the designated active input with additional styling
  if (activeInput) {
    activeInput.classList.add('mobile-input-active');
    
    // Additional visual feedback for mobile
    activeInput.style.borderColor = '#3498db';
    activeInput.style.boxShadow = '0 0 8px rgba(52, 152, 219, 0.6)';
    
    // Remove visual feedback from the inactive input
    const inactiveInput = activeInput === distanceInput ? angleInput : distanceInput;
    if (inactiveInput) {
      inactiveInput.style.borderColor = '';
      inactiveInput.style.boxShadow = '';
    }
    
    console.log('DrawingManager: Visual focus indicators updated for mobile');
  }
}

  deactivate() {
    if (!this.isActive) return;
    
    console.log('DrawingManager: Deactivating drawing mode');
    this.isActive = false;
    
    // CRITICAL: Reset ALL drawing states immediately
    this.waitingForFirstVertex = false;
    this.waitingForDirection = false;
    this.waitingForVertexSelection = false;
    
    // CRITICAL: Stop all blinking immediately
    this.stopBlinkingCursor();
    this.stopLastVertexBlink();
    
    // Clear mouse position to prevent cursor drawing
    this.mousePosition = null;
    
    // FIXED: Clear any pending keypad timeouts
    if (this.keypadClickTimeout) {
      clearTimeout(this.keypadClickTimeout);
      this.keypadClickTimeout = null;
    }
    
    // FIXED: Reset redraw suppression
    this.suppressRedrawForInput = false;
    
    // Hide drawing UI elements
    this.hideDrawingUI();
    
    // Remove ALL canvas event listeners for drawing (both mouse and touch)
    const canvas = AppState.canvas;
    if (canvas) {
      // Remove mouse events
      canvas.removeEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
      canvas.removeEventListener('mousemove', this.handleMouseMove.bind(this));
      canvas.removeEventListener('click', this.handleCanvasMouseDown.bind(this));
      
      // Remove touch events
      canvas.removeEventListener('touchstart', this.handleCanvasMouseDown.bind(this));
      canvas.removeEventListener('touchmove', this.handleMouseMove.bind(this));
    }
    
    // Remove directional pad listeners
    this.removeDirectionalPad();
    
    // Remove history event listeners
    AppState.events.removeEventListener('history:undo', this.handleHistoryChange.bind(this));
    AppState.events.removeEventListener('history:redo', this.handleHistoryChange.bind(this));
    
    // Clean up any dragging state
    this.draggedPolygon = null;
    this.dragStartPos = null;
    this.originalPolygonPoints = null;
    this.draggedElements = null;
    this.originalElementPositions = null;
    
    // Setup polygon dragging when not in drawing mode
    this.setupPolygonDragging();
    
    // Force a redraw to clear any blinking cursors
    CanvasManager.redraw();
    
    console.log('DrawingManager: Drawing mode fully deactivated. Points preserved:', AppState.currentPolygonPoints.length);
    
    AppState.emit('ui:drawing:deactivated');
  }
  
  // FIXED: Modified to accept custom blink interval and prevent interference during input
  startBlinkingCursor(interval = 750) {
    this.showCursor = true;
    this.cursorBlinkInterval = setInterval(() => {
      // FIXED: Don't blink if we're suppressing redraws for input
      if (this.suppressRedrawForInput) {
        return;
      }
      
      this.showCursor = !this.showCursor;
      CanvasManager.redraw();
    }, interval); // Use custom interval, default to 750ms for less interference
  }
  
  stopBlinkingCursor() {
    if (this.cursorBlinkInterval) {
      clearInterval(this.cursorBlinkInterval);
      this.cursorBlinkInterval = null;
    }
    this.showCursor = false;
    console.log('DrawingManager: Blinking cursor stopped');
  }
  
  // FIXED: Modified to accept custom blink interval and prevent interference during input
  startLastVertexBlink(interval = 1000) {
    this.showLastVertex = true;
    this.lastVertexBlinkInterval = setInterval(() => {
      // FIXED: Don't blink if we're suppressing redraws for input
      if (this.suppressRedrawForInput) {
        return;
      }
      
      this.showLastVertex = !this.showLastVertex;
      CanvasManager.redraw();
    }, interval); // Use custom interval, default to 1000ms for less interference
  }
  
  stopLastVertexBlink() {
    if (this.lastVertexBlinkInterval) {
      clearInterval(this.lastVertexBlinkInterval);
      this.lastVertexBlinkInterval = null;
    }
    this.showLastVertex = true; // Always show when not blinking
    console.log('DrawingManager: Last vertex blinking stopped');
  }
  
  // NEW: Handle mouse down for both drawing and dragging
  handleCanvasMouseDown(e) {
    // CRITICAL: Only handle drawing if actually in drawing mode
    if (!this.isActive) {
      console.log('DrawingManager: Mouse down ignored - not in drawing mode');
      return;
    }
    
    // For vertex placement, we also use CanvasManager coordinate system
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const pos = CanvasManager.screenToCanvas(clientX, clientY);
    
    if (this.waitingForFirstVertex) {
      // Place first vertex (fresh start)
      this.placeFirstVertex(pos.x, pos.y);
    } else if (this.waitingForVertexSelection) {
      // User is selecting which vertex to resume from
      const selectedVertex = this.findNearestVertex(pos.x, pos.y);
      if (selectedVertex !== null) {
        this.resumeFromVertex(selectedVertex);
      } else {
        console.log('DrawingManager: No vertex found near click - place first vertex instead');
        this.placeFirstVertex(pos.x, pos.y);
      }
    }
  }
  
  // NEW: Setup polygon dragging when not in drawing mode
  setupPolygonDragging() {
    const canvas = AppState.canvas;
    if (!canvas) return;
    
    console.log('DrawingManager: Setting up polygon dragging');
    
    const handlePointerDown = (e) => {
      // For polygon dragging, use CanvasManager coordinate system (same as drawing)
      let clientX, clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      
      const pos = CanvasManager.screenToCanvas(clientX, clientY);
      
      // PRIORITY 1: Check if clicking on an individual element first
      // This needs to be checked before polygon detection to allow individual element dragging
      const clickedElement = this.getElementAt(pos.x, pos.y);
      if (clickedElement) {
        console.log('DrawingManager: Clicked on individual element, not starting polygon drag');
        // Let the existing element drag system handle this
        return;
      }
      
      // PRIORITY 2: If no element was clicked, check for polygon dragging
      const clickedPolygon = this.getPolygonAt(pos.x, pos.y);
      if (clickedPolygon) {
        console.log('DrawingManager: Starting polygon drag');
        e.preventDefault();
        e.stopPropagation();
        
        // Start polygon drag
        AppState.emit('polygon:mousedown', {
          polygon: clickedPolygon,
          mousePos: pos
        });
        
        // Setup move and up handlers that work with both mouse and touch
        const handlePointerMove = (e) => {
          let clientX, clientY;
          if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
          } else {
            clientX = e.clientX;
            clientY = e.clientY;
          }
          
          const pos = CanvasManager.screenToCanvas(clientX, clientY);
          AppState.emit('polygon:mousemove', { mousePos: pos });
        };
        
        const handlePointerUp = (e) => {
          console.log('DrawingManager: Ending polygon drag');
          
          let clientX, clientY;
          if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
          } else {
            clientX = e.clientX || 0;
            clientY = e.clientY || 0;
          }
          
          const pos = CanvasManager.screenToCanvas(clientX, clientY);
          AppState.emit('polygon:mouseup', { mousePos: pos });
          
          // Clean up temporary listeners - both mouse and touch
          canvas.removeEventListener('mousemove', handlePointerMove);
          canvas.removeEventListener('mouseup', handlePointerUp);
          canvas.removeEventListener('touchmove', handlePointerMove);
          canvas.removeEventListener('touchend', handlePointerUp);
          document.removeEventListener('mouseup', handlePointerUp);
          document.removeEventListener('touchend', handlePointerUp);
        };
        
        // Add temporary listeners for both mouse and touch
        canvas.addEventListener('mousemove', handlePointerMove);
        canvas.addEventListener('mouseup', handlePointerUp);
        canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
        canvas.addEventListener('touchend', handlePointerUp);
        document.addEventListener('mouseup', handlePointerUp);
        document.addEventListener('touchend', handlePointerUp);
      }
    };
    
    // Add listeners for both mouse and touch events
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
    
    // Store reference to remove later if needed
    this.polygonDragHandler = handlePointerDown;
    this.polygonDragHandlerTouch = handlePointerDown; // Same handler for both
  }
  
  // NEW: Check if there's an element at the given coordinates (borrowed from sketch.js logic)
  getElementAt(x, y) {
    // Check placedElements in reverse order (most recently placed first)
    for (let i = AppState.placedElements.length - 1; i >= 0; i--) {
      const element = AppState.placedElements[i];
      
      // Check if click is within element bounds
      if (x >= element.x && x <= element.x + element.width && 
          y >= element.y && y <= element.y + element.height) {
        console.log('DrawingManager: Found element at coordinates:', element);
        return element;
      }
    }
    return null;
  }
  
  // NEW: Remove polygon dragging
  removePolygonDragging() {
    const canvas = AppState.canvas;
    if (canvas) {
      // Remove both mouse and touch handlers
      if (this.polygonDragHandler) {
        canvas.removeEventListener('mousedown', this.polygonDragHandler);
        canvas.removeEventListener('touchstart', this.polygonDragHandler);
        this.polygonDragHandler = null;
        this.polygonDragHandlerTouch = null;
      }
      console.log('DrawingManager: Removed polygon dragging (mouse and touch)');
    }
  }
  
  // NEW: Find the nearest vertex within clicking distance
  findNearestVertex(x, y) {
    const CLICK_THRESHOLD = 20; // pixels - how close you need to click to a vertex
    let nearestIndex = null;
    let nearestDistance = Infinity;
    
    AppState.currentPolygonPoints.forEach((point, index) => {
      const distance = Math.sqrt(
        Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2)
      );
      
      if (distance < CLICK_THRESHOLD && distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    
    if (nearestIndex !== null) {
      console.log('DrawingManager: Found vertex', AppState.currentPolygonPoints[nearestIndex].name, 'at distance', nearestDistance.toFixed(1));
    }
    
    return nearestIndex;
  }
  
  // NEW: Resume drawing from a selected vertex
  resumeFromVertex(vertexIndex) {
    console.log('DrawingManager: Resuming from vertex', AppState.currentPolygonPoints[vertexIndex].name);
    
    // Truncate the polygon at the selected vertex (remove points after it)
    AppState.currentPolygonPoints = AppState.currentPolygonPoints.slice(0, vertexIndex + 1);
    AppState.currentPolygonCounter = AppState.currentPolygonPoints.length;
    
    // Switch to direction waiting mode
    this.waitingForVertexSelection = false;
    this.waitingForDirection = true;
    
    // Stop cursor blinking, start last vertex blinking
    this.stopBlinkingCursor();
    this.startLastVertexBlink(1000); // Slower blink to reduce interference
    
    // FIXED: Temporarily suppress redraws during focus to prevent interference
    this.suppressRedrawForInput = true;
    
    // CRITICAL: Focus distance input for keyboard input
    const distanceInput = document.getElementById('distanceDisplay');
    if (distanceInput) {
      // FIXED: Only prevent native keyboard on mobile devices
      if (this.isMobileDevice()) {
        distanceInput.setAttribute('readonly', 'readonly');
        distanceInput.setAttribute('inputmode', 'none');
      } else {
        distanceInput.removeAttribute('readonly');
        distanceInput.removeAttribute('inputmode');
      }
      
      distanceInput.value = '0';
      
      // FIXED: Clear the decimal input sequence when resuming
      this.distanceInputSequence = [];
      console.log('DrawingManager: Distance input sequence cleared after vertex resume');
      
      // FIXED: Improved focus handling with suppression
      setTimeout(() => {
        distanceInput.focus();
        distanceInput.select();
        console.log('DrawingManager: Distance input focused after vertex resume');
        this.updateActiveInputVisuals(distanceInput);
        
        // FIXED: Re-enable redraws after focus is established
        setTimeout(() => {
          this.suppressRedrawForInput = false;
        }, 200);
        
        // Double-check focus worked
        if (document.activeElement !== distanceInput) {
          console.warn('DrawingManager: Distance input failed to focus on resume, trying again');
          distanceInput.click();
          distanceInput.focus();
        }
      }, 100);
    }
    
    // Save the truncated state
    CanvasManager.saveAction();
    CanvasManager.redraw();
    
    console.log('DrawingManager: Ready to continue from', AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1].name);
  }
  
  handleMouseMove(e) {
    // CRITICAL: Only handle mouse move if actually in drawing mode
    if (!this.isActive) return;
    
    // For cursor tracking, we need to use the CanvasManager coordinate system
    // This should match exactly what the drawUI method expects
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    // Use CanvasManager for cursor tracking (this is what drawUI expects)
    const pos = CanvasManager.screenToCanvas(clientX, clientY);
    this.mousePosition = pos;
    
    // FIXED: Only redraw if we're waiting for first vertex and not suppressing redraws
    if (this.waitingForFirstVertex && !this.suppressRedrawForInput) {
      CanvasManager.redraw();
    }
  }
  
  showDrawingUI() {
    console.log('DrawingManager: Showing drawing UI elements');
    
    // Show the numbers palette (which contains the direction pad and numeric keypad)
    const drawPalette = document.getElementById('drawPalette');
    if (drawPalette) {
      drawPalette.classList.remove('hidden');
    }
    
    // Show and setup the distance display field
    const distanceDisplay = document.getElementById('distanceDisplay');
    if (distanceDisplay) {
      distanceDisplay.style.display = 'block';
      distanceDisplay.value = '0'; // Reset to 0
      
      // FIXED: Only prevent native keyboard on mobile devices
      if (this.isMobileDevice()) {
        distanceDisplay.setAttribute('readonly', 'readonly');
        distanceDisplay.setAttribute('inputmode', 'none');
        distanceDisplay.style.caretColor = 'transparent';
        console.log('Distance field setup - mobile device detected, native keyboard prevented');
      } else {
        // Desktop - allow normal keyboard input
        distanceDisplay.removeAttribute('readonly');
        distanceDisplay.removeAttribute('inputmode');
        distanceDisplay.setAttribute('type', 'text');
        distanceDisplay.tabIndex = 0;
        distanceDisplay.style.pointerEvents = 'auto';
        console.log('Distance field setup - desktop device, keyboard input allowed');
      }
    }
    
    // FIXED: Also setup the angle display field
    const angleDisplay = document.getElementById('angleDisplay');
    if (angleDisplay) {
      angleDisplay.value = '0.0'; // Reset to 0.0 for angle
      
      // FIXED: Apply same mobile/desktop logic to angle field
      if (this.isMobileDevice()) {
        angleDisplay.setAttribute('readonly', 'readonly');
        angleDisplay.setAttribute('inputmode', 'none');
        angleDisplay.style.caretColor = 'transparent';
        console.log('Angle field setup - mobile device detected, native keyboard prevented');
      } else {
        // Desktop - allow normal keyboard input
        angleDisplay.setAttribute('readonly', 'readonly');
        angleDisplay.setAttribute('inputmode', 'none');
        angleDisplay.style.caretColor = 'transparent';
        console.log('Angle field setup - mobile device detected, native keyboard prevented');
      }
    }
    
    // Make sure the directional pad is visible
    const directionalPad = document.getElementById('directionalPad');
    if (directionalPad) {
      directionalPad.style.display = 'grid';
    }
    
    // Make sure the numeric keypad is visible
    const numericKeypad = document.querySelector('.numeric-keypad');
    if (numericKeypad) {
      numericKeypad.style.display = 'grid';
    }
    
    // Activate the numbers button to show it's selected
    const numbersBtn = document.getElementById('numbersBtn');
    if (numbersBtn) {
      numbersBtn.classList.add('active');
    }
    
    // Deactivate other palette buttons
    const paletteButtons = document.querySelectorAll('[data-palette]');
    paletteButtons.forEach(btn => {
      if (btn.id !== 'numbersBtn') {
        btn.classList.remove('active');
      }
    });
  }
  
  // Helper method to detect mobile devices
  isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
  }
  
  hideDrawingUI() {
    console.log('DrawingManager: Hiding drawing UI elements');
    
    // We don't need to hide the draw palette since switching modes will handle this
    // Just make sure the numbers button is no longer forced active
    const numbersBtn = document.getElementById('numbersBtn');
    if (numbersBtn) {
      numbersBtn.classList.remove('active');
    }
  }
  
  placeFirstVertex(x, y) {
    console.log('DrawingManager: Placing first vertex at:', x, y);
    
    const firstPoint = {
      x: x,
      y: y,
      name: 'p0'
    };
    
    // Store in AppState instead of local variables
    AppState.currentPolygonPoints = [firstPoint];
    AppState.currentPolygonCounter = 1;
    
    this.waitingForFirstVertex = false;
    this.waitingForDirection = true;
    
    // Stop blinking cursor
    this.stopBlinkingCursor();
    
    // FIXED: Start last vertex blinking with slower interval
    this.startLastVertexBlink(1000);
    
    // Save action for undo support
    CanvasManager.saveAction();
    
    // FIXED: Temporarily suppress redraws during focus to prevent interference
    this.suppressRedrawForInput = true;
    
    // CRITICAL: Focus the distance input but prevent native keyboard ONLY on mobile
    const distanceInput = document.getElementById('distanceDisplay');
    if (distanceInput) {
      // FIXED: Only prevent native keyboard on mobile devices
      if (this.isMobileDevice()) {
        distanceInput.setAttribute('readonly', 'readonly');
        distanceInput.setAttribute('inputmode', 'none');
        distanceInput.style.caretColor = 'transparent';
      } else {
        // Desktop - allow normal keyboard input
        distanceInput.removeAttribute('readonly');
        distanceInput.removeAttribute('inputmode');
      }
      
      // Set up for input
      distanceInput.value = '0';
      
      // FIXED: Clear the decimal input sequence when placing first vertex
      this.distanceInputSequence = [];
      console.log('DrawingManager: Distance input sequence cleared after first vertex placement');
      
      // FIXED: Improved focus handling with suppression
      setTimeout(() => {
        distanceInput.focus();
        distanceInput.select(); // Select all text so user can immediately type
        console.log('DrawingManager: Distance input focused and selected');
        
        // FIXED: Re-enable redraws after focus is established
        setTimeout(() => {
          this.suppressRedrawForInput = false;
        }, 200);
        
        // Double-check focus worked
        if (document.activeElement !== distanceInput) {
          console.warn('DrawingManager: Distance input failed to focus, trying again');
          distanceInput.click(); // Try clicking to focus
          distanceInput.focus();
        }
      }, 100);
      this.updateActiveInputVisuals(distanceInput);

      console.log('DrawingManager: First vertex p0 placed. Waiting for distance and direction.');
      CanvasManager.redraw();

    } else {
      console.error('DrawingManager: Distance input not found!');
      // FIXED: Re-enable redraws even if input not found
      this.suppressRedrawForInput = false;
    }
    
    console.log('DrawingManager: First vertex p0 placed. Waiting for distance and direction.');
    CanvasManager.redraw();
  }
  
  setupDirectionalPad() {
    // Get all directional buttons
    const directionButtons = document.querySelectorAll('.dir-btn');
    
    directionButtons.forEach(button => {
      button.addEventListener('click', this.handleDirectionClick.bind(this));
    });
    
    // Setup numeric keypad buttons
    this.setupNumericKeypad();
  }
  
  removeDirectionalPad() {
    const directionButtons = document.querySelectorAll('.dir-btn');
    
    directionButtons.forEach(button => {
      button.removeEventListener('click', this.handleDirectionClick.bind(this));
    });
    
    // Remove numeric keypad listeners
    this.removeNumericKeypad();
  }
  
  setupNumericKeypad() {
    console.log('DrawingManager: Setting up numeric keypad');
    
    // FIXED: Store bound handler to ensure we can remove it later
    this.boundHandleKeypadClick = this.handleKeypadClick.bind(this);
    
    // Get all numeric keypad buttons
    const keypadButtons = document.querySelectorAll('.key-btn');
    
    keypadButtons.forEach(button => {
      // FIXED: Remove any existing listeners first to prevent duplicates
      button.removeEventListener('click', this.boundHandleKeypadClick);
      button.addEventListener('click', this.boundHandleKeypadClick);
    });
    
    // Setup decimal input handling for both distance and angle fields
    this.setupDecimalInputHandling();
    
    // Setup global keyboard arrow key listeners
    this.setupArrowKeyListeners();
  }
  
  // NEW: Setup decimal input handling for distance and angle fields
  setupDecimalInputHandling() {
    // Initialize input sequences for both fields
    this.distanceInputSequence = [];
    this.angleInputSequence = [];
    
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    
    // Setup distance input
    if (distanceInput) {
      // FIXED: Different handling for mobile vs desktop
      if (this.isMobileDevice()) {
        // Mobile - prevent direct input, use keypad only
        distanceInput.addEventListener('input', (e) => {
          e.preventDefault();
          console.log('Direct input prevented on mobile');
        });
        
        distanceInput.addEventListener('keydown', (e) => {
          e.preventDefault(); // Prevent all keyboard input on mobile
          console.log('Keydown prevented on mobile');
        });
      } else {
        // Desktop - use decimal input handler
        this.boundHandleDistanceDecimalInput = this.handleDecimalInput.bind(this, 'distance');
        distanceInput.addEventListener('keydown', this.boundHandleDistanceDecimalInput);
        
        distanceInput.addEventListener('focus', () => {
          console.log('Distance field focused');
        });
      }
    }
    
    // Setup angle input
    if (angleInput) {
      if (this.isMobileDevice()) {
        // Mobile - prevent direct input, use keypad only
        angleInput.addEventListener('input', (e) => {
          e.preventDefault();
          console.log('Angle direct input prevented on mobile');
        });
        
        angleInput.addEventListener('keydown', (e) => {
          e.preventDefault(); // Prevent all keyboard input on mobile
          console.log('Angle keydown prevented on mobile');
        });
      } else {
        // Desktop - use decimal input handler
        this.boundHandleAngleDecimalInput = this.handleDecimalInput.bind(this, 'angle');
        angleInput.addEventListener('keydown', this.boundHandleAngleDecimalInput);
        
        angleInput.addEventListener('focus', () => {
          console.log('Angle field focused');
        });
      }
    }
  }
  
  // NEW: Decimal input handler for distance and angle fields
  handleDecimalInput(fieldType, event) {
    const input = event.target;
    const key = event.key;
    
    // Determine which input sequence to use
    let inputSequence;
    if (fieldType === 'distance') {
      inputSequence = this.distanceInputSequence;
    } else if (fieldType === 'angle') {
      inputSequence = this.angleInputSequence;
    } else {
      return;
    }
    
    // Check if the key is a digit (0-9)
    if (/^[0-9]$/.test(key)) {
      event.preventDefault(); // Prevent default key entry
      inputSequence.push(parseInt(key)); // Add digit to sequence
      
      // Calculate the number: treat sequence as digits building a decimal
      let number = 0;
      for (let i = 0; i < inputSequence.length; i++) {
        number = number * 10 + inputSequence[i];
      }
      number = number / 10; // Shift for one decimal place
      
      // Update input field with one decimal place
      input.value = number.toFixed(1);
      
      console.log(`${fieldType} decimal input: sequence [${inputSequence.join(',')}] = ${number.toFixed(1)}`);
      
    } else if (key === 'Backspace') {
      event.preventDefault(); // Prevent default backspace
      inputSequence.pop(); // Remove last digit
      
      // Recalculate number or reset to empty/zero
      if (inputSequence.length === 0) {
        input.value = fieldType === 'distance' ? '0' : '0.0';
      } else {
        let number = 0;
        for (let i = 0; i < inputSequence.length; i++) {
          number = number * 10 + inputSequence[i];
        }
        number = number / 10;
        input.value = number.toFixed(1);
      }
      
      console.log(`${fieldType} backspace: sequence [${inputSequence.join(',')}] = ${input.value}`);
      
    } else if (key === 'Enter') {
      event.preventDefault();
      if (fieldType === 'distance') {
        // Could auto-advance to direction selection
        console.log('Enter pressed on distance field');
      } else if (fieldType === 'angle') {
        console.log('Enter pressed on angle field');
      }
    }
    
    // Update the appropriate input sequence reference
    if (fieldType === 'distance') {
      this.distanceInputSequence = inputSequence;
    } else if (fieldType === 'angle') {
      this.angleInputSequence = inputSequence;
    }
  }
  
  removeNumericKeypad() {
    const keypadButtons = document.querySelectorAll('.key-btn');
    
    keypadButtons.forEach(button => {
      if (this.boundHandleKeypadClick) {
        button.removeEventListener('click', this.boundHandleKeypadClick);
      }
    });
    
    // Remove decimal input handlers
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    
    if (distanceInput && this.boundHandleDistanceDecimalInput) {
      distanceInput.removeEventListener('keydown', this.boundHandleDistanceDecimalInput);
      this.boundHandleDistanceDecimalInput = null;
    }
    
    if (angleInput && this.boundHandleAngleDecimalInput) {
      angleInput.removeEventListener('keydown', this.boundHandleAngleDecimalInput);
      this.boundHandleAngleDecimalInput = null;
    }
    
    // Clear input sequences
    this.distanceInputSequence = [];
    this.angleInputSequence = [];
    
    // Remove arrow key listeners
    this.removeArrowKeyListeners();
  }
  
  setupArrowKeyListeners() {
    console.log('DrawingManager: Setting up arrow key listeners');
    
    // Add global keydown listener for arrow keys
    this.arrowKeyHandler = (e) => {
      // Only handle arrow keys when we're waiting for direction and drawing mode is active
      if (!this.isActive || !this.waitingForDirection) return;
      
      // FIXED: Check if angle input is visible - if so, don't use arrow keys for direction
      const angleInput = document.getElementById('angleDisplay');
      const isAngleMode = angleInput && !angleInput.classList.contains('hidden');
      
      if (isAngleMode) {
        console.log('DrawingManager: Arrow keys disabled in angle mode');
        return; // Don't handle arrow keys when in angle mode
      }
      
      let direction = null;
      
      switch (e.key) {
        case 'ArrowRight':
          direction = 0; // East
          e.preventDefault();
          break;
        case 'ArrowUp':
          direction = 90; // North
          e.preventDefault();
          break;
        case 'ArrowLeft':
          direction = 180; // West
          e.preventDefault();
          break;
        case 'ArrowDown':
          direction = 270; // South
          e.preventDefault();
          break;
        default:
          return; // Not an arrow key we handle
      }
      
      console.log('DrawingManager: Arrow key pressed:', e.key, 'direction:', direction);
      
      // Get distance from input field
      const distanceInput = document.getElementById('distanceDisplay');
      if (!distanceInput) {
        console.warn('Distance input not found');
        return;
      }
      
      const distance = parseFloat(distanceInput.value);
      if (isNaN(distance) || distance <= 0) {
        console.warn('Invalid distance:', distanceInput.value);
        alert('Please enter a valid distance greater than 0');
        distanceInput.focus();
        return;
      }
      
      console.log('DrawingManager: Using keyboard arrow - distance:', distance, 'direction:', direction);
      
      // Calculate new point using polar coordinates
      this.addPointWithPolarCoordinates(distance, direction);
    };
    
    // Add the event listener to document so it works globally
    document.addEventListener('keydown', this.arrowKeyHandler);
  }
  
  removeArrowKeyListeners() {
    if (this.arrowKeyHandler) {
      document.removeEventListener('keydown', this.arrowKeyHandler);
      this.arrowKeyHandler = null;
      console.log('DrawingManager: Arrow key listeners removed');
    }
  }
  
  // FIXED: Improved keypad handling to prevent interference with blinking and support decimal sequences
  handleKeypadClick(e) {
    // FIXED: Prevent event bubbling and default behavior
    e.preventDefault();
    e.stopPropagation();
    
    console.log('DrawingManager: Keypad button clicked:', e.target.textContent);
    
    // Determine which input field is currently focused or should be targeted
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    const activeElement = document.activeElement;
    
    let targetInput;
    let inputSequence;
    let fieldType;
    
    // Determine target input field
    if (activeElement === angleInput || (!distanceInput && angleInput)) {
      targetInput = angleInput;
      inputSequence = this.angleInputSequence || [];
      fieldType = 'angle';
    } else {
      targetInput = distanceInput; // Default to distance
      inputSequence = this.distanceInputSequence || [];
      fieldType = 'distance';
    }
    
    if (!targetInput) {
      console.warn('No target input found');
      return;
    }
    
    const buttonText = e.target.textContent.trim();
    
    // FIXED: Temporarily suppress redraws during input operations
    this.suppressRedrawForInput = true;
    
    // FIXED: Add debouncing to prevent double inputs
    if (this.keypadClickTimeout) {
      clearTimeout(this.keypadClickTimeout);
    }
    
    this.keypadClickTimeout = setTimeout(() => {
      switch (buttonText) {
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          // Add digit to sequence using decimal input logic
          const digit = parseInt(buttonText);
          inputSequence.push(digit);
          
          // Calculate the number: treat sequence as digits building a decimal
          let number = 0;
          for (let i = 0; i < inputSequence.length; i++) {
            number = number * 10 + inputSequence[i];
          }
          number = number / 10; // Shift for one decimal place
          
          // Update input field with one decimal place
          targetInput.value = number.toFixed(1);
          
          console.log(`${fieldType} keypad input: sequence [${inputSequence.join(',')}] = ${number.toFixed(1)}`);
          break;
          
        case 'del':
          // Remove last digit using decimal input logic
          inputSequence.pop();
          
          // Recalculate number or reset to zero
          if (inputSequence.length === 0) {
            targetInput.value = fieldType === 'distance' ? '0' : '0.0';
          } else {
            let number = 0;
            for (let i = 0; i < inputSequence.length; i++) {
              number = number * 10 + inputSequence[i];
            }
            number = number / 10;
            targetInput.value = number.toFixed(1);
          }
          
          console.log(`${fieldType} keypad delete: sequence [${inputSequence.join(',')}] = ${targetInput.value}`);
          break;
          
        case 'clear':
          // Clear the field and sequence
          inputSequence.length = 0; // Clear array
          targetInput.value = fieldType === 'distance' ? '0' : '0.0';
          console.log(`${fieldType} keypad cleared`);
          break;
          
        case 'cls':
          // Close/exit (could close the palette or exit drawing mode)
          console.log('Close button pressed');
          break;
          
        case 'angle':
          // Handle angle button - show angle input and focus it
          console.log('DrawingManager: Angle button clicked');
          
          // Show the angle input field
          const angleDisplay = document.getElementById('angleDisplay');
          const cornerArrows = document.querySelectorAll('.dir-btn.up-left, .dir-btn.up-right, .dir-btn.down-left, .dir-btn.down-right');
          
          if (angleDisplay) {
            if (angleDisplay.classList.contains('hidden')) {
              // Show angle input
              angleDisplay.classList.remove('hidden');
              cornerArrows.forEach(arrow => { 
                arrow.style.backgroundColor = '#FFB366'; 
              });
              
              // FIXED: Focus the angle input instead of distance input
              // Temporarily suppress redraws during focus
              this.suppressRedrawForInput = true;
              
              setTimeout(() => {
                angleDisplay.focus();
                angleDisplay.select();
                console.log('DrawingManager: Angle input focused after angle button click');
                
                // Re-enable redraws after focus
                setTimeout(() => {
                  this.suppressRedrawForInput = false;
                }, 100);
              }, 50);
              this.updateActiveInputVisuals(angleDisplay);
            } else {
              // Hide angle input and refocus distance
              angleDisplay.classList.add('hidden');
              cornerArrows.forEach(arrow => { 
                arrow.style.backgroundColor = '#3498db'; 
              });
              
              // Refocus distance input
              this.suppressRedrawForInput = true;
              setTimeout(() => {
                if (targetInput && targetInput !== angleDisplay) {
                  targetInput.focus();
                  targetInput.select();
                }
                setTimeout(() => {
                  this.suppressRedrawForInput = false;
                }, 100);
              }, 50);
              this.updateActiveInputVisuals(angleDisplay);
            }
          }
          
          // Don't call window.showangleinput() as it conflicts with our logic
          break;
          
        default:
          console.log('Unhandled keypad button:', buttonText);
      }
      
      // Update the input sequence reference
      if (fieldType === 'distance') {
        this.distanceInputSequence = inputSequence;
      } else if (fieldType === 'angle') {
        this.angleInputSequence = inputSequence;
      }
      
      // FIXED: Re-enable redraws after input operation
      setTimeout(() => {
        this.suppressRedrawForInput = false;
      }, 100);
      
      // FIXED: Only focus on desktop, not mobile (to avoid any keyboard triggering)
      if (!this.isMobileDevice()) {
        targetInput.focus();
      }
    }, 50); // Small delay to debounce
  }
  
  handleDirectionClick(e) {
    if (!this.isActive || !this.waitingForDirection) return;
    
    console.log('DrawingManager: Direction button clicked:', e.target.className);
    
    // Skip the center button - it's not a direction
    if (e.target.classList.contains('center')) {
      console.log('DrawingManager: Center button clicked - ignoring');
      return;
    }
    
    // FIXED: Check if angle input is visible and use it, otherwise use distance
    const angleInput = document.getElementById('angleDisplay');
    const distanceInput = document.getElementById('distanceDisplay');
    const isAngleMode = angleInput && !angleInput.classList.contains('hidden');
    
    let distance, direction;
    
    if (isAngleMode) {
      // Using angle mode - get angle from angle input
      const angleValue = parseFloat(angleInput.value);
      if (isNaN(angleValue)) {
        console.warn('Invalid angle:', angleInput.value);
        alert('Please enter a valid angle');
        angleInput.focus();
        return;
      }
      
      // For angle mode, distance comes from distance field, direction from angle field
      if (!distanceInput) {
        console.warn('Distance input not found');
        return;
      }
      
      distance = parseFloat(distanceInput.value);
      if (isNaN(distance) || distance <= 0) {
        console.warn('Invalid distance:', distanceInput.value);
        alert('Please enter a valid distance greater than 0');
        distanceInput.focus();
        return;
      }
      
      direction = angleValue; // Use angle directly
      console.log('DrawingManager: Using angle mode - distance:', distance, 'angle:', direction);
      
    } else {
      // Using directional pad mode - get distance from distance input
      if (!distanceInput) {
        console.warn('Distance input not found');
        return;
      }
      
      distance = parseFloat(distanceInput.value);
      if (isNaN(distance) || distance <= 0) {
        console.warn('Invalid distance:', distanceInput.value);
        alert('Please enter a valid distance greater than 0');
        distanceInput.focus();
        return;
      }
      
      // Determine direction based on button clicked
      direction = this.getDirectionFromButton(e.target);
      if (direction === null) {
        console.warn('Could not determine direction from button');
        return;
      }
      
      console.log('DrawingManager: Using directional mode - distance:', distance, 'direction:', direction);
    }
    
    // Calculate new point using polar coordinates
    this.addPointWithPolarCoordinates(distance, direction);
  }
  
  getDirectionFromButton(button) {
    // Map button classes to angles (in degrees) - FIXED to match standard polar coordinates
    const directions = {
      'right': 0,         // East - 3 o'clock
      'up-right': 45,     // Northeast - 1:30 o'clock
      'up': 90,           // North - 12 o'clock
      'up-left': 135,     // Northwest - 10:30 o'clock
      'left': 180,        // West - 9 o'clock
      'down-left': 225,   // Southwest - 7:30 o'clock
      'down': 270,        // South - 6 o'clock
      'down-right': 315   // Southeast - 4:30 o'clock
    };
    
    console.log('DrawingManager: Button classes:', Array.from(button.classList));
    
    // Find which direction class this button has
    for (const [className, angle] of Object.entries(directions)) {
      if (button.classList.contains(className)) {
        console.log('DrawingManager: Direction selected:', className, 'angle:', angle, '- moving', this.getDirectionName(angle));
        return angle;
      }
    }
    
    console.warn('DrawingManager: Unknown direction button, classes:', Array.from(button.classList));
    return null;
  }
  
  getDirectionName(angle) {
    const names = {
      0: 'East (3 o\'clock)',
      45: 'Northeast (1:30 o\'clock)',
      90: 'North (12 o\'clock)',
      135: 'Northwest (10:30 o\'clock)',
      180: 'West (9 o\'clock)',
      225: 'Southwest (7:30 o\'clock)',
      270: 'South (6 o\'clock)',
      315: 'Southeast (4:30 o\'clock)'
    };
    return names[angle] || 'Unknown direction';
  }
  
 addPointWithPolarCoordinates(distance, angleDegrees) {
  if (AppState.currentPolygonPoints.length === 0) return;
  
  // Get current point (last point in array)
  const currentPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1];
  
  // Convert distance from feet to pixels
  const distanceInPixels = distance * this.PIXELS_PER_FOOT;
  
  // Convert angle to radians for standard polar coordinates
  // In canvas: positive X is right, positive Y is down
  // In polar: 0° = right (east), 90° = up (north), etc.
  const angleRadians = angleDegrees * (Math.PI / 180);
  
  // Calculate new point using standard polar coordinates
  const newX = currentPoint.x + distanceInPixels * Math.cos(angleRadians);
  const newY = currentPoint.y - distanceInPixels * Math.sin(angleRadians); // Subtract because canvas Y increases downward
  
  const newPoint = {
    x: newX,
    y: newY,
    name: `p${AppState.currentPolygonCounter}`
  };
  
  console.log(`DrawingManager: Adding point ${newPoint.name} at (${newX.toFixed(1)}, ${newY.toFixed(1)}) - ${distance} feet (${distanceInPixels}px) at ${angleDegrees}° (${this.getDirectionName(angleDegrees)})`);
  
  // NEW: Check if this direction is the same as the previous edge direction
  if (AppState.currentPolygonPoints.length >= 2) {
    const prevPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 2];
    const lastPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1];
    
    // Calculate the previous edge direction
    const prevDx = lastPoint.x - prevPoint.x;
    const prevDy = lastPoint.y - prevPoint.y;
    const prevAngleRadians = Math.atan2(-prevDy, prevDx); // Negative dy because canvas Y is flipped
    const prevAngleDegrees = (prevAngleRadians * 180 / Math.PI + 360) % 360;
    
    // Normalize both angles to 0-360 range
    const currentAngleDegrees = (angleDegrees + 360) % 360;
    const normalizedPrevAngle = (prevAngleDegrees + 360) % 360;
    
    // Check if directions are the same (within 1 degree tolerance for floating point precision)
    const angleDifference = Math.abs(currentAngleDegrees - normalizedPrevAngle);
    const isSameDirection = angleDifference < 1 || angleDifference > 359;
    
    if (isSameDirection) {
      console.log(`DrawingManager: Same direction detected! Previous: ${normalizedPrevAngle.toFixed(1)}°, Current: ${currentAngleDegrees}°`);
      console.log(`DrawingManager: Removing intermediate vertex ${lastPoint.name} and extending line`);
      
      // Remove the last point (intermediate vertex)
      AppState.currentPolygonPoints.pop();
      AppState.currentPolygonCounter--;
      
      // Update the new point name to replace the removed point
      newPoint.name = lastPoint.name;
      
      console.log(`DrawingManager: Extended line from ${prevPoint.name} directly to ${newPoint.name}`);
    }
  }
  
  // Check if this point closes the polygon (close to p0)
  const firstPoint = AppState.currentPolygonPoints[0];
  const distanceToFirst = Math.sqrt(
    Math.pow(newX - firstPoint.x, 2) + Math.pow(newY - firstPoint.y, 2)
  );
  
  if (distanceToFirst < 20 && AppState.currentPolygonPoints.length >= 3) { // Increased threshold to ~2.5 feet
    // Close the polygon
    console.log('DrawingManager: Polygon closed! Distance to p0:', (distanceToFirst / this.PIXELS_PER_FOOT).toFixed(1), 'feet');
    this.closePolygon();
  } else {
    // Add the new point to AppState
    AppState.currentPolygonPoints.push(newPoint);
    AppState.currentPolygonCounter++;
    
    // The last vertex blink continues automatically since we have a new last vertex
    
    // Save action after each point is added for undo support
    CanvasManager.saveAction();
    
    // ENHANCED: Better focus handling with mobile-specific strategies
    this.suppressRedrawForInput = true;
    
    // CRITICAL: Clear distance input and refocus for next segment
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    
    if (distanceInput) {
      distanceInput.value = '0';
      
      // FIXED: Clear the decimal input sequence when vertex is placed
      this.distanceInputSequence = [];
      console.log('DrawingManager: Distance input sequence cleared after vertex placement');
    }
    
    if (angleInput) {
      angleInput.value = '0.0';
      
      // FIXED: Clear the angle input sequence when vertex is placed
      this.angleInputSequence = [];
      console.log('DrawingManager: Angle input sequence cleared after vertex placement');
    }
    
    // ENHANCED: Better mobile focus handling with multiple strategies
    setTimeout(() => {
      const isAngleMode = angleInput && !angleInput.classList.contains('hidden');
      const targetInput = isAngleMode ? angleInput : distanceInput;
      
      if (targetInput) {
        // Enhanced mobile focus with multiple strategies
        if (this.isMobileDevice()) {
          console.log('DrawingManager: Mobile device detected, using enhanced focus strategies for', isAngleMode ? 'angle' : 'distance', 'input');
          
          // Strategy 1: Immediate focus
          targetInput.focus();
          
          // Strategy 2: Delayed focus with click simulation
          setTimeout(() => {
            console.log('DrawingManager: Attempting delayed focus after vertex placement...');
            targetInput.focus();
            targetInput.click(); // Simulate click to trigger focus
          }, 100);
          
          // Strategy 3: Force selection and verify focus
          setTimeout(() => {
            if (document.activeElement === targetInput) {
              console.log('DrawingManager: Input successfully focused, selecting text');
              try {
                targetInput.setSelectionRange(0, targetInput.value.length);
              } catch (e) {
                console.log('DrawingManager: Selection range not supported, using select()');
                targetInput.select();
              }
            } else {
              console.log('DrawingManager: Input not focused after placement, trying one more time...');
              targetInput.focus();
              // Force a second attempt
              setTimeout(() => {
                targetInput.focus();
              }, 50);
            }
          }, 300);
          
        } else {
          // Desktop - simpler immediate focus
          targetInput.focus();
          targetInput.select();
          console.log('DrawingManager: Desktop focus applied to', isAngleMode ? 'angle' : 'distance', 'input');
        }
        
        // Update visual indicators
        this.updateActiveInputVisuals(targetInput);
        console.log('DrawingManager: Input refocused for next edge:', isAngleMode ? 'angle' : 'distance');
      }
      
      // FIXED: Re-enable redraws after focus is established
      setTimeout(() => {
        this.suppressRedrawForInput = false;
      }, 400); // Longer delay to account for multiple focus attempts
    }, 50);
    
    CanvasManager.redraw();
  }
}




  
  closePolygon() {
    console.log('DrawingManager: Closing polygon with', AppState.currentPolygonPoints.length, 'points');
    
    // Create final polygon object using AppState.currentPolygonPoints (not this.polygonPoints)
    const completedPolygon = {
      id: Date.now(),
      points: [...AppState.currentPolygonPoints], // Copy the points from AppState
      strokeColor: '#2c3e50',
      fillColor: 'rgba(52, 152, 219, 0.1)',
      lineWidth: 2,
      closed: true
    };
    
    // Add to state
    AppState.drawnPolygons.push(completedPolygon);
    
    // Reset current polygon in AppState
    AppState.currentPolygonPoints = [];
    AppState.currentPolygonCounter = 0;
    
    // Reset drawing state for next polygon
    this.waitingForFirstVertex = true;
    this.waitingForDirection = false;
    this.waitingForVertexSelection = false;
    this.previewLine = null;
    
    // FIXED: Reset redraw suppression and clear input sequences
    this.suppressRedrawForInput = false;
    this.distanceInputSequence = [];
    this.angleInputSequence = [];
    console.log('DrawingManager: Input sequences cleared after polygon closure');
    
    // Stop blinking and restart cursor for next polygon
    this.stopLastVertexBlink();
    if (this.isActive) {
      this.startBlinkingCursor(750); // Use slower blink for less interference
    }
    
    // Save action and redraw
    CanvasManager.saveAction();
    CanvasManager.redraw();
    
    // Call placeholder function
    this.polygonClosed(completedPolygon);
  }
  
  polygonClosed(polygon) {
    // Placeholder function for when a polygon is successfully closed
    alert(`Polygon closed! Your shape has ${polygon.points.length} vertices and covers approximately ${this.calculatePolygonArea(polygon)} square feet.`);
    console.log('DrawingManager: Polygon closed:', polygon);
  }
  
  // Helper function to calculate approximate polygon area
  calculatePolygonArea(polygon) {
    if (polygon.points.length < 3) return 0;
    
    // Use shoelace formula to calculate area in pixels, then convert to square feet
    let area = 0;
    const points = polygon.points;
    
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    
    area = Math.abs(area) / 2; // Area in pixels
    
    // Convert to square feet (PIXELS_PER_FOOT^2 pixels = 1 square foot)
    const areaInSquareFeet = area / (this.PIXELS_PER_FOOT * this.PIXELS_PER_FOOT);
    
    return Math.round(areaInSquareFeet);
  }
  
  // NEW: Draw edge labels showing distance in feet - positioned OFF the edge
  drawEdgeLabels(points, isClosed) {
    const { ctx } = AppState;
    if (!ctx || points.length < 2) return;
    
    // Set up text styling for edge labels
    ctx.save();
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw labels for each edge
    for (let i = 0; i < points.length; i++) {
      const currentPoint = points[i];
      const nextPoint = points[(i + 1) % points.length];
      
      // For open polygons (current drawing), don't draw label for the closing edge
      if (!isClosed && i === points.length - 1) break;
      
      // Calculate distance in pixels
      const dx = nextPoint.x - currentPoint.x;
      const dy = nextPoint.y - currentPoint.y;
      const distanceInPixels = Math.sqrt(dx * dx + dy * dy);
      
      // Convert to feet
      const distanceInFeet = distanceInPixels / this.PIXELS_PER_FOOT;
      
      // Only show labels for edges 3 feet or longer
      if (distanceInFeet < 3) continue;
      
      // Calculate midpoint of the edge
      const midX = (currentPoint.x + nextPoint.x) / 2;
      const midY = (currentPoint.y + nextPoint.y) / 2;
      
      // Calculate the angle of the edge
      const edgeAngle = Math.atan2(dy, dx);
      
      // Calculate perpendicular angle (outward normal from the polygon)
      const perpAngle = edgeAngle + Math.PI / 2;
      
      // Determine if we should place the label on the "outside" of the polygon
      // We'll use a simple approach: check which side is "outward" by looking at the polygon centroid
      const centroid = this.calculatePolygonCentroid(points);
      const toCentroid = Math.atan2(centroid.y - midY, centroid.x - midX);
      
      // Choose the perpendicular direction that points away from the centroid
      let labelAngle = perpAngle;
      const angleDiff = Math.abs(toCentroid - perpAngle);
      if (angleDiff < Math.PI / 2 || angleDiff > 3 * Math.PI / 2) {
        // perpAngle points toward centroid, so use the opposite direction
        labelAngle = perpAngle + Math.PI;
      }
      
      // Position label 20 pixels away from the edge
      const labelDistance = 20;
      const labelX = midX + Math.cos(labelAngle) * labelDistance;
      const labelY = midY + Math.sin(labelAngle) * labelDistance;
      
      // Format the distance (round to 1 decimal place, remove .0 if whole number)
      const formattedDistance = distanceInFeet % 1 === 0 ? 
        Math.round(distanceInFeet).toString() : 
        distanceInFeet.toFixed(1);
      
      const labelText = formattedDistance + "'";
      
      // Calculate text rotation - keep text horizontal for better readability
      let textRotation = 0;
      
      // Optional: If you want text to align with the edge direction, uncomment below:
      // let textRotation = edgeAngle;
      // if (Math.abs(textRotation) > Math.PI / 2) {
      //   textRotation += Math.PI; // Flip text if it would be upside down
      // }
      
      // Draw background rectangle for better readability
      const textMetrics = ctx.measureText(labelText);
      const padding = 4;
      const rectWidth = textMetrics.width + padding * 2;
      const rectHeight = 16;
      
      ctx.save();
      ctx.translate(labelX, labelY);
      ctx.rotate(textRotation);
      
      // Draw background rectangle
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(-rectWidth/2, -rectHeight/2, rectWidth, rectHeight);
      
      // Draw the text
      ctx.fillStyle = '#2c3e50';
      ctx.fillText(labelText, 0, 0);
      
      ctx.restore();
    }
    
    ctx.restore();
  }
  
  // Helper method to calculate polygon centroid for label positioning
  calculatePolygonCentroid(points) {
    let centroidX = 0;
    let centroidY = 0;
    
    for (let i = 0; i < points.length; i++) {
      centroidX += points[i].x;
      centroidY += points[i].y;
    }
    
    return {
      x: centroidX / points.length,
      y: centroidY / points.length
    };
  }
  
  // Rendering methods
  drawLines() {
    const { ctx } = AppState;
    if (!ctx) return;
    
    // Draw completed lines (if any)
    AppState.drawnLines.forEach(line => {
      ctx.strokeStyle = line.strokeColor || '#2c3e50';
      ctx.lineWidth = line.lineWidth || 2;
      ctx.lineCap = 'round';
      
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.lineTo(line.end.x, line.end.y);
      ctx.stroke();
    });
  }
  
  drawPolygons() {
    const { ctx } = AppState;
    if (!ctx) return;
    
    // Draw completed polygons
    AppState.drawnPolygons.forEach(polygon => {
      if (polygon.points.length < 2) return;
      
      ctx.strokeStyle = polygon.strokeColor || '#2c3e50';
      ctx.fillStyle = polygon.fillColor || 'rgba(52, 152, 219, 0.1)';
      ctx.lineWidth = polygon.lineWidth || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
      
      for (let i = 1; i < polygon.points.length; i++) {
        ctx.lineTo(polygon.points[i].x, polygon.points[i].y);
      }
      
      if (polygon.closed) {
        ctx.closePath();
        ctx.fill();
      }
      
      ctx.stroke();
      
      // Draw edge labels for completed polygons AFTER drawing the polygon
      if (polygon.closed) {
        this.drawEdgeLabels(polygon.points, true);
      }
    });
    
    // Draw current polygon being drawn (from AppState)
    if (AppState.currentPolygonPoints.length > 0) {
      ctx.strokeStyle = '#3498db';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // Draw lines between existing points
      if (AppState.currentPolygonPoints.length > 1) {
        ctx.beginPath();
        ctx.moveTo(AppState.currentPolygonPoints[0].x, AppState.currentPolygonPoints[0].y);
        
        for (let i = 1; i < AppState.currentPolygonPoints.length; i++) {
          ctx.lineTo(AppState.currentPolygonPoints[i].x, AppState.currentPolygonPoints[i].y);
        }
        
        ctx.stroke();
        
        // Draw edge labels for current polygon
        this.drawEdgeLabels(AppState.currentPolygonPoints, false);
      }
      
      // Draw points as circles with labels
      AppState.currentPolygonPoints.forEach((point, index) => {
        const isLastVertex = (index === AppState.currentPolygonPoints.length - 1);
        const isFirstVertex = (index === 0);
        
        // NEW: When waiting for vertex selection, make all vertices clickable with larger hit area
        if (this.waitingForVertexSelection) {
          // Draw all vertices as selectable (larger, with glow effect)
          ctx.fillStyle = '#f39c12'; // Orange to indicate they're selectable
          ctx.beginPath();
          ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw glow effect
          ctx.strokeStyle = '#e67e22';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
          ctx.stroke();
          
        } else if (isLastVertex && this.showLastVertex && this.waitingForDirection) {
          // Normal blinking red for active drawing
          ctx.fillStyle = '#e74c3c';
          ctx.beginPath();
          ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.strokeStyle = '#c0392b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
          ctx.stroke();
          
          // Draw crosshair
          ctx.strokeStyle = '#c0392b';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(point.x - 12, point.y);
          ctx.lineTo(point.x + 12, point.y);
          ctx.moveTo(point.x, point.y - 12);
          ctx.lineTo(point.x, point.y + 12);
          ctx.stroke();
        } else if (isLastVertex && !this.showLastVertex && this.waitingForDirection) {
          // Don't draw the vertex when blinking is OFF
        } else if (isFirstVertex) {
          ctx.fillStyle = '#e74c3c';
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#3498db';
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Always draw point labels
        ctx.fillStyle = '#2c3e50';
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(point.name, point.x, point.y - 15);
      });
    }
  }
  
  drawUI() {
    const { ctx } = AppState;
    if (!ctx) return;
    
    // FIXED: Only draw blinking cursor if actually in drawing mode AND waiting for first vertex AND not suppressing redraws
    if (this.isActive && this.waitingForFirstVertex && this.showCursor && this.mousePosition && !this.suppressRedrawForInput) {
      // Use actual mouse position instead of center
      const cursorX = this.mousePosition.x;
      const cursorY = this.mousePosition.y;
      
      // Draw red blinking dot
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(cursorX, cursorY, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw border
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cursorX, cursorY, 8, 0, Math.PI * 2);
      ctx.stroke();
      
      // Draw small crosshair for precision
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cursorX - 12, cursorY);
      ctx.lineTo(cursorX + 12, cursorY);
      ctx.moveTo(cursorX, cursorY - 12);
      ctx.lineTo(cursorX, cursorY + 12);
      ctx.stroke();
    }
  }
  
  // NEW: Polygon interaction handlers
  handlePolygonMouseDown(data) {
    if (this.isActive) return; // Don't handle polygon dragging while in drawing mode
    
    const { polygon, mousePos } = data;
    
    // Start dragging this polygon
    this.draggedPolygon = polygon;
    this.dragStartPos = mousePos;
    this.originalPolygonPoints = polygon.points.map(p => ({ ...p })); // Deep copy
    
    // Find all elements inside or touching this polygon
    this.draggedElements = this.findElementsInPolygon(polygon);
    this.originalElementPositions = this.draggedElements.map(el => ({ 
      element: el, 
      x: el.x, 
      y: el.y 
    }));
    
    console.log(`DrawingManager: Started dragging polygon with ${this.draggedElements.length} contained elements`);
  }
  
  handlePolygonMouseMove(data) {
    if (!this.draggedPolygon || this.isActive) return; // Don't move if in drawing mode
    
    const { mousePos } = data;
    const dx = mousePos.x - this.dragStartPos.x;
    const dy = mousePos.y - this.dragStartPos.y;
    
    // Move polygon points
    this.draggedPolygon.points.forEach((point, index) => {
      point.x = this.originalPolygonPoints[index].x + dx;
      point.y = this.originalPolygonPoints[index].y + dy;
    });
    
    // Move contained elements
    this.originalElementPositions.forEach(({ element, x, y }) => {
      element.x = x + dx;
      element.y = y + dy;
    });
    
    CanvasManager.redraw();
  }
  
  handlePolygonMouseUp(data) {
    if (!this.draggedPolygon || this.isActive) return; // Don't handle if in drawing mode
    
    console.log('DrawingManager: Finished dragging polygon');
    
    // Save the new state
    CanvasManager.saveAction();
    
    // Clean up
    this.draggedPolygon = null;
    this.dragStartPos = null;
    this.originalPolygonPoints = null;
    this.draggedElements = null;
    this.originalElementPositions = null;
  }
  
  // NEW: Find elements inside or touching a polygon
  findElementsInPolygon(polygon) {
    const containedElements = [];
    
    AppState.placedElements.forEach(element => {
      if (this.isElementInOrTouchingPolygon(element, polygon)) {
        containedElements.push(element);
      }
    });
    
    return containedElements;
  }
  
  // NEW: Check if an element is inside or touching a polygon
  isElementInOrTouchingPolygon(element, polygon) {
    // Get element bounds
    const elementBounds = {
      left: element.x,
      right: element.x + element.width,
      top: element.y,
      bottom: element.y + element.height
    };
    
    // Check if element center is inside polygon
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    
    if (this.isPointInPolygon(centerX, centerY, polygon.points)) {
      return true;
    }
    
    // Check if any corner of the element is inside the polygon
    const corners = [
      { x: elementBounds.left, y: elementBounds.top },
      { x: elementBounds.right, y: elementBounds.top },
      { x: elementBounds.left, y: elementBounds.bottom },
      { x: elementBounds.right, y: elementBounds.bottom }
    ];
    
    for (let corner of corners) {
      if (this.isPointInPolygon(corner.x, corner.y, polygon.points)) {
        return true;
      }
    }
    
    // Check if any polygon edge intersects with element bounds
    for (let i = 0; i < polygon.points.length; i++) {
      const p1 = polygon.points[i];
      const p2 = polygon.points[(i + 1) % polygon.points.length];
      
      if (this.lineIntersectsRect(p1.x, p1.y, p2.x, p2.y, elementBounds)) {
        return true;
      }
    }
    
    return false;
  }
  
  // NEW: Point-in-polygon test using ray casting algorithm
  isPointInPolygon(x, y, polygonPoints) {
    let inside = false;
    
    for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
      const pi = polygonPoints[i];
      const pj = polygonPoints[j];
      
      if (((pi.y > y) !== (pj.y > y)) && 
          (x < (pj.x - pi.x) * (y - pi.y) / (pj.y - pi.y) + pi.x)) {
        inside = !inside;
      }
    }
    
    return inside;
  }
  
  // NEW: Check if line segment intersects with rectangle
  lineIntersectsRect(x1, y1, x2, y2, rect) {
    // Check if line intersects any of the four rectangle edges
    return this.lineIntersectsLine(x1, y1, x2, y2, rect.left, rect.top, rect.right, rect.top) ||    // Top
           this.lineIntersectsLine(x1, y1, x2, y2, rect.right, rect.top, rect.right, rect.bottom) || // Right
           this.lineIntersectsLine(x1, y1, x2, y2, rect.right, rect.bottom, rect.left, rect.bottom) || // Bottom
           this.lineIntersectsLine(x1, y1, x2, y2, rect.left, rect.bottom, rect.left, rect.top);     // Left
  }
  
  // NEW: Check if two line segments intersect
  lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return false; // Lines are parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  
  // NEW: Check if a point is inside a polygon for click detection
  getPolygonAt(x, y) {
    // Check completed polygons in reverse order (most recently drawn first)
    for (let i = AppState.drawnPolygons.length - 1; i >= 0; i--) {
      const polygon = AppState.drawnPolygons[i];
      if (polygon.closed && this.isPointInPolygon(x, y, polygon.points)) {
        return polygon;
      }
    }
    return null;
  }
  
  clearAll() {
    console.log('DrawingManager: Clearing all drawings');
    AppState.drawnLines = [];
    AppState.drawnPolygons = [];
    AppState.currentPolygonPoints = [];
    AppState.currentPolygonCounter = 0;
    CanvasManager.saveAction();
    CanvasManager.redraw();
  }
  
  // NEW: Handle undo/redo during polygon drawing
  handleHistoryChange() {
    console.log('DrawingManager: History changed during drawing');
    console.log('Current polygon points after history change:', AppState.currentPolygonPoints.length);
    console.log('Current polygon counter after history change:', AppState.currentPolygonCounter);
    
    // FIXED: Reset redraw suppression on history change
    this.suppressRedrawForInput = false;
    
    // Update our drawing state based on the restored AppState
    if (AppState.currentPolygonPoints.length === 0) {
      // No current polygon, so we should be waiting for first vertex
      this.waitingForFirstVertex = true;
      this.waitingForDirection = false;
      this.stopLastVertexBlink(); // Stop last vertex blink
      this.startBlinkingCursor(750); // Start cursor blink with slower interval
      
      // Clear distance input and sequences
      const distanceInput = document.getElementById('distanceDisplay');
      if (distanceInput) {
        distanceInput.value = '0';
      }
      this.distanceInputSequence = [];
      this.angleInputSequence = [];
      console.log('DrawingManager: Input sequences cleared after history change (no polygon)');
      
      console.log('DrawingManager: Reset to waiting for first vertex (blinking cursor)');
    } else {
      // We have a current polygon, so we're waiting for direction
      this.waitingForFirstVertex = false;
      this.waitingForDirection = true;
      this.stopBlinkingCursor(); // Stop cursor blink
      this.startLastVertexBlink(1000); // Start last vertex blink with slower interval
      
      // FIXED: Temporarily suppress redraws during focus
      this.suppressRedrawForInput = true;
      
      // Focus distance input for next edge and clear sequences
      const distanceInput = document.getElementById('distanceDisplay');
      if (distanceInput) {
        distanceInput.value = '0';
        this.distanceInputSequence = [];
        this.angleInputSequence = [];
        console.log('DrawingManager: Input sequences cleared after history change (with polygon)');
        
        setTimeout(() => {
          distanceInput.focus();
          distanceInput.select();
          
          // FIXED: Re-enable redraws after focus
          setTimeout(() => {
            this.suppressRedrawForInput = false;
          }, 100);
        }, 50);
      } else {
        // FIXED: Re-enable redraws even if input not found
        this.suppressRedrawForInput = false;
      }
      
      console.log('DrawingManager: Restored to waiting for direction with', AppState.currentPolygonPoints.length, 'points');
    }
    
    // Force a redraw to show the updated state
    CanvasManager.redraw();
  }
}