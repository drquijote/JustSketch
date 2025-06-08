// src/drawing.js - Drawing Module for Lines and Polygons
import { AppState } from './state.js';
import { CanvasManager } from './canvas.js';

export class DrawingManager {
  constructor() {
    console.log('DrawingManager: Initializing');
    
    // Drawing state
    this.isActive = false;
    this.currentLine = null;
    this.currentPolygon = null;
    this.isDrawingLine = false;
    this.isDrawingPolygon = false;
    this.previewPoint = null;
    
    // Setup event listeners for canvas redraws
    this.setupEventListeners();
    
    console.log('DrawingManager: Initialized');
  }
  
  setupEventListeners() {
    // Listen for canvas redraw events
    AppState.on('canvas:redraw:lines', () => this.drawLines());
    AppState.on('canvas:redraw:polygons', () => this.drawPolygons());
    
    // Listen for mode changes
    AppState.on('mode:changed', (e) => {
      if (e.detail.mode === 'drawing') {
        this.activate();
      } else {
        this.deactivate();
      }
    });
    
    console.log('DrawingManager: Event listeners setup complete');
  }
  
  activate() {
    if (this.isActive) return;
    
    console.log('DrawingManager: Activating drawing mode');
    this.isActive = true;
    
    // Add event listeners for drawing interactions
    const canvas = AppState.canvas;
    if (canvas) {
      canvas.addEventListener('click', this.handleCanvasClick.bind(this));
      canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
      canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
      
      // Touch events for mobile
      canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
      canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
      canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }
    
    // Update UI to show drawing mode
    AppState.emit('ui:drawing:activated');
  }
  
  deactivate() {
    if (!this.isActive) return;
    
    console.log('DrawingManager: Deactivating drawing mode');
    this.isActive = false;
    
    // Remove event listeners
    const canvas = AppState.canvas;
    if (canvas) {
      canvas.removeEventListener('click', this.handleCanvasClick.bind(this));
      canvas.removeEventListener('mousemove', this.handleMouseMove.bind(this));
      canvas.removeEventListener('dblclick', this.handleDoubleClick.bind(this));
      canvas.removeEventListener('touchstart', this.handleTouchStart.bind(this));
      canvas.removeEventListener('touchmove', this.handleTouchMove.bind(this));
      canvas.removeEventListener('touchend', this.handleTouchEnd.bind(this));
    }
    
    // Cancel any current drawing
    this.cancelCurrentDrawing();
    
    // Update UI
    AppState.emit('ui:drawing:deactivated');
  }
  
  // Drawing event handlers
  handleCanvasClick(e) {
    if (!this.isActive) return;
    
    e.preventDefault();
    const pos = CanvasManager.screenToCanvas(e.clientX, e.clientY);
    console.log('DrawingManager: Canvas click at:', pos);
    
    // For now, just add a simple line point
    this.addPoint(pos.x, pos.y);
  }
  
  handleMouseMove(e) {
    if (!this.isActive) return;
    
    const pos = CanvasManager.screenToCanvas(e.clientX, e.clientY);
    this.previewPoint = pos;
    
    // Redraw to show preview
    CanvasManager.redraw();
  }
  
  handleDoubleClick(e) {
    if (!this.isActive) return;
    
    e.preventDefault();
    console.log('DrawingManager: Double click - finishing current drawing');
    this.finishCurrentDrawing();
  }
  
  handleTouchStart(e) {
    if (!this.isActive) return;
    
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const pos = CanvasManager.screenToCanvas(touch.clientX, touch.clientY);
      this.addPoint(pos.x, pos.y);
    }
  }
  
  handleTouchMove(e) {
    if (!this.isActive) return;
    
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const pos = CanvasManager.screenToCanvas(touch.clientX, touch.clientY);
      this.previewPoint = pos;
      CanvasManager.redraw();
    }
  }
  
  handleTouchEnd(e) {
    if (!this.isActive) return;
    
    e.preventDefault();
  }
  
  // Drawing logic methods
  addPoint(x, y) {
    console.log('DrawingManager: Adding point at:', x, y);
    
    if (!this.currentPolygon) {
      // Start new polygon
      this.currentPolygon = {
        id: Date.now(),
        points: [{ x, y }],
        strokeColor: '#2c3e50',
        fillColor: 'rgba(52, 152, 219, 0.1)',
        lineWidth: 2,
        closed: false
      };
      console.log('DrawingManager: Started new polygon');
    } else {
      // Add point to current polygon
      this.currentPolygon.points.push({ x, y });
      console.log('DrawingManager: Added point to polygon, total points:', this.currentPolygon.points.length);
    }
    
    CanvasManager.redraw();
  }
  
  finishCurrentDrawing() {
    if (this.currentPolygon && this.currentPolygon.points.length >= 3) {
      // Close the polygon and save it
      this.currentPolygon.closed = true;
      AppState.drawnPolygons.push(this.currentPolygon);
      
      console.log('DrawingManager: Finished polygon with', this.currentPolygon.points.length, 'points');
      
      // Save action and reset
      CanvasManager.saveAction();
      this.currentPolygon = null;
      this.previewPoint = null;
      
      CanvasManager.redraw();
    } else {
      console.log('DrawingManager: Cannot finish polygon - need at least 3 points');
    }
  }
  
  cancelCurrentDrawing() {
    if (this.currentPolygon) {
      console.log('DrawingManager: Cancelled current drawing');
      this.currentPolygon = null;
      this.previewPoint = null;
      CanvasManager.redraw();
    }
  }
  
  // Rendering methods
  drawLines() {
    const { ctx } = AppState;
    if (!ctx) return;
    
    console.log('DrawingManager: Drawing', AppState.drawnLines.length, 'lines');
    
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
    
    console.log('DrawingManager: Drawing', AppState.drawnPolygons.length, 'polygons');
    
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
    });
    
    // Draw current polygon being drawn
    if (this.currentPolygon && this.currentPolygon.points.length > 0) {
      ctx.strokeStyle = '#3498db';
      ctx.fillStyle = 'rgba(52, 152, 219, 0.2)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      ctx.moveTo(this.currentPolygon.points[0].x, this.currentPolygon.points[0].y);
      
      for (let i = 1; i < this.currentPolygon.points.length; i++) {
        ctx.lineTo(this.currentPolygon.points[i].x, this.currentPolygon.points[i].y);
      }
      
      // Draw preview line to mouse cursor
      if (this.previewPoint) {
        ctx.setLineDash([5, 5]);
        ctx.lineTo(this.previewPoint.x, this.previewPoint.y);
        ctx.setLineDash([]);
      }
      
      ctx.stroke();
      
      // Draw points as small circles
      this.currentPolygon.points.forEach((point, index) => {
        ctx.fillStyle = index === 0 ? '#e74c3c' : '#3498db';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  
  // Public API methods
  startLineDrawing() {
    console.log('DrawingManager: Starting line drawing mode');
    this.isDrawingLine = true;
    this.isDrawingPolygon = false;
  }
  
  startPolygonDrawing() {
    console.log('DrawingManager: Starting polygon drawing mode');
    this.isDrawingPolygon = true;
    this.isDrawingLine = false;
  }
  
  clearAll() {
    console.log('DrawingManager: Clearing all drawings');
    AppState.drawnLines = [];
    AppState.drawnPolygons = [];
    this.cancelCurrentDrawing();
    CanvasManager.saveAction();
    CanvasManager.redraw();
  }
}