import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';
import { HelperPointManager } from './helpers.js';

export class DrawingManager {
constructor() {
    console.log('DrawingManager: Initializing minimal version');
    this.PIXELS_PER_FOOT = 8;
    this.FEET_PER_GRID_SQUARE = 5;
    this.GRID_SIZE_PIXELS = 40;
    this.isActive = false;
    this.waitingForFirstVertex = false;
    this.activeInput = 'distance';
    this.distanceInputSequence = [];
    this.angleInputSequence = [];

    // Store preset angles for easy checking
    this.directionAngles = {
      'right': 0,
      'up-right': 45,
      'up': 90,
      'up-left': 135,
      'left': 180,
      'down-left': 225,
      'down': 270,
      'down-right': 315
    };
    
    // Bind all event handlers once in constructor
    this.boundHandleCanvasClick = this.handleCanvasClick.bind(this);
    this.boundHandleCanvasTouch = this.handleCanvasTouch.bind(this);
    this.boundHandleAngleButtonClick = this.handleAngleButtonClick.bind(this);
    this.boundHandleKeypadClick = this.handleKeypadClick.bind(this);
    this.boundHandleDirectionClick = this.handleDirectionClick.bind(this);
    this.boundHandleArrowKey = this.handleArrowKey.bind(this);
    this.boundHandleDistanceKeydown = (e) => this.handleDecimalInput(e, 'distance');
    this.boundHandleAngleKeydown = (e) => this.handleDecimalInput(e, 'angle');
    this.boundHandleDistanceClick = () => {
      this.activeInput = 'distance';
      console.log('Active input: distance');
    };
    this.boundHandleAngleInputClick = () => {
      this.activeInput = 'angle';
      console.log('Active input: angle');
    };
    this.boundHandleDistanceFocus = () => {
      this.activeInput = 'distance';
      console.log('Active input: distance');
    };
    this.boundHandleAngleFocus = () => {
      this.activeInput = 'angle';
      const angleDisplay = document.getElementById('angleDisplay');
      if (angleDisplay) angleDisplay.select();
      console.log('Active input: angle');
    };
    
    this.setupEventListeners();
    console.log('DrawingManager: Initialized');
  }

findClickedHelperPoint(x, y) {
      if (!AppState.helperPoints) return null;

      const clickRadius = this.isMobileDevice() ? 30 : 20; // Generous click radius

      for (const point of AppState.helperPoints) {
          const dx = x - point.x;
          const dy = y - point.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance <= clickRadius) {
              console.log('Found clicked helper point at:', point);
              return point;
          }
      }
      return null;
  }
drawHelperPoints() {
    const { ctx } = AppState;
    if (!ctx || !AppState.helperPoints || AppState.helperPoints.length === 0) {
        return;
    }

    // Save the current drawing state
    ctx.save();

    ctx.fillStyle = 'purple'; // As requested
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;

    AppState.helperPoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6, 0, Math.PI * 2); // Radius of 6px
        ctx.fill();
        ctx.stroke();
    });

    // Restore the drawing state to what it was before this function ran
    ctx.restore();
  }
 setupEventListeners() {
    AppState.on('canvas:redraw:polygons', () => {
      this.drawPolygons();
      this.drawHelperPoints(); // Draw helper points right after polygons
    });
    AppState.on('mode:changed', (e) => {
      if (e.detail.mode === 'drawing') {
        this.activate();
      } else {
        this.deactivate();
      }
    });
  }

  activate() {
    if (this.isActive) return;
    console.log('DrawingManager: Activating drawing mode');
    this.isActive = true;
    // Only wait for first vertex if no path exists
    this.waitingForFirstVertex = !AppState.currentPolygonPoints || AppState.currentPolygonPoints.length === 0;
    
    // Always clear sequences when activating to ensure clean state
    this.distanceInputSequence.length = 0;
    this.angleInputSequence.length = 0;
    
    this.showDrawingUI();
    this.setupAngleButton();
    this.setupNumericKeypad();
    this.setupDirectionalPad();
    this.setupArrowKeyListeners();
    const canvas = AppState.canvas;
    if (canvas) {
      canvas.addEventListener('click', this.boundHandleCanvasClick);
      canvas.addEventListener('touchend', this.boundHandleCanvasTouch);
    }
    AppState.emit('ui:drawing:activated');
  }

  deactivate() {
    if (!this.isActive) return;
    console.log('DrawingManager: Deactivating drawing mode');
    this.isActive = false;
    // Don't reset waitingForFirstVertex or clear the path - preserve it
    this.hideDrawingUI();
    this.removeAngleButton();
    this.removeNumericKeypad();
    this.removeDirectionalPad();
    this.removeArrowKeyListeners();
    const canvas = AppState.canvas;
    if (canvas) {
      canvas.removeEventListener('click', this.boundHandleCanvasClick);
      canvas.removeEventListener('touchend', this.boundHandleCanvasTouch);
    }
    AppState.emit('ui:drawing:deactivated');
  }

  handleCanvasClick(e) {
    if (!this.isActive) return;
    
    // Get the canvas element's bounding rect
    const canvas = AppState.canvas;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate the scale factor between display size and actual canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Convert click coordinates to canvas space
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    
    // Create a synthetic event with canvas coordinates
    const canvasEvent = {
      clientX: canvasX / scaleX + rect.left,
      clientY: canvasY / scaleY + rect.top
    };
    
    this.handleCanvasInteraction(canvasEvent);
  }

  handleCanvasTouch(e) {
    if (!this.isActive) return;
    e.preventDefault(); // Prevent default touch behavior
    if (e.changedTouches && e.changedTouches.length > 0) {
      // Use the first touch point
      const touch = e.changedTouches[0];
      
      // Get the canvas element's bounding rect
      const canvas = AppState.canvas;
      const rect = canvas.getBoundingClientRect();
      
      // Calculate the scale factor between display size and actual canvas size
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      // Convert touch coordinates to canvas space
      const canvasX = (touch.clientX - rect.left) * scaleX;
      const canvasY = (touch.clientY - rect.top) * scaleY;
      
      // Create a synthetic event with canvas coordinates
      const canvasEvent = {
        clientX: canvasX / scaleX + rect.left,
        clientY: canvasY / scaleY + rect.top
      };
      
      this.handleCanvasInteraction(canvasEvent);
    }
  }

handleCanvasInteraction(e) {
    // Get the static viewport element, which does not move when panning.
    const viewport = document.getElementById('canvasViewport');
    if (!viewport) {
      console.error("Could not find #canvasViewport element!");
      return;
    }
    const viewportRect = viewport.getBoundingClientRect();
    
    // Calculate the click's position relative to the top-left of the static viewport.
    const clickXInViewport = e.clientX - viewportRect.left;
    const clickYInViewport = e.clientY - viewportRect.top;

    // Convert the viewport-relative click coordinates into the canvas's "world" coordinates
    const canvasX = clickXInViewport - AppState.viewportTransform.x;
    const canvasY = clickYInViewport - AppState.viewportTransform.y;
    
    // 1. Check for a click on a helper point first
    const clickedHelperPoint = this.findClickedHelperPoint(canvasX, canvasY);
    if (clickedHelperPoint) {
        console.log('Helper point clicked, adding it to the path.');
        const newPoint = {
            x: clickedHelperPoint.x,
            y: clickedHelperPoint.y,
            name: `p${AppState.currentPolygonCounter}`
        };

        AppState.currentPolygonPoints.push(newPoint);
        AppState.currentPolygonCounter++;
        
        // After adding the new point, recalculate helpers for the next state
        HelperPointManager.updateHelperPoints();

        // Reset inputs and save state
        const distanceInput = document.getElementById('distanceDisplay');
        const angleInput = document.getElementById('angleDisplay');
        if (distanceInput) distanceInput.value = '0';
        if (angleInput) angleInput.value = '0';
        this.distanceInputSequence.length = 0;
        this.angleInputSequence.length = 0;
        this.activeInput = 'distance';
        if (distanceInput) distanceInput.focus();

        CanvasManager.saveAction();
        CanvasManager.redraw();
        return; // Stop further processing
    }

    // 2. If no helper was clicked, proceed with original logic
    // If waiting for first vertex, place it
    if (this.waitingForFirstVertex) {
      this.placeFirstVertex(canvasX, canvasY);
      return;
    }
    
    // Check if user clicked on an existing vertex
    if (AppState.currentPolygonPoints && AppState.currentPolygonPoints.length > 0) {
      const clickedVertexIndex = this.findClickedVertex(canvasX, canvasY);
      if (clickedVertexIndex !== -1) {
        console.log('Vertex clicked:', clickedVertexIndex);
        this.continueFromVertex(clickedVertexIndex);
        return;
      } else {
        console.log('No vertex or helper point found near click point');
      }
    }
  }

  findClickedVertex(x, y) {
    if (!AppState.currentPolygonPoints) return -1;
    
    // Larger click radius for mobile devices
    const clickRadius = this.isMobileDevice() ? 30 : 15; 
    console.log('Checking for vertex near world coordinates:', { x: x.toFixed(1), y: y.toFixed(1) });
    
    for (let i = 0; i < AppState.currentPolygonPoints.length; i++) {
      const point = AppState.currentPolygonPoints[i];
      
      // The stored points are in canvas world coordinates.
      // We are comparing them with the clicked world coordinates (x, y).
      const dx = x - point.x;
      const dy = y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      console.log(`Vertex ${point.name} at world coords (${point.x.toFixed(1)}, ${point.y.toFixed(1)}), distance to click: ${distance.toFixed(1)}`);
      
      if (distance <= clickRadius) {
        console.log(`Found clicked vertex: ${point.name}`);
        return i;
      }
    }
    console.log('No vertex found within click radius');
    return -1;
  }

 continueFromVertex(vertexIndex) {
    console.log(`DrawingManager: Continuing from vertex ${AppState.currentPolygonPoints[vertexIndex].name}`);
    
    const isLastVertex = vertexIndex === AppState.currentPolygonPoints.length - 1;
    
    if (isLastVertex) {
      console.log('Continuing from last vertex - no vertices removed');
      AppState.currentPolygonCounter = vertexIndex + 1;
    } else {
      const removedVertices = AppState.currentPolygonPoints.splice(vertexIndex + 1);
      if (removedVertices.length > 0) {
        console.log(`Removed vertices: ${removedVertices.map(v => v.name).join(', ')}`);
      }
      AppState.currentPolygonCounter = vertexIndex + 1;
    }
    
    this.distanceInputSequence.length = 0;
    this.angleInputSequence.length = 0;
    
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    if (distanceInput) {
      distanceInput.value = '0';
      this.activeInput = 'distance';
      setTimeout(() => {
        distanceInput.focus();
        distanceInput.select();
      }, 50);
    }
    if (angleInput) {
      angleInput.value = '0';
    }
    
    // Update helper points before redrawing
    HelperPointManager.updateHelperPoints();

    CanvasManager.saveAction();
    CanvasManager.redraw();
    
    console.log(`Ready to continue drawing from ${AppState.currentPolygonPoints[vertexIndex].name}`);
  }

 placeFirstVertex(x, y) {
    console.log('DrawingManager: Placing first vertex at:', x, y);
    const firstPoint = {
      x: x,
      y: y,
      name: 'p0'
    };
    AppState.currentPolygonPoints = [firstPoint];
    AppState.currentPolygonCounter = 1;
    this.waitingForFirstVertex = false;

    // Update helper points before redrawing
    HelperPointManager.updateHelperPoints();

    CanvasManager.saveAction();
    CanvasManager.redraw();

    console.log('DrawingManager: First vertex p0 placed');
    const distanceInput = document.getElementById('distanceDisplay');
    if (distanceInput) {
      this.activeInput = 'distance';
      setTimeout(() => {
        distanceInput.focus();
        distanceInput.select();
        console.log('Distance input focused after placing p0');
      }, 100);
    }
  }

  showDrawingUI() {
    console.log('DrawingManager: Showing drawing UI elements');
    const drawPalette = document.getElementById('drawPalette');
    if (drawPalette) {
      drawPalette.classList.remove('hidden');
    }
    const distanceDisplay = document.getElementById('distanceDisplay');
    if (distanceDisplay) {
      if (this.isMobileDevice()) {
        distanceDisplay.setAttribute('inputmode', 'none');
        distanceDisplay.setAttribute('pattern', '[0-9]*');
        distanceDisplay.style.caretColor = 'transparent';
      }
      distanceDisplay.value = '0';
      // Remove any existing listeners first
      distanceDisplay.removeEventListener('click', this.boundHandleDistanceClick);
      distanceDisplay.removeEventListener('focus', this.boundHandleDistanceFocus);
      distanceDisplay.removeEventListener('keydown', this.boundHandleDistanceKeydown);
      // Add listeners
      distanceDisplay.addEventListener('click', this.boundHandleDistanceClick);
      distanceDisplay.addEventListener('focus', this.boundHandleDistanceFocus);
      distanceDisplay.addEventListener('keydown', this.boundHandleDistanceKeydown);
    }
    const angleDisplay = document.getElementById('angleDisplay');
    if (angleDisplay) {
      angleDisplay.classList.add('hidden'); // Make sure it's hidden by default
      if (this.isMobileDevice()) {
        angleDisplay.setAttribute('inputmode', 'none');
        angleDisplay.setAttribute('pattern', '[0-9]*');
        angleDisplay.style.caretColor = 'transparent';
      }
      angleDisplay.value = '0'; // Changed from '0.0' to '0'
      // Remove any existing listeners first
      angleDisplay.removeEventListener('click', this.boundHandleAngleInputClick);
      angleDisplay.removeEventListener('focus', this.boundHandleAngleFocus);
      angleDisplay.removeEventListener('keydown', this.boundHandleAngleKeydown);
      // Add listeners
      angleDisplay.addEventListener('click', this.boundHandleAngleInputClick);
      angleDisplay.addEventListener('focus', this.boundHandleAngleFocus);
      angleDisplay.addEventListener('keydown', this.boundHandleAngleKeydown);

      this.updateAngleUIColors();
    }
    const directionalPad = document.getElementById('directionalPad');
    if (directionalPad) {
      directionalPad.style.display = 'grid';
    }
    const numericKeypad = document.querySelector('.numeric-keypad');
    if (numericKeypad) {
      numericKeypad.style.display = 'grid';
    }
    const numbersBtn = document.getElementById('numbersBtn');
    if (numbersBtn) {
      numbersBtn.classList.add('active');
    }
    const paletteButtons = document.querySelectorAll('[data-palette]');
    paletteButtons.forEach(btn => {
      if (btn.id !== 'numbersBtn') {
        btn.classList.remove('active');
      }
    });
  }

  hideDrawingUI() {
    console.log('DrawingManager: Hiding drawing UI elements');
    const numbersBtn = document.getElementById('numbersBtn');
    if (numbersBtn) {
      numbersBtn.classList.remove('active');
    }
    const angleDisplay = document.getElementById('angleDisplay');
    if (angleDisplay) {
      angleDisplay.classList.add('hidden');
      // Remove listeners when hiding
      angleDisplay.removeEventListener('click', this.boundHandleAngleInputClick);
      angleDisplay.removeEventListener('focus', this.boundHandleAngleFocus);
      angleDisplay.removeEventListener('keydown', this.boundHandleAngleKeydown);
    }
    const distanceDisplay = document.getElementById('distanceDisplay');
    if (distanceDisplay) {
      // Remove listeners when hiding
      distanceDisplay.removeEventListener('click', this.boundHandleDistanceClick);
      distanceDisplay.removeEventListener('focus', this.boundHandleDistanceFocus);
      distanceDisplay.removeEventListener('keydown', this.boundHandleDistanceKeydown);
    }
  }

 drawPolygons() {
    const { ctx } = AppState;
    if (!ctx) return;

    // Save the current drawing state
    ctx.save();

    if (AppState.currentPolygonPoints.length > 0) {
      if (AppState.currentPolygonPoints.length > 1) {
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(AppState.currentPolygonPoints[0].x, AppState.currentPolygonPoints[0].y);
        for (let i = 1; i < AppState.currentPolygonPoints.length; i++) {
          ctx.lineTo(AppState.currentPolygonPoints[i].x, AppState.currentPolygonPoints[i].y);
        }
        ctx.stroke();

        // Draw distance labels on each edge
        for (let i = 1; i < AppState.currentPolygonPoints.length; i++) {
          const prevPoint = AppState.currentPolygonPoints[i - 1];
          const currentPoint = AppState.currentPolygonPoints[i];
          
          const dx = currentPoint.x - prevPoint.x;
          const dy = currentPoint.y - prevPoint.y;
          const distanceInPixels = Math.sqrt(dx * dx + dy * dy);
          const distanceInFeet = distanceInPixels / this.PIXELS_PER_FOOT;
          
          if (distanceInFeet >= 3) {
            const midX = (prevPoint.x + currentPoint.x) / 2;
            const midY = (prevPoint.y + currentPoint.y) / 2;
            const lineLength = Math.sqrt(dx * dx + dy * dy);
            const perpX = -dy / lineLength;
            const perpY = dx / lineLength;
            const offset = 15;
            const labelX = midX + perpX * offset;
            const labelY = midY + perpY * offset;
            
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const text = `${distanceInFeet.toFixed(1)}'`;
            const textMetrics = ctx.measureText(text);
            const padding = 2;
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(
              labelX - textMetrics.width / 2 - padding, 
              labelY - 4 - padding, 
              textMetrics.width + padding * 2, 
              8 + padding * 2
            );
            
            ctx.fillStyle = '#2c3e50';
            ctx.fillText(text, labelX, labelY);
          }
        }
      }
      AppState.currentPolygonPoints.forEach((point, index) => {
        const isFirstVertex = (index === 0);
        const isLastVertex = (index === AppState.currentPolygonPoints.length - 1);
        if (isFirstVertex) {
          ctx.fillStyle = '#e74c3c'; // Red for start
        } else if (isLastVertex) {
          ctx.fillStyle = '#27ae60'; // Green for end
        } else {
          ctx.fillStyle = '#3498db'; // Blue for intermediate
        }
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#2c3e50';
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(point.name, point.x, point.y - 15);
      });
    }

    // Restore the drawing state to what it was before this function ran
    ctx.restore();
  }

  isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
  }

  updateAngleUIColors() {
    const angleDisplay = document.getElementById('angleDisplay');
    const angleBtn = document.getElementById('angle-btn');
    const cornerArrows = document.querySelectorAll('.dir-btn.up-left, .dir-btn.up-right, .dir-btn.down-left, .dir-btn.down-right');
    const orangeColor = '#FFB366';
    const blueColor = '#3498db';
    if (angleDisplay && !angleDisplay.classList.contains('hidden')) {
      if (angleBtn) {
        angleBtn.style.backgroundColor = orangeColor;
      }
      cornerArrows.forEach(arrow => {
        arrow.style.backgroundColor = orangeColor;
      });
    } else {
      if (angleBtn) {
        angleBtn.style.backgroundColor = '';
      }
      cornerArrows.forEach(arrow => {
        arrow.style.backgroundColor = blueColor;
      });
    }
  }

  setupAngleButton() {
    // The angle button is already handled by setupNumericKeypad()
    // No need for a separate listener here
    console.log('DrawingManager: Angle button setup skipped - handled by numeric keypad');
  }

  removeAngleButton() {
    // No separate listener to remove since it's handled by removeNumericKeypad()
    console.log('DrawingManager: Angle button removal skipped - handled by numeric keypad');
  }

  handleAngleButtonClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    console.log('handleAngleButtonClick called');
    const angleDisplay = document.getElementById('angleDisplay');
    if (angleDisplay) {
      console.log('Angle display found, current hidden state:', angleDisplay.classList.contains('hidden'));
      if (angleDisplay.classList.contains('hidden')) {
        angleDisplay.classList.remove('hidden');
        console.log('Angle display shown');
      } else {
        angleDisplay.classList.add('hidden');
        console.log('Angle display hidden');
      }
      this.updateAngleUIColors();
    } else {
      console.log('Angle display element not found!');
    }
  }

  setupNumericKeypad() {
    const keypadButtons = document.querySelectorAll('.key-btn');
    keypadButtons.forEach(button => {
      // Remove any existing listener first
      button.removeEventListener('click', this.boundHandleKeypadClick);
      button.addEventListener('click', this.boundHandleKeypadClick);
    });
  }

  removeNumericKeypad() {
    const keypadButtons = document.querySelectorAll('.key-btn');
    keypadButtons.forEach(button => {
      button.removeEventListener('click', this.boundHandleKeypadClick);
    });
  }

  handleKeypadClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const buttonText = e.target.textContent.trim();
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    let targetInput = null;
    
    // Determine which input and sequence to use
    if (this.activeInput === 'angle' && angleInput && !angleInput.classList.contains('hidden')) {
      targetInput = angleInput;
    } else {
      targetInput = distanceInput;
    }
    
    if (!targetInput) return;
    
    console.log('Keypad click:', buttonText, 'Active input:', this.activeInput);
    
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
        // Work directly with the appropriate sequence
        if (this.activeInput === 'angle' && angleInput && !angleInput.classList.contains('hidden')) {
          // Check if we need to start fresh
          if (targetInput.value === '0') {
            this.angleInputSequence.length = 0;
          }
          
          this.angleInputSequence.push(parseInt(buttonText));
          // For angle: just concatenate the digits as a whole number
          let angleNumber = 0;
          for (let i = 0; i < this.angleInputSequence.length; i++) {
            angleNumber = angleNumber * 10 + this.angleInputSequence[i];
          }
          targetInput.value = angleNumber.toString();
          console.log('Updated angle sequence:', this.angleInputSequence, 'Display value:', targetInput.value);
        } else {
          // Check if we need to start fresh
          if (targetInput.value === '0' || targetInput.value === '0.0') {
            this.distanceInputSequence.length = 0;
          }
          
          this.distanceInputSequence.push(parseInt(buttonText));
          let number = 0;
          for (let i = 0; i < this.distanceInputSequence.length; i++) {
            number = number * 10 + this.distanceInputSequence[i];
          }
          number = number / 10;
          targetInput.value = number.toFixed(1);
          console.log('Updated distance sequence:', this.distanceInputSequence, 'Display value:', targetInput.value);
        }
        break;
      case 'del':
        if (this.activeInput === 'angle' && angleInput && !angleInput.classList.contains('hidden')) {
          this.angleInputSequence.pop();
          if (this.angleInputSequence.length === 0) {
            targetInput.value = '0';
          } else {
            let angleNumber = 0;
            for (let i = 0; i < this.angleInputSequence.length; i++) {
              angleNumber = angleNumber * 10 + this.angleInputSequence[i];
            }
            targetInput.value = angleNumber.toString();
          }
        } else {
          this.distanceInputSequence.pop();
          if (this.distanceInputSequence.length === 0) {
            targetInput.value = '0';
          } else {
            let number = 0;
            for (let i = 0; i < this.distanceInputSequence.length; i++) {
              number = number * 10 + this.distanceInputSequence[i];
            }
            number = number / 10;
            targetInput.value = number.toFixed(1);
          }
        }
        break;
      case 'clear':
        if (this.activeInput === 'angle' && angleInput && !angleInput.classList.contains('hidden')) {
          this.angleInputSequence.length = 0;
          targetInput.value = '0';
        } else {
          this.distanceInputSequence.length = 0;
          targetInput.value = '0';
        }
        break;
      case 'angle':
        console.log('Angle button clicked');
        this.handleAngleButtonClick(e);
        if (angleInput && !angleInput.classList.contains('hidden')) {
          this.activeInput = 'angle';
          angleInput.value = '0'; // Changed from '0.0' to '0'
          angleInput.focus();
        }
        break;
      case 'cls':
        break;
    }
  }

  setupDirectionalPad() {
    const directionButtons = document.querySelectorAll('.dir-btn');
    directionButtons.forEach(button => {
      // Remove any existing listener first
      button.removeEventListener('click', this.boundHandleDirectionClick);
      button.addEventListener('click', this.boundHandleDirectionClick);
    });
  }

  removeDirectionalPad() {
    const directionButtons = document.querySelectorAll('.dir-btn');
    directionButtons.forEach(button => {
      button.removeEventListener('click', this.boundHandleDirectionClick);
    });
  }

 handleDirectionClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const button = e.target;
    if (button.classList.contains('center')) return;
    const angleInput = document.getElementById('angleDisplay');
    if (!angleInput) return;
    
    const currentAngleValue = parseFloat(angleInput.value);
    // Determine if a custom angle was in the input before the click
    const isCustomAngle = currentAngleValue !== 0 && !Object.values(this.directionAngles).includes(currentAngleValue);
    
    let finalAngle = currentAngleValue;
    
    if (isCustomAngle) {
      console.log('DEBUG: Custom angle detected:', currentAngleValue);
      // Apply custom angle transformations based on quadrant clicked
      if (button.classList.contains('up-right')) {
        finalAngle = currentAngleValue; // θ = a
        console.log('DEBUG: Upper right clicked, using angle:', finalAngle);
      } else if (button.classList.contains('down-right')) {
        finalAngle = -currentAngleValue; // θ = -a
        console.log('DEBUG: Lower right clicked, using angle:', finalAngle);
      } else if (button.classList.contains('up-left')) {
        finalAngle = 180 - currentAngleValue; // θ = 180-a
        console.log('DEBUG: Upper left clicked, using angle:', finalAngle);
      } else if (button.classList.contains('down-left')) {
        finalAngle = 180 + currentAngleValue; // θ = 180+a
        console.log('DEBUG: Lower left clicked, using angle:', finalAngle);
      } else {
        // For cardinal directions (up, down, left, right), use the custom angle as-is
        console.log('DEBUG: Cardinal direction clicked, using custom angle as-is:', finalAngle);
      }
      
      // Normalize angle to 0-360 range
      finalAngle = ((finalAngle % 360) + 360) % 360;
      console.log('DEBUG: Final normalized angle:', finalAngle);
      
    } else {
      // Use the directional preset angle
      for (const [className, angle] of Object.entries(this.directionAngles)) {
        if (button.classList.contains(className)) {
          finalAngle = angle;
          angleInput.value = angle;
          this.activeInput = 'angle';
          angleInput.focus();
          console.log('Direction clicked:', className, 'preset angle:', angle);
          break;
        }
      }
    }
    
    // Place the vertex with the calculated angle
    this.placeVertexWithAngle(finalAngle);
    
    // If a custom angle was used to place the point, simulate a click on the angle
    // button to hide the input field for the next action.
    if (isCustomAngle) {
        console.log('Custom angle used; hiding angle input field post-placement.');
        this.handleAngleButtonClick();
    }
  }
  
  placeVertexWithAngle(angleDegrees) {
    const distanceInput = document.getElementById('distanceDisplay');
    if (!distanceInput) return;
    
    const distance = parseFloat(distanceInput.value);
    if (isNaN(distance) || distance <= 0) {
      console.log('Invalid distance:', distance);
      return;
    }
    
    console.log('Placing vertex with distance:', distance, 'angle:', angleDegrees);
    this.placeNextVertex(distance, angleDegrees);
  }

  setupArrowKeyListeners() {
    // Remove any existing listener first
    document.removeEventListener('keydown', this.boundHandleArrowKey);
    document.addEventListener('keydown', this.boundHandleArrowKey);
    console.log('DrawingManager: Arrow key listeners set up');
  }

  removeArrowKeyListeners() {
    document.removeEventListener('keydown', this.boundHandleArrowKey);
    console.log('DrawingManager: Arrow key listeners removed');
  }

  handleArrowKey(event) {
    if (!this.isActive) return;
    const angleInput = document.getElementById('angleDisplay');
    if (!angleInput) return;
    let angle;
    switch (event.key) {
      case 'ArrowRight':
        angle = 0;
        break;
      case 'ArrowUp':
        angle = 90;
        break;
      case 'ArrowLeft':
        angle = 180;
        break;
      case 'ArrowDown':
        angle = 270;
        break;
      default:
        return;
    }
    event.preventDefault();
    angleInput.value = angle;
    this.activeInput = 'angle';
    angleInput.focus();
    console.log('Arrow key pressed:', event.key, 'angle:', angle);
    this.checkAndPlaceNextPoint();
  }

 checkAndPlaceNextPoint() {
    if (this.waitingForFirstVertex || AppState.currentPolygonPoints.length === 0) return;
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    if (!distanceInput || !angleInput) return;
    const distance = parseFloat(distanceInput.value);
    const angle = parseFloat(angleInput.value);
    if (isNaN(distance) || distance <= 0) {
      console.log('Invalid distance:', distance);
      return;
    }
    if (isNaN(angle)) {
      console.log('Invalid angle:', angle);
      return;
    }

    // Determine if the angle entered via keyboard is a "custom" one
    const isCustomAngle = angleInput && !angleInput.classList.contains('hidden') && angle !== 0 && !Object.values(this.directionAngles).includes(angle);

    console.log('Placing next point with distance:', distance, 'angle:', angle);
    this.placeNextVertex(distance, angle);

    // If a custom angle was used, hide the input field for the next action.
    if (isCustomAngle) {
        console.log('Custom angle used via Enter; hiding angle input field post-placement.');
        this.handleAngleButtonClick();
    }
  }

placeNextVertex(distance, angleDegrees) {
    console.log('DEBUG: placeNextVertex called with angle =', angleDegrees, 'degrees');
    const currentPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1];
    const distanceInPixels = distance * this.PIXELS_PER_FOOT;
    const angleRadians = angleDegrees * (Math.PI / 180);
    const newX = currentPoint.x + distanceInPixels * Math.cos(angleRadians);
    const newY = currentPoint.y - distanceInPixels * Math.sin(angleRadians);
    console.log('DEBUG: Calculated new position =', {x: newX, y: newY}, 'from angle', angleDegrees, 'degrees');
    
    const newPoint = {
      x: newX,
      y: newY,
      name: `p${AppState.currentPolygonCounter}`
    };

    if (AppState.currentPolygonPoints.length >= 2) {
      console.log('DEBUG: Checking for line extension');
      const prevPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 2];
      const lastPoint = AppState.currentPolygonPoints[AppState.currentPolygonPoints.length - 1];
      const prevDx = lastPoint.x - prevPoint.x;
      const prevDy = lastPoint.y - prevPoint.y;
      const prevAngleRadians = Math.atan2(-prevDy, prevDx);
      const prevAngleDegrees = (prevAngleRadians * 180 / Math.PI + 360) % 360;
      const currentAngleDegrees = (angleDegrees + 360) % 360;
      const angleDifference = Math.abs(currentAngleDegrees - prevAngleDegrees);
      const normalizedDifference = Math.min(angleDifference, 360 - angleDifference);
      const isSameDirection = normalizedDifference < 1;
      
      if (isSameDirection) {
        console.log(`Same direction detected! Removing intermediate vertex ${lastPoint.name}`);
        AppState.currentPolygonPoints.pop();
        AppState.currentPolygonCounter--;
        newPoint.name = lastPoint.name;
        console.log(`Extended line from ${prevPoint.name} directly to ${newPoint.name}`);
      } else {
        console.log(`Different direction detected - keeping intermediate vertex`);
        console.log(`Previous angle: ${prevAngleDegrees.toFixed(1)}°, Current angle: ${currentAngleDegrees.toFixed(1)}°, Difference: ${normalizedDifference.toFixed(1)}°`);
      }
    }

    AppState.currentPolygonPoints.push(newPoint);
    AppState.currentPolygonCounter++;
    console.log(`Placed ${newPoint.name} at (${newX.toFixed(1)}, ${newY.toFixed(1)})`);
    
    this.autoPanToPoint(newX, newY);
    
    const distanceInput = document.getElementById('distanceDisplay');
    const angleInput = document.getElementById('angleDisplay');
    if (distanceInput) distanceInput.value = '0';
    if (angleInput) angleInput.value = '0';
    
    this.distanceInputSequence.length = 0;
    this.angleInputSequence.length = 0;
    
    this.activeInput = 'distance';
    if (distanceInput) distanceInput.focus();
    
    // Update helper points before redrawing
    HelperPointManager.updateHelperPoints();
    
    CanvasManager.saveAction();
    CanvasManager.redraw();
  }

  autoPanToPoint(x, y) {
    const viewport = document.getElementById('canvasViewport');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const viewportWidth = rect.width;
    const viewportHeight = rect.height;
    const screenX = x + AppState.viewportTransform.x;
    const screenY = y + AppState.viewportTransform.y;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    const margin = 100;
    const isOffScreen = screenX < margin || screenX > viewportWidth - margin || 
                       screenY < margin || screenY > viewportHeight - margin;
    if (isOffScreen) {
      const targetTransformX = centerX - x;
      const targetTransformY = centerY - y;
      const dx = targetTransformX - AppState.viewportTransform.x;
      const dy = targetTransformY - AppState.viewportTransform.y;
      const steps = 20;
      let step = 0;
      const animate = () => {
        step++;
        const progress = step / steps;
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        AppState.viewportTransform.x += dx * easeProgress / steps;
        AppState.viewportTransform.y += dy * easeProgress / steps;
        CanvasManager.updateViewportTransform();
        CanvasManager.redraw();
        if (step < steps) {
          requestAnimationFrame(animate);
        }
      };
      animate();
      console.log('Auto-panning to keep point in view');
    }
  }

  handleDecimalInput(event, fieldType) {
    const input = event.target;
    const key = event.key;
    
    console.log('Input handler:', key, 'Field:', fieldType);
    
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      
      if (fieldType === 'distance') {
        // Check if we need to start fresh
        if (input.value === '0' || input.value === '0.0') {
          this.distanceInputSequence.length = 0;
        }
        
        this.distanceInputSequence.push(parseInt(key));
        let number = 0;
        for (let i = 0; i < this.distanceInputSequence.length; i++) {
          number = number * 10 + this.distanceInputSequence[i];
        }
        number = number / 10;
        input.value = number.toFixed(1);
        console.log('Updated distance sequence:', this.distanceInputSequence, 'Display value:', input.value);
      } else {
        // Angle input - whole numbers only
        if (input.value === '0') {
          this.angleInputSequence.length = 0;
        }
        
        this.angleInputSequence.push(parseInt(key));
        let angleNumber = 0;
        for (let i = 0; i < this.angleInputSequence.length; i++) {
          angleNumber = angleNumber * 10 + this.angleInputSequence[i];
        }
        input.value = angleNumber.toString();
        console.log('Updated angle sequence:', this.angleInputSequence, 'Display value:', input.value);
      }
    } else if (key === 'Backspace') {
      event.preventDefault();
      if (fieldType === 'distance') {
        this.distanceInputSequence.pop();
        if (this.distanceInputSequence.length === 0) {
          input.value = '0';
        } else {
          let number = 0;
          for (let i = 0; i < this.distanceInputSequence.length; i++) {
            number = number * 10 + this.distanceInputSequence[i];
          }
          number = number / 10;
          input.value = number.toFixed(1);
        }
      } else {
        // Angle input - whole numbers only
        this.angleInputSequence.pop();
        if (this.angleInputSequence.length === 0) {
          input.value = '0';
        } else {
          let angleNumber = 0;
          for (let i = 0; i < this.angleInputSequence.length; i++) {
            angleNumber = angleNumber * 10 + this.angleInputSequence[i];
          }
          input.value = angleNumber.toString();
        }
      }
    } else if (key === 'Enter') {
      event.preventDefault();
      this.checkAndPlaceNextPoint();
    }
  }
}