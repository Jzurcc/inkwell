import { BrushType, CanvasElement, CanvasTool, DashStyle, ElementType, Point } from '../types.ts';
import { StateEngine } from '../engine/StateEngine.ts';
import { TextEditModal } from '../ui/TextEditModal.ts';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface RenderMetrics {
  fps: number;
  frameTimeMs: number;
  elementCount: number;
}

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public engine: StateEngine;
  public theme: 'light' | 'dark' = 'light';

  // Camera & Viewport
  public camera: Camera = { x: 0, y: 0, zoom: 1 };
  private dpr: number = 1;

  // Active Tool & Creative Customization State
  public activeTool: CanvasTool = 'select';
  /** Erase mode overlays on top of the current brush without changing activeTool */
  public isEraserMode: boolean = false;
  /** Tool that was active before erase mode was enabled, used to restore on toggle-off */
  private preEraseTool: CanvasTool = 'select';
  public strokeColor: string = '#0F172A';
  public strokeWidth: number = 3;
  public fillColor: string = 'transparent';
  public elementOpacity: number = 1;
  public activeBrushType: BrushType = 'pen';
  public activeDashStyle: DashStyle = 'solid';

  // Area Selection (Marquee / Circle / Lasso)
  public isAreaSelecting: boolean = false;
  public selectionMode: 'marquee' | 'circle_select' | 'lasso_select' | null = null;
  public selectionStartPoint: Point = { x: 0, y: 0 };
  public selectionCurrentPoint: Point = { x: 0, y: 0 };
  public selectionLassoPoints: Point[] = [];

  // Selection & Manipulation
  public selectedElementIds: Set<string> = new Set();
  private isDraggingSelection: boolean = false;
  private dragStartMouse: Point = { x: 0, y: 0 };
  private initialElementPositions: Map<string, { x: number; y: number; points?: Point[] }> = new Map();

  // Creation State
  private isDrawing: boolean = false;
  private currentDraftElement: CanvasElement | null = null;
  private currentPenPoints: Point[] = [];

  // Panning
  private isPanning: boolean = false;
  private lastPanPoint: Point = { x: 0, y: 0 };
  private isSpacePressed: boolean = false;

  // Remote cursors interpolated positions
  private lerpedCursors: Map<string, { x: number; y: number; targetX: number; targetY: number }> = new Map();

  // Metrics
  private frameCount = 0;
  private lastFpsUpdateTime = performance.now();
  public metrics: RenderMetrics = { fps: 60, frameTimeMs: 0, elementCount: 0 };

  // UI Sync listeners
  private toolChangeListeners: Array<(tool: CanvasTool) => void> = [];
  private styleChangeListeners: Array<() => void> = [];
  private selectionChangeListeners: Array<() => void> = [];
  private eraserModeChangeListeners: Array<(enabled: boolean) => void> = [];

  // Dirty flag & animation frame ID
  private isDirty: boolean = true;
  private rafId: number | null = null;

  // Minimap canvas
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;

  constructor(canvas: HTMLCanvasElement, engine: StateEngine) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Failed to get 2D canvas context');
    this.ctx = ctx;
    this.engine = engine;

    this.setupResizeHandler();
    this.setupEventListeners();
    this.subscribeEngine();
    this.startRenderLoop();

    const saved = typeof localStorage !== 'undefined' ? (localStorage.getItem('inkwell_theme') as 'light' | 'dark') : null;
    this.setTheme(saved || 'light');
  }

  public setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('inkwell_theme', theme);
    }
    this.styleChangeListeners.forEach((fn) => fn());
    this.requestRender();
  }

  public toggleTheme(): void {
    this.setTheme(this.theme === 'light' ? 'dark' : 'light');
  }

  public setMinimap(minimapCanvas: HTMLCanvasElement): void {
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d');
  }

  private setupResizeHandler(): void {
    const resize = () => {
      this.dpr = window.devicePixelRatio || 1;
      const width = this.canvas.parentElement?.clientWidth || window.innerWidth;
      const height = this.canvas.parentElement?.clientHeight || window.innerHeight;

      this.canvas.width = Math.floor(width * this.dpr);
      this.canvas.height = Math.floor(height * this.dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;

      this.requestRender();
    };

    window.addEventListener('resize', resize);
    resize();
  }

  private subscribeEngine(): void {
    this.engine.onStateChange(() => {
      this.requestRender();
    });

    this.engine.onPresenceChange(() => {
      // Update target positions for remote cursors
      for (const [clientId, presence] of this.engine.presences.entries()) {
        if (clientId === this.engine.clientId) continue;
        if (presence.cursor) {
          const existing = this.lerpedCursors.get(clientId);
          if (!existing) {
            this.lerpedCursors.set(clientId, {
              x: presence.cursor.x,
              y: presence.cursor.y,
              targetX: presence.cursor.x,
              targetY: presence.cursor.y
            });
          } else {
            existing.targetX = presence.cursor.x;
            existing.targetY = presence.cursor.y;
          }
        } else {
          this.lerpedCursors.delete(clientId);
        }
      }
      this.requestRender();
    });
  }

  public requestRender(): void {
    this.isDirty = true;
  }

  // --- Coordinate Transformations ---
  public screenToWorld(screenX: number, screenY: number): Point {
    return {
      x: (screenX - this.camera.x) / this.camera.zoom,
      y: (screenY - this.camera.y) / this.camera.zoom
    };
  }

  public worldToScreen(worldX: number, worldY: number): Point {
    return {
      x: worldX * this.camera.zoom + this.camera.x,
      y: worldY * this.camera.zoom + this.camera.y
    };
  }

  // --- Event Handling ---
  private setupEventListeners(): void {
    const el = this.canvas;

    el.addEventListener('mousedown', this.handleMouseDown.bind(this));
    window.addEventListener('mousemove', this.handleMouseMove.bind(this));
    window.addEventListener('mouseup', this.handleMouseUp.bind(this));
    el.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space' && !this.isSpacePressed) {
        this.isSpacePressed = true;
        el.style.cursor = 'grab';
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        this.deleteSelected();
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          this.engine.redo();
        } else {
          this.engine.undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        this.engine.redo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        this.duplicateSelected();
        return;
      }

      // Enter or F2 to edit text label / sticky note
      if (e.key === 'Enter' || e.key === 'F2') {
        if (this.selectedElementIds.size === 1) {
          const id = Array.from(this.selectedElementIds)[0];
          const el = this.engine.speculativeElements.get(id);
          if (el && (el.type === 'text' || el.type === 'sticky_note')) {
            e.preventDefault();
            TextEditModal.show(el, (newText) => {
              if (newText !== el.text) {
                this.engine.submitMutation('UPDATE', el.id, { text: newText });
              }
            });
            return;
          }
        }
      }

      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey) {
        // Shift + key cycles subtypes
        if (e.shiftKey) {
          if (e.key === 'B' || e.key === 'b') {
            e.preventDefault();
            this.cycleBrushType();
            return;
          }
          if (e.key === 'M' || e.key === 'm') {
            e.preventDefault();
            this.cycleSelectionTool();
            return;
          }
          if (e.key === 'G' || e.key === 'g' || e.key === 'L' || e.key === 'l') {
            e.preventDefault();
            this.cycleFillTool();
            return;
          }
          if (e.key === 'R' || e.key === 'r') {
            e.preventDefault();
            this.cycleShapeTool();
            return;
          }
          if (e.key === 'T' || e.key === 't' || e.key === 'S' || e.key === 's') {
            e.preventDefault();
            this.cycleTextTool();
            return;
          }
        }

        if (e.key === 'v' || e.key === 'V') this.setTool('select');
        if (e.key === 'b' || e.key === 'p' || (!e.shiftKey && (e.key === 'B' || e.key === 'P'))) {
          this.setEraserMode(false);
          this.setBrushType('pen');
        }
        if (e.key === 'e' || e.key === 'E') this.toggleEraserMode();
        if (e.key === 'd' || e.key === 'D') {
          if (this.selectedElementIds.size > 0) {
            this.deleteSelected();
          } else {
            this.setEraserMode(false);
            this.setTool('delete');
          }
        }
        if (e.key === 'j' || e.key === 'J') this.setTool('diamond');
        if (e.key === 'r' || (!e.shiftKey && e.key === 'R')) this.setTool('rectangle');
        if (e.key === 'c' || e.key === 'C') this.setTool('crop');
        if (e.key === 'a' || e.key === 'A') this.setTool('arrow');
        if (e.key === 's' || (!e.shiftKey && (e.key === 'S' || e.key === 's'))) {
          this.setEraserMode(false);
          this.setBrushType('spray');
        }
        if (e.key === 't' || (!e.shiftKey && e.key === 'T')) this.setTool('text');
        if (e.key === 'm' || (!e.shiftKey && e.key === 'M')) this.setTool('marquee');
        if (e.key === 'l' || (!e.shiftKey && e.key === 'L')) this.setTool('lasso_select');
        if (e.key === 'g' || (!e.shiftKey && e.key === 'G')) this.setTool('paint_bucket');
        if (e.key === 'i' || e.key === 'I') this.setTool('eyedropper');
        if (e.key === 'h' || e.key === 'H') this.setTool('hand');
        if (e.key === 'o' || e.key === 'O') this.setTool('zoom');

        // Direct brush subtypes
        if (e.key === 'n' || e.key === 'N') {
          this.setEraserMode(false);
          this.setBrushType('neon');
        }
        if (e.key === 'k' || e.key === 'K') {
          this.setEraserMode(false);
          this.setBrushType('calligraphy');
        }

        // Color number shortcuts (1-6)
        const palette = ['#38BDF8', '#22C55E', '#818CF8', '#F43F5E', '#F59E0B', '#F8FAFC'];
        if (e.key >= '1' && e.key <= '6') {
          const idx = parseInt(e.key, 10) - 1;
          if (palette[idx]) this.setStrokeColor(palette[idx]);
        }

        // Stroke width shortcuts ([ and ])
        if (e.key === '[') {
          this.setStrokeWidth(Math.max(1, this.strokeWidth - 2));
        } else if (e.key === ']') {
          this.setStrokeWidth(Math.min(100, this.strokeWidth + 2));
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        this.isPanning = false;
        el.style.cursor = this.activeTool === 'select' ? 'default' : this.activeTool === 'hand' ? 'grab' : 'crosshair';
      }
    });

    // Double click to edit sticky note or text
    el.addEventListener('dblclick', this.handleDoubleClick.bind(this));
  }

  public onToolChange(callback: (tool: CanvasTool) => void): () => void {
    this.toolChangeListeners.push(callback);
    return () => {
      this.toolChangeListeners = this.toolChangeListeners.filter((fn) => fn !== callback);
    };
  }

  public onStyleChange(callback: () => void): () => void {
    this.styleChangeListeners.push(callback);
    return () => {
      this.styleChangeListeners = this.styleChangeListeners.filter((fn) => fn !== callback);
    };
  }

  public onSelectionChange(callback: () => void): () => void {
    this.selectionChangeListeners.push(callback);
    return () => {
      this.selectionChangeListeners = this.selectionChangeListeners.filter((fn) => fn !== callback);
    };
  }

  public notifySelectionChange(): void {
    this.selectionChangeListeners.forEach((fn) => fn());
  }

  public setTool(tool: CanvasTool): void {
    // If switching away from eraser mode via setTool, clear the mode flag
    if (tool !== 'eraser' && this.isEraserMode) {
      this.isEraserMode = false;
      this.eraserModeChangeListeners.forEach((fn) => fn(false));
    }
    this.activeTool = tool;
    if (tool === 'select') {
      this.canvas.style.cursor = 'default';
    } else if (tool === 'hand') {
      this.canvas.style.cursor = 'grab';
    } else if (tool === 'zoom') {
      this.canvas.style.cursor = 'zoom-in';
    } else if (tool === 'eraser') {
      this.canvas.style.cursor = 'cell';
    } else if (tool === 'delete') {
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
    this.engine.updateLocalPresence({ activeTool: tool as any });
    this.toolChangeListeners.forEach((fn) => fn(tool));
  }

  /** Toggle eraser mode on/off without losing the current drawing tool */
  public toggleEraserMode(): void {
    this.setEraserMode(!this.isEraserMode);
  }

  public setEraserMode(enabled: boolean): void {
    if (enabled === this.isEraserMode) return;
    this.isEraserMode = enabled;
    if (enabled) {
      this.preEraseTool = this.activeTool;
      this.canvas.style.cursor = 'cell';
    } else {
      // Restore the tool that was active before erase mode
      const restore = this.preEraseTool === 'eraser' ? 'pen' : this.preEraseTool;
      this.activeTool = restore;
      this.canvas.style.cursor = restore === 'select' ? 'default' : 'crosshair';
    }
    this.eraserModeChangeListeners.forEach((fn) => fn(enabled));
    this.toolChangeListeners.forEach((fn) => fn(this.activeTool));
  }

  public onEraserModeChange(callback: (enabled: boolean) => void): () => void {
    this.eraserModeChangeListeners.push(callback);
    return () => {
      this.eraserModeChangeListeners = this.eraserModeChangeListeners.filter((fn) => fn !== callback);
    };
  }

  public cycleBrushType(): void {
    const brushes: BrushType[] = ['pen', 'marker', 'neon', 'calligraphy', 'spray'];
    const idx = brushes.indexOf(this.activeBrushType);
    const nextIdx = (idx + 1) % brushes.length;
    this.activeBrushType = brushes[nextIdx];
    this.setEraserMode(false);
    this.setTool('pen');
  }

  public cycleSelectionTool(): void {
    const selectionTools: CanvasTool[] = ['marquee', 'circle_select', 'lasso_select'];
    const idx = selectionTools.indexOf(this.activeTool);
    const nextIdx = (idx + 1) % selectionTools.length;
    this.setEraserMode(false);
    this.setTool(selectionTools[nextIdx]);
  }

  public cycleFillTool(): void {
    const fillTools: CanvasTool[] = ['paint_bucket', 'lasso_brush'];
    const idx = fillTools.indexOf(this.activeTool);
    const nextIdx = (idx + 1) % fillTools.length;
    this.setEraserMode(false);
    this.setTool(fillTools[nextIdx]);
  }

  public cycleShapeTool(): void {
    const shapes: CanvasTool[] = ['rectangle', 'circle', 'triangle', 'star', 'diamond', 'line', 'arrow'];
    const idx = shapes.indexOf(this.activeTool);
    const nextIdx = (idx + 1) % shapes.length;
    this.setEraserMode(false);
    this.setTool(shapes[nextIdx]);
  }

  public cycleTextTool(): void {
    const textTools: CanvasTool[] = ['text', 'sticky_note'];
    const idx = textTools.indexOf(this.activeTool);
    const nextIdx = (idx + 1) % textTools.length;
    this.setEraserMode(false);
    this.setTool(textTools[nextIdx]);
  }

  public setStrokeColor(color: string): void {
    this.strokeColor = color;
    for (const id of this.selectedElementIds) {
      this.engine.submitMutation('UPDATE', id, { stroke: color });
    }
    this.styleChangeListeners.forEach((fn) => fn());
    this.requestRender();
  }

  public setFillColor(color: string): void {
    this.fillColor = color;
    for (const id of this.selectedElementIds) {
      this.engine.submitMutation('UPDATE', id, { fill: color });
    }
    this.styleChangeListeners.forEach((fn) => fn());
    this.requestRender();
  }

  public setStrokeWidth(width: number): void {
    this.strokeWidth = Math.max(1, Math.min(100, Math.round(width)));
    for (const id of this.selectedElementIds) {
      this.engine.submitMutation('UPDATE', id, { strokeWidth: this.strokeWidth });
    }
    this.styleChangeListeners.forEach((fn) => fn());
    this.requestRender();
  }

  public setBrushType(brush: BrushType): void {
    this.activeBrushType = brush;
    if (brush === 'eraser') {
      this.setTool('eraser');
    } else {
      this.setTool('pen');
    }
    this.styleChangeListeners.forEach((fn) => fn());
    this.requestRender();
  }

  public setDashStyle(dash: DashStyle): void {
    this.activeDashStyle = dash;
    for (const id of this.selectedElementIds) {
      this.engine.submitMutation('UPDATE', id, { dash });
    }
    this.styleChangeListeners.forEach((fn) => fn());
    this.requestRender();
  }

  public setElementOpacity(opacity: number): void {
    this.elementOpacity = Math.max(0, Math.min(1, opacity));
    for (const id of this.selectedElementIds) {
      this.engine.submitMutation('UPDATE', id, { opacity: this.elementOpacity });
    }
    this.styleChangeListeners.forEach((fn) => fn());
    this.requestRender();
  }

  private handleMouseDown(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPoint = this.screenToWorld(screenX, screenY);

    // Pan with spacebar or middle mouse button
    if (this.isSpacePressed || e.button === 1) {
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return; // Only left click for tools

    if (this.activeTool === 'select') {
      const hit = this.hitTest(worldPoint);
      if (hit) {
        if (!e.shiftKey && !this.selectedElementIds.has(hit.id)) {
          this.selectedElementIds.clear();
        }
        this.selectedElementIds.add(hit.id);

        this.isDraggingSelection = true;
        this.dragStartMouse = worldPoint;

        this.initialElementPositions.clear();
        for (const id of this.selectedElementIds) {
          const el = this.engine.speculativeElements.get(id);
          if (el) {
            this.initialElementPositions.set(id, {
              x: el.x,
              y: el.y,
              // Deep-copy initial points so we can compute offset from origin each frame
              points: el.points ? el.points.map((p) => ({ ...p })) : undefined
            });
          }
        }
      } else {
        if (!e.shiftKey) {
          this.selectedElementIds.clear();
        }
        this.isAreaSelecting = true;
        this.selectionMode = 'marquee';
        this.selectionStartPoint = worldPoint;
        this.selectionCurrentPoint = worldPoint;
        this.selectionLassoPoints = [worldPoint];
      }
      this.engine.updateLocalPresence({ selectedIds: Array.from(this.selectedElementIds) });
      this.notifySelectionChange();
      this.requestRender();
      return;
    }

    // Delete element tool (D) — deletes the entire art element or shape
    if (this.activeTool === 'delete') {
      const hit = this.hitTest(worldPoint);
      if (hit) {
        this.engine.submitMutation('DELETE', hit.id, {});
        this.selectedElementIds.delete(hit.id);
        this.notifySelectionChange();
      }
      return;
    }

    // Part Eraser mode (E) — acts as a brush and deletes parts of the drawing
    if (this.isEraserMode || this.activeTool === 'eraser') {
      this.applyPartEraserAt(worldPoint);
      return;
    }

    if (this.activeTool === 'hand') {
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (this.activeTool === 'zoom') {
      const zoomFactor = (e.altKey || e.shiftKey) ? 0.8 : 1.25;
      const newZoom = Math.min(4.0, Math.max(0.15, this.camera.zoom * zoomFactor));
      const world = this.screenToWorld(screenX, screenY);
      this.camera.zoom = newZoom;
      this.camera.x = screenX - world.x * newZoom;
      this.camera.y = screenY - world.y * newZoom;
      this.requestRender();
      return;
    }

    if (this.activeTool === 'eyedropper') {
      const hit = this.hitTest(worldPoint);
      if (hit) {
        if (hit.fill && hit.fill !== 'transparent') {
          this.setFillColor(hit.fill);
        }
        if (hit.stroke) {
          this.setStrokeColor(hit.stroke);
        }
      }
      return;
    }

    if (this.activeTool === 'paint_bucket') {
      const hit = this.hitTest(worldPoint);
      if (hit) {
        const fillToApply = this.fillColor !== 'transparent' ? this.fillColor : this.strokeColor;
        if (hit.type === 'line' || hit.type === 'arrow') {
          this.engine.submitMutation('UPDATE', hit.id, { stroke: fillToApply });
        } else {
          this.engine.submitMutation('UPDATE', hit.id, { fill: fillToApply });
        }
        this.requestRender();
      }
      return;
    }

    if (this.activeTool === 'marquee' || this.activeTool === 'circle_select' || this.activeTool === 'lasso_select') {
      this.isAreaSelecting = true;
      this.selectionMode = this.activeTool;
      this.selectionStartPoint = worldPoint;
      this.selectionCurrentPoint = worldPoint;
      this.selectionLassoPoints = [worldPoint];
      if (!e.shiftKey) {
        this.selectedElementIds.clear();
        this.notifySelectionChange();
      }
      this.requestRender();
      return;
    }

    // Creating shapes
    this.isDrawing = true;
    const newId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (this.activeTool === 'lasso_brush') {
      this.currentPenPoints = [worldPoint];
      this.currentDraftElement = {
        id: newId,
        type: 'lasso_brush',
        x: worldPoint.x,
        y: worldPoint.y,
        width: 0,
        height: 0,
        stroke: this.strokeColor,
        strokeWidth: Math.max(1, this.strokeWidth),
        fill: this.fillColor !== 'transparent' ? this.fillColor : '#38BDF8',
        opacity: this.elementOpacity,
        layerId: this.engine.activeLayerId,
        points: this.currentPenPoints,
        authorId: this.engine.clientId,
        version: 1,
        lamportClock: this.engine.lamportClock + 1,
        updatedAt: Date.now()
      };
    } else if (this.activeTool === 'pen') {
      this.currentPenPoints = [worldPoint];
      this.currentDraftElement = {
        id: newId,
        type: 'pen',
        x: worldPoint.x,
        y: worldPoint.y,
        width: 0,
        height: 0,
        stroke: this.strokeColor,
        strokeWidth: this.strokeWidth,
        fill: 'transparent',
        opacity: this.elementOpacity,
        layerId: this.engine.activeLayerId,
        brushType: this.activeBrushType,
        dash: this.activeDashStyle,
        points: this.currentPenPoints,
        authorId: this.engine.clientId,
        version: 1,
        lamportClock: this.engine.lamportClock + 1,
        updatedAt: Date.now()
      };
    } else if (this.activeTool === 'sticky_note') {
      const noteWidth = 180;
      const noteHeight = 140;
      this.engine.submitMutation('CREATE', newId, {
        type: 'sticky_note',
        x: worldPoint.x - noteWidth / 2,
        y: worldPoint.y - noteHeight / 2,
        width: noteWidth,
        height: noteHeight,
        stroke: '#F59E0B',
        strokeWidth: 2,
        fill: '#FEF3C7',
        opacity: 0.95,
        layerId: this.engine.activeLayerId,
        text: 'New Idea\nDouble click to edit'
      });
      this.selectedElementIds.clear();
      this.selectedElementIds.add(newId);
      this.notifySelectionChange();
      this.setTool('select');
      this.isDrawing = false;
      return;
    } else if (this.activeTool === 'text') {
      const textId = newId;
      this.engine.submitMutation('CREATE', textId, {
        type: 'text',
        x: worldPoint.x,
        y: worldPoint.y,
        width: 180,
        height: 36,
        stroke: this.strokeColor,
        strokeWidth: 1,
        fill: 'transparent',
        opacity: this.elementOpacity,
        layerId: this.engine.activeLayerId,
        text: 'Text Label'
      });
      this.selectedElementIds.clear();
      this.selectedElementIds.add(textId);
      this.notifySelectionChange();
      this.setTool('select');
      this.isDrawing = false;

      const created = this.engine.speculativeElements.get(textId);
      if (created) {
        TextEditModal.show(created, (newText) => {
          if (newText !== created.text) {
            this.engine.submitMutation('UPDATE', textId, { text: newText });
          }
        });
      }
      return;
    } else {
      // Rectangle, Circle, Arrow, Triangle, Star, Diamond, Line
      const shapeTypes: ElementType[] = ['rectangle', 'circle', 'triangle', 'star', 'diamond', 'line', 'arrow'];
      if (!shapeTypes.includes(this.activeTool as ElementType)) {
        this.isDrawing = false;
        return;
      }
      this.dragStartMouse = worldPoint;
      this.currentDraftElement = {
        id: newId,
        type: this.activeTool as ElementType,
        x: worldPoint.x,
        y: worldPoint.y,
        width: 1,
        height: 1,
        stroke: this.strokeColor,
        strokeWidth: this.strokeWidth,
        fill: this.fillColor,
        opacity: this.elementOpacity,
        layerId: this.engine.activeLayerId,
        dash: this.activeDashStyle,
        authorId: this.engine.clientId,
        version: 1,
        lamportClock: this.engine.lamportClock + 1,
        updatedAt: Date.now()
      };
    }

    this.requestRender();
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPoint = this.screenToWorld(screenX, screenY);

    // Broadcast live cursor to peers (throttled inside StateEngine)
    this.engine.updateLocalPresence({ cursor: worldPoint });

    // Delete element dragging (D)
    if (this.activeTool === 'delete' && (e.buttons === 1)) {
      const hit = this.hitTest(worldPoint);
      if (hit) {
        this.engine.submitMutation('DELETE', hit.id, {});
        this.selectedElementIds.delete(hit.id);
        this.notifySelectionChange();
      }
      return;
    }

    // Part Eraser dragging (E) — carves parts out of drawing strokes
    if ((this.isEraserMode || this.activeTool === 'eraser') && (e.buttons === 1)) {
      this.applyPartEraserAt(worldPoint);
      return;
    }

    // Panning
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanPoint.x;
      const dy = e.clientY - this.lastPanPoint.y;
      this.camera.x += dx;
      this.camera.y += dy;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.requestRender();
      return;
    }

    // Dragging Selected Elements
    if (this.isDraggingSelection) {
      const dx = worldPoint.x - this.dragStartMouse.x;
      const dy = worldPoint.y - this.dragStartMouse.y;

      for (const id of this.selectedElementIds) {
        const init = this.initialElementPositions.get(id);
        const current = this.engine.speculativeElements.get(id);
        if (init && current) {
          // Optimistically update position
          current.x = Math.round(init.x + dx);
          current.y = Math.round(init.y + dy);
          // For pen and lasso_brush elements, offset the points array by the same delta
          if ((current.type === 'pen' || current.type === 'lasso_brush') && init.points) {
            current.points = init.points.map((p) => ({
              x: p.x + dx,
              y: p.y + dy
            }));
          }
        }
      }
      this.requestRender();
      return;
    }

    // Area selection dragging
    if (this.isAreaSelecting) {
      this.selectionCurrentPoint = worldPoint;
      if (this.selectionMode === 'lasso_select') {
        this.selectionLassoPoints.push(worldPoint);
      }
      this.requestRender();
      return;
    }

    // Active Drawing
    if (this.isDrawing && this.currentDraftElement) {
      if (this.currentDraftElement.type === 'pen' || this.currentDraftElement.type === 'lasso_brush') {
        this.currentPenPoints.push(worldPoint);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of this.currentPenPoints) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        this.currentDraftElement.x = minX;
        this.currentDraftElement.y = minY;
        this.currentDraftElement.width = Math.max(1, maxX - minX);
        this.currentDraftElement.height = Math.max(1, maxY - minY);
      } else {
        const minX = Math.min(this.dragStartMouse.x, worldPoint.x);
        const minY = Math.min(this.dragStartMouse.y, worldPoint.y);
        const width = Math.abs(worldPoint.x - this.dragStartMouse.x);
        const height = Math.abs(worldPoint.y - this.dragStartMouse.y);

        if (this.currentDraftElement.type === 'arrow' || this.currentDraftElement.type === 'line') {
          this.currentDraftElement.x = this.dragStartMouse.x;
          this.currentDraftElement.y = this.dragStartMouse.y;
          this.currentDraftElement.width = worldPoint.x - this.dragStartMouse.x;
          this.currentDraftElement.height = worldPoint.y - this.dragStartMouse.y;
        } else {
          this.currentDraftElement.x = minX;
          this.currentDraftElement.y = minY;
          this.currentDraftElement.width = Math.max(10, width);
          this.currentDraftElement.height = Math.max(10, height);
        }
      }
      this.requestRender();
    }
  }

  private handleMouseUp(): void {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.isSpacePressed ? 'grab' : this.activeTool === 'hand' ? 'grab' : 'default';
    }

    if (this.isAreaSelecting) {
      this.isAreaSelecting = false;
      this.applyAreaSelection();
      this.requestRender();
      return;
    }

    // Commit Dragged Selection
    if (this.isDraggingSelection) {
      this.isDraggingSelection = false;
      for (const id of this.selectedElementIds) {
        const el = this.engine.speculativeElements.get(id);
        const init = this.initialElementPositions.get(id);
        if (el && init && (el.x !== init.x || el.y !== init.y)) {
          const update: Record<string, unknown> = { x: el.x, y: el.y };
          // Persist updated points and dimensions for pen/lasso strokes
          if ((el.type === 'pen' || el.type === 'lasso_brush') && el.points) {
            update.points = el.points;
            update.width = el.width;
            update.height = el.height;
          }
          this.engine.submitMutation('UPDATE', id, update);
        }
      }
      this.initialElementPositions.clear();
      this.requestRender();
    }

    // Commit Drawn Shape
    if (this.isDrawing && this.currentDraftElement) {
      this.isDrawing = false;
      const el = this.currentDraftElement;
      this.currentDraftElement = null;

      if (el.type === 'lasso_brush') {
        if (this.currentPenPoints.length > 2) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const p of this.currentPenPoints) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
          }
          this.engine.submitMutation('CREATE', el.id, {
            type: 'lasso_brush',
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
            stroke: el.stroke,
            strokeWidth: el.strokeWidth,
            fill: el.fill,
            opacity: el.opacity,
            layerId: el.layerId,
            points: [...this.currentPenPoints]
          });
          this.selectedElementIds.clear();
          this.selectedElementIds.add(el.id);
          this.notifySelectionChange();
        }
        this.currentPenPoints = [];
      } else if (el.type === 'pen') {
        if (this.currentPenPoints.length > 0) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const p of this.currentPenPoints) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
          }
          const width = Math.max(1, maxX - minX);
          const height = Math.max(1, maxY - minY);
          this.engine.submitMutation('CREATE', el.id, {
            type: 'pen',
            x: minX,
            y: minY,
            width: width,
            height: height,
            stroke: el.stroke,
            strokeWidth: el.strokeWidth,
            opacity: el.opacity,
            layerId: el.layerId,
            brushType: el.brushType,
            dash: el.dash,
            points: this.currentPenPoints.length === 1
              ? [this.currentPenPoints[0], { x: this.currentPenPoints[0].x + 0.1, y: this.currentPenPoints[0].y }]
              : [...this.currentPenPoints]
          });
        }
        this.currentPenPoints = [];
      } else {
        if (Math.abs(el.width) > 5 || Math.abs(el.height) > 5) {
          this.engine.submitMutation('CREATE', el.id, {
            type: el.type,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            stroke: el.stroke,
            strokeWidth: el.strokeWidth,
            fill: el.fill,
            opacity: el.opacity,
            layerId: el.layerId,
            dash: el.dash
          });
          this.selectedElementIds.clear();
          this.selectedElementIds.add(el.id);
        }
      }

      this.requestRender();
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (e.ctrlKey || e.metaKey) {
      // Zoom centered at mouse position
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(4.0, Math.max(0.15, this.camera.zoom * zoomFactor));

      const worldBefore = this.screenToWorld(mouseX, mouseY);
      this.camera.zoom = newZoom;
      const worldAfter = this.screenToWorld(mouseX, mouseY);

      this.camera.x += (worldAfter.x - worldBefore.x) * newZoom;
      this.camera.y += (worldAfter.y - worldBefore.y) * newZoom;
    } else {
      // Pan with 2-finger scroll
      this.camera.x -= e.deltaX;
      this.camera.y -= e.deltaY;
    }

    this.requestRender();
  }

  private handleDoubleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPoint = this.screenToWorld(screenX, screenY);

    const hit = this.hitTest(worldPoint);
    if (hit && (hit.type === 'sticky_note' || hit.type === 'text')) {
      TextEditModal.show(hit, (newText) => {
        if (newText !== hit.text) {
          this.engine.submitMutation('UPDATE', hit.id, { text: newText });
        }
      });
    }
  }

  public deleteSelected(): void {
    if (this.selectedElementIds.size === 0) return;
    for (const id of this.selectedElementIds) {
      this.engine.submitMutation('DELETE', id, {});
    }
    this.selectedElementIds.clear();
    this.requestRender();
  }

  public duplicateSelected(): void {
    const newSelection = new Set<string>();
    for (const id of this.selectedElementIds) {
      const el = this.engine.speculativeElements.get(id);
      if (el) {
        const newId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        this.engine.submitMutation('CREATE', newId, {
          ...el,
          x: el.x + 30,
          y: el.y + 30
        });
        newSelection.add(newId);
      }
    }
    this.selectedElementIds = newSelection;
    this.requestRender();
  }

  public resetView(): void {
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.requestRender();
  }

  public zoomIn(): void {
    this.camera.zoom = Math.min(4.0, this.camera.zoom * 1.25);
    this.requestRender();
  }

  public zoomOut(): void {
    this.camera.zoom = Math.max(0.15, this.camera.zoom * 0.8);
    this.requestRender();
  }

  // --- Part Eraser for Freehand Strokes ---
  private applyPartEraserAt(worldPoint: Point): void {
    const eraseRadius = Math.max(14, this.strokeWidth * 1.5);
    const elements = Array.from(this.engine.speculativeElements.values());

    for (const el of elements) {
      if (el.layerId) {
        const layer = this.engine.layers.get(el.layerId);
        if (layer && (!layer.visible || layer.locked)) continue;
      }

      if ((el.type === 'pen' || el.type === 'lasso_brush') && el.points && el.points.length > 0) {
        const hasHit = el.points.some(
          (p) => Math.hypot(p.x - worldPoint.x, p.y - worldPoint.y) <= eraseRadius
        );

        if (hasHit) {
          const segments: Point[][] = [];
          let cur: Point[] = [];

          for (const p of el.points) {
            if (Math.hypot(p.x - worldPoint.x, p.y - worldPoint.y) > eraseRadius) {
              cur.push(p);
            } else {
              if (cur.length > 0) {
                segments.push(cur);
                cur = [];
              }
            }
          }
          if (cur.length > 0) segments.push(cur);

          const valid = segments.filter((s) => s.length > 1);

          if (valid.length === 0) {
            this.engine.submitMutation('DELETE', el.id, {});
            this.selectedElementIds.delete(el.id);
          } else {
            let minX0 = Infinity, maxX0 = -Infinity, minY0 = Infinity, maxY0 = -Infinity;
            for (const p of valid[0]) {
              if (p.x < minX0) minX0 = p.x;
              if (p.x > maxX0) maxX0 = p.x;
              if (p.y < minY0) minY0 = p.y;
              if (p.y > maxY0) maxY0 = p.y;
            }
            this.engine.submitMutation('UPDATE', el.id, {
              x: minX0,
              y: minY0,
              width: Math.max(1, maxX0 - minX0),
              height: Math.max(1, maxY0 - minY0),
              points: valid[0]
            });
            for (let i = 1; i < valid.length; i++) {
              let minXi = Infinity, maxXi = -Infinity, minYi = Infinity, maxYi = -Infinity;
              for (const p of valid[i]) {
                if (p.x < minXi) minXi = p.x;
                if (p.x > maxXi) maxXi = p.x;
                if (p.y < minYi) minYi = p.y;
                if (p.y > maxYi) maxYi = p.y;
              }
              const newFragId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
              this.engine.submitMutation('CREATE', newFragId, {
                type: el.type,
                x: minXi,
                y: minYi,
                width: Math.max(1, maxXi - minXi),
                height: Math.max(1, maxYi - minYi),
                stroke: el.stroke,
                strokeWidth: el.strokeWidth,
                fill: el.fill,
                opacity: el.opacity,
                layerId: el.layerId,
                brushType: el.brushType,
                dash: el.dash,
                points: valid[i]
              });
            }
          }
          this.requestRender();
        }
      }
    }
  }

  private distToSegment(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.hypot(p.x - projX, p.y - projY);
  }

  // --- Hit Testing ---
  private hitTest(point: Point): CanvasElement | null {
    const layerMap = this.engine.layers;
    const elements = Array.from(this.engine.speculativeElements.values()).reverse();
    for (const el of elements) {
      const layer = el.layerId ? layerMap.get(el.layerId) : null;
      // Skip if layer is hidden or locked
      if (layer && (!layer.visible || layer.locked)) {
        continue;
      }

      if (el.type === 'pen' && el.points && el.points.length > 0) {
        const threshold = Math.max(12, (el.strokeWidth || 4) / 2 + 8);
        const minX = Math.min(el.x, el.x + el.width) - threshold;
        const maxX = Math.max(el.x, el.x + el.width) + threshold;
        const minY = Math.min(el.y, el.y + el.height) - threshold;
        const maxY = Math.max(el.y, el.y + el.height) + threshold;
        if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
          continue;
        }

        if (el.points.length === 1) {
          if (Math.hypot(el.points[0].x - point.x, el.points[0].y - point.y) <= threshold) {
            return el;
          }
        } else {
          for (let i = 0; i < el.points.length - 1; i++) {
            if (this.distToSegment(point, el.points[i], el.points[i + 1]) <= threshold) {
              return el;
            }
          }
        }
      } else if (el.type === 'lasso_brush' && el.points && el.points.length > 0) {
        const threshold = Math.max(12, (el.strokeWidth || 4) / 2 + 8);
        const minX = Math.min(el.x, el.x + el.width) - threshold;
        const maxX = Math.max(el.x, el.x + el.width) + threshold;
        const minY = Math.min(el.y, el.y + el.height) - threshold;
        const maxY = Math.max(el.y, el.y + el.height) + threshold;
        if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
          continue;
        }

        if (this.isPointInPolygon(point, el.points)) {
          return el;
        }
        for (let i = 0; i < el.points.length; i++) {
          const p1 = el.points[i];
          const p2 = el.points[(i + 1) % el.points.length];
          if (this.distToSegment(point, p1, p2) <= threshold) {
            return el;
          }
        }
      } else if (el.type === 'arrow' || el.type === 'line') {
        const threshold = Math.max(12, (el.strokeWidth || 4) / 2 + 8);
        const x1 = el.x;
        const y1 = el.y;
        const x2 = el.x + el.width;
        const y2 = el.y + el.height;
        if (this.distToSegment(point, { x: x1, y: y1 }, { x: x2, y: y2 }) <= threshold) {
          return el;
        }
      } else {
        // Bounding box hit
        const minX = Math.min(el.x, el.x + el.width);
        const maxX = Math.max(el.x, el.x + el.width);
        const minY = Math.min(el.y, el.y + el.height);
        const maxY = Math.max(el.y, el.y + el.height);

        const pad = (el.type === 'text' || el.type === 'sticky_note') ? 10 : 4;
        if (point.x >= minX - pad && point.x <= maxX + pad && point.y >= minY - pad && point.y <= maxY + pad) {
          return el;
        }
      }
    }
    return null;
  }

  private applyAreaSelection(): void {
    if (!this.selectionMode) return;

    if (this.selectionMode === 'marquee') {
      const minX = Math.min(this.selectionStartPoint.x, this.selectionCurrentPoint.x);
      const maxX = Math.max(this.selectionStartPoint.x, this.selectionCurrentPoint.x);
      const minY = Math.min(this.selectionStartPoint.y, this.selectionCurrentPoint.y);
      const maxY = Math.max(this.selectionStartPoint.y, this.selectionCurrentPoint.y);

      for (const [id, el] of this.engine.speculativeElements.entries()) {
        const elMinX = Math.min(el.x, el.x + el.width);
        const elMaxX = Math.max(el.x, el.x + el.width);
        const elMinY = Math.min(el.y, el.y + el.height);
        const elMaxY = Math.max(el.y, el.y + el.height);

        if (elMinX <= maxX && elMaxX >= minX && elMinY <= maxY && elMaxY >= minY) {
          this.selectedElementIds.add(id);
        } else if (el.points && el.points.length > 0) {
          for (const p of el.points) {
            if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
              this.selectedElementIds.add(id);
              break;
            }
          }
        }
      }
    } else if (this.selectionMode === 'circle_select') {
      const cx = (this.selectionStartPoint.x + this.selectionCurrentPoint.x) / 2;
      const cy = (this.selectionStartPoint.y + this.selectionCurrentPoint.y) / 2;
      const rx = Math.max(1, Math.abs(this.selectionCurrentPoint.x - this.selectionStartPoint.x) / 2);
      const ry = Math.max(1, Math.abs(this.selectionCurrentPoint.y - this.selectionStartPoint.y) / 2);

      for (const [id, el] of this.engine.speculativeElements.entries()) {
        const elCx = el.x + el.width / 2;
        const elCy = el.y + el.height / 2;
        const normalizedDist = Math.pow((elCx - cx) / rx, 2) + Math.pow((elCy - cy) / ry, 2);
        if (normalizedDist <= 1.25) {
          this.selectedElementIds.add(id);
        } else if (el.points && el.points.length > 0) {
          for (const p of el.points) {
            if (Math.pow((p.x - cx) / rx, 2) + Math.pow((p.y - cy) / ry, 2) <= 1.0) {
              this.selectedElementIds.add(id);
              break;
            }
          }
        }
      }
    } else if (this.selectionMode === 'lasso_select' && this.selectionLassoPoints.length > 2) {
      for (const [id, el] of this.engine.speculativeElements.entries()) {
        const elCx = el.x + el.width / 2;
        const elCy = el.y + el.height / 2;
        if (this.isPointInPolygon({ x: elCx, y: elCy }, this.selectionLassoPoints)) {
          this.selectedElementIds.add(id);
        } else if (el.points && el.points.length > 0) {
          for (const p of el.points) {
            if (this.isPointInPolygon(p, this.selectionLassoPoints)) {
              this.selectedElementIds.add(id);
              break;
            }
          }
        }
      }
    }

    this.engine.updateLocalPresence({ selectedIds: Array.from(this.selectedElementIds) });
    this.notifySelectionChange();
  }

  private isPointInPolygon(p: Point, poly: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private drawAreaSelection(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = '#38BDF8';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1.5 / this.camera.zoom;
    ctx.setLineDash([5 / this.camera.zoom, 4 / this.camera.zoom]);

    if (this.selectionMode === 'marquee') {
      const minX = Math.min(this.selectionStartPoint.x, this.selectionCurrentPoint.x);
      const minY = Math.min(this.selectionStartPoint.y, this.selectionCurrentPoint.y);
      const w = Math.abs(this.selectionCurrentPoint.x - this.selectionStartPoint.x);
      const h = Math.abs(this.selectionCurrentPoint.y - this.selectionStartPoint.y);
      ctx.fillRect(minX, minY, w, h);
      ctx.strokeRect(minX, minY, w, h);
    } else if (this.selectionMode === 'circle_select') {
      const cx = (this.selectionStartPoint.x + this.selectionCurrentPoint.x) / 2;
      const cy = (this.selectionStartPoint.y + this.selectionCurrentPoint.y) / 2;
      const rx = Math.abs(this.selectionCurrentPoint.x - this.selectionStartPoint.x) / 2;
      const ry = Math.abs(this.selectionCurrentPoint.y - this.selectionStartPoint.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (this.selectionMode === 'lasso_select' && this.selectionLassoPoints.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.selectionLassoPoints[0].x, this.selectionLassoPoints[0].y);
      for (let i = 1; i < this.selectionLassoPoints.length; i++) {
        ctx.lineTo(this.selectionLassoPoints[i].x, this.selectionLassoPoints[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Render Loop (requestAnimationFrame) ---
  private startRenderLoop(): void {
    const loop = (timestamp: number) => {
      const frameStart = performance.now();

      // Interpolate remote cursors
      let hasMovingCursors = false;
      for (const [, c] of this.lerpedCursors.entries()) {
        const dx = c.targetX - c.x;
        const dy = c.targetY - c.y;
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          c.x += dx * 0.35;
          c.y += dy * 0.35;
          hasMovingCursors = true;
        }
      }

      if (this.isDirty || hasMovingCursors) {
        this.render();
        this.renderMinimap();
        this.isDirty = false;
      }

      // FPS Metrics
      this.frameCount++;
      if (timestamp - this.lastFpsUpdateTime >= 500) {
        this.metrics.fps = Math.round((this.frameCount * 1000) / (timestamp - this.lastFpsUpdateTime));
        this.frameCount = 0;
        this.lastFpsUpdateTime = timestamp;
      }
      this.metrics.frameTimeMs = Math.round((performance.now() - frameStart) * 10) / 10;
      this.metrics.elementCount = this.engine.speculativeElements.size;

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  // --- Main Canvas Render ---
  private render(): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Reset transform & clear screen (Paper warm background in light mode, OLED dark in dark mode)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.theme === 'light' ? '#FAF7F2' : '#0B0F19';
    ctx.fillRect(0, 0, width, height);

    // Apply Camera Transform
    ctx.setTransform(
      this.camera.zoom * this.dpr,
      0,
      0,
      this.camera.zoom * this.dpr,
      this.camera.x * this.dpr,
      this.camera.y * this.dpr
    );

    // 1. Draw Dot Matrix Grid
    this.drawDotGrid(ctx);

    // 2. Draw Committed Elements (Filtered by layer visibility, sorted by layer order)
    const layerMap = this.engine.layers;
    const elements = Array.from(this.engine.speculativeElements.values());

    const visibleElements = elements.filter((el) => {
      if (!el.layerId) return true;
      const layer = layerMap.get(el.layerId);
      return !layer || layer.visible;
    });

    visibleElements.sort((a, b) => {
      const orderA = a.layerId && layerMap.has(a.layerId) ? layerMap.get(a.layerId)!.order : 0;
      const orderB = b.layerId && layerMap.has(b.layerId) ? layerMap.get(b.layerId)!.order : 0;
      return orderA - orderB;
    });

    for (const el of visibleElements) {
      const layer = el.layerId ? layerMap.get(el.layerId) : null;
      const layerOpacity = layer ? layer.opacity : 1;
      this.drawElement(ctx, el, layerOpacity);
    }

    // 3. Draw In-Progress Draft Element
    if (this.currentDraftElement) {
      this.drawElement(ctx, this.currentDraftElement);
    }

    // 4. Draw Selection Outlines
    const selectColor = this.theme === 'light' ? '#EA580C' : '#FB923C';
    for (const id of this.selectedElementIds) {
      const el = this.engine.speculativeElements.get(id);
      if (el) {
        this.drawSelectionOutline(ctx, el, selectColor);
      }
    }

    // 5. Draw Remote Selected Outlines
    for (const [clientId, presence] of this.engine.presences.entries()) {
      if (clientId === this.engine.clientId) continue;
      for (const id of presence.selectedIds) {
        const el = this.engine.speculativeElements.get(id);
        if (el) {
          this.drawSelectionOutline(ctx, el, presence.clientColor, presence.clientName);
        }
      }
    }

    // 6. Draw Remote Cursors
    this.drawRemoteCursors(ctx);

    // 7. Draw Active Area Selection (Marquee / Circle / Lasso)
    if (this.isAreaSelecting) {
      this.drawAreaSelection(ctx);
    }
  }

  private drawDotGrid(ctx: CanvasRenderingContext2D): void {
    const gridSize = 32;
    const worldLeft = -this.camera.x / this.camera.zoom;
    const worldTop = -this.camera.y / this.camera.zoom;
    const worldRight = worldLeft + (this.canvas.width / this.dpr) / this.camera.zoom;
    const worldBottom = worldTop + (this.canvas.height / this.dpr) / this.camera.zoom;

    const startX = Math.floor(worldLeft / gridSize) * gridSize;
    const endX = Math.ceil(worldRight / gridSize) * gridSize;
    const startY = Math.floor(worldTop / gridSize) * gridSize;
    const endY = Math.ceil(worldBottom / gridSize) * gridSize;

    ctx.fillStyle = this.theme === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    const dotRadius = Math.max(1, 1.2 / this.camera.zoom);

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.moveTo(x + dotRadius, y);
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  private drawElement(ctx: CanvasRenderingContext2D, el: CanvasElement, layerOpacity: number = 1): void {
    ctx.save();
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.fillStyle = el.fill;
    ctx.globalAlpha = (el.opacity ?? 1) * layerOpacity;

    // Apply Dash Styling
    if (el.dash === 'dashed') {
      ctx.setLineDash([el.strokeWidth * 2.5, el.strokeWidth * 2]);
    } else if (el.dash === 'dotted') {
      ctx.setLineDash([el.strokeWidth * 0.8, el.strokeWidth * 1.5]);
    } else {
      ctx.setLineDash([]);
    }

    switch (el.type) {
      case 'rectangle': {
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, el.width, el.height, 8);
        if (el.fill && el.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;
      }

      case 'circle': {
        ctx.beginPath();
        const rx = Math.abs(el.width / 2);
        const ry = Math.abs(el.height / 2);
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (el.fill && el.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;
      }

      case 'triangle': {
        ctx.beginPath();
        const topX = el.x + el.width / 2;
        const topY = el.y;
        const rightX = el.x + el.width;
        const rightY = el.y + el.height;
        const leftX = el.x;
        const leftY = el.y + el.height;
        ctx.moveTo(topX, topY);
        ctx.lineTo(rightX, rightY);
        ctx.lineTo(leftX, leftY);
        ctx.closePath();
        if (el.fill && el.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;
      }

      case 'star': {
        ctx.beginPath();
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const outerR = Math.min(Math.abs(el.width), Math.abs(el.height)) / 2;
        const innerR = outerR * 0.45;
        const spikes = 5;
        let rot = (Math.PI / 2) * 3;
        const step = Math.PI / spikes;

        ctx.moveTo(cx, cy - outerR);
        for (let i = 0; i < spikes; i++) {
          let x = cx + Math.cos(rot) * outerR;
          let y = cy + Math.sin(rot) * outerR;
          ctx.lineTo(x, y);
          rot += step;

          x = cx + Math.cos(rot) * innerR;
          y = cy + Math.sin(rot) * innerR;
          ctx.lineTo(x, y);
          rot += step;
        }
        ctx.lineTo(cx, cy - outerR);
        ctx.closePath();
        if (el.fill && el.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;
      }

      case 'diamond': {
        ctx.beginPath();
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        ctx.moveTo(cx, el.y);
        ctx.lineTo(el.x + el.width, cy);
        ctx.lineTo(cx, el.y + el.height);
        ctx.lineTo(el.x, cy);
        ctx.closePath();
        if (el.fill && el.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;
      }

      case 'line': {
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height);
        ctx.stroke();
        break;
      }

      case 'pen': {
        if (!el.points || el.points.length < 2) break;
        const brush = el.brushType || 'pen';

        if (brush === 'marker') {
          ctx.save();
          ctx.globalAlpha = (el.opacity ?? 1) * 0.4 * layerOpacity;
          ctx.lineCap = 'square';
          ctx.lineJoin = 'bevel';
          ctx.lineWidth = el.strokeWidth * 2.2;
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x, el.points[i].y);
          }
          ctx.stroke();
          ctx.restore();
        } else if (brush === 'neon') {
          ctx.save();
          ctx.shadowColor = el.stroke;
          ctx.shadowBlur = el.strokeWidth * 3.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x, el.points[i].y);
          }
          ctx.stroke();
          ctx.lineWidth = Math.max(1.5, el.strokeWidth * 0.35);
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();
          ctx.restore();
        } else if (brush === 'calligraphy') {
          ctx.save();
          ctx.lineCap = 'butt';
          ctx.lineJoin = 'miter';
          ctx.beginPath();
          for (let i = 0; i < el.points.length - 1; i++) {
            const p1 = el.points[i];
            const p2 = el.points[i + 1];
            const angle = Math.PI / 4;
            const slantOffset = el.strokeWidth / 2;
            const ox = Math.cos(angle) * slantOffset;
            const oy = Math.sin(angle) * slantOffset;

            ctx.moveTo(p1.x - ox, p1.y - oy);
            ctx.lineTo(p1.x + ox, p1.y + oy);
            ctx.lineTo(p2.x + ox, p2.y + oy);
            ctx.lineTo(p2.x - ox, p2.y - oy);
            ctx.closePath();
            ctx.fillStyle = el.stroke;
            ctx.fill();
          }
          ctx.restore();
        } else if (brush === 'spray') {
          ctx.save();
          ctx.fillStyle = el.stroke;
          const radius = el.strokeWidth * 2.5;
          for (const p of el.points) {
            for (let s = 0; s < 6; s++) {
              const r = Math.random() * radius;
              const a = Math.random() * Math.PI * 2;
              const px = p.x + Math.cos(a) * r;
              const py = p.y + Math.sin(a) * r;
              ctx.beginPath();
              ctx.arc(px, py, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        } else {
          // Standard Pen
          ctx.beginPath();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(el.points[0].x, el.points[0].y);

          for (let i = 1; i < el.points.length - 1; i++) {
            const xc = (el.points[i].x + el.points[i + 1].x) / 2;
            const yc = (el.points[i].y + el.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(el.points[i].x, el.points[i].y, xc, yc);
          }
          ctx.lineTo(el.points[el.points.length - 1].x, el.points[el.points.length - 1].y);
          ctx.stroke();
        }
        break;
      }

      case 'lasso_brush': {
        if (!el.points || el.points.length < 2) break;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length - 1; i++) {
          const xc = (el.points[i].x + el.points[i + 1].x) / 2;
          const yc = (el.points[i].y + el.points[i + 1].y) / 2;
          ctx.quadraticCurveTo(el.points[i].x, el.points[i].y, xc, yc);
        }
        ctx.lineTo(el.points[el.points.length - 1].x, el.points[el.points.length - 1].y);
        ctx.closePath();
        if (el.fill && el.fill !== 'transparent') {
          ctx.fillStyle = el.fill;
          ctx.fill();
        }
        if (el.stroke && el.strokeWidth > 0) {
          ctx.strokeStyle = el.stroke;
          ctx.lineWidth = el.strokeWidth;
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      case 'arrow': {
        const x1 = el.x;
        const y1 = el.y;
        const x2 = el.x + el.width;
        const y2 = el.y + el.height;
        const headLen = Math.max(14, el.strokeWidth * 3);
        const angle = Math.atan2(y2 - y1, x2 - x1);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = el.stroke;
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'sticky_note': {
        ctx.shadowColor = this.theme === 'light' ? 'rgba(15, 23, 42, 0.12)' : 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 6;

        ctx.beginPath();
        ctx.fillStyle = el.fill || '#FEF08A';
        ctx.roundRect(el.x, el.y, el.width, el.height, 10);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = el.stroke || '#EAB308';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (el.text) {
          ctx.fillStyle = '#1E293B';
          ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
          ctx.textBaseline = 'top';
          const lines = el.text.split('\n');
          let textY = el.y + 14;
          for (const line of lines) {
            ctx.fillText(line, el.x + 14, textY, el.width - 28);
            textY += 20;
          }
        }
        break;
      }

      case 'text': {
        ctx.fillStyle = el.stroke || (this.theme === 'light' ? '#0F172A' : '#FFFFFF');
        ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(el.text || '', el.x, el.y);
        break;
      }
    }

    ctx.restore();
  }

  private drawSelectionOutline(
    ctx: CanvasRenderingContext2D,
    el: CanvasElement,
    color: string,
    label?: string
  ): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);

    let minX = el.x;
    let minY = el.y;
    let w = el.width;
    let h = el.height;

    if ((el.type === 'pen' || el.type === 'lasso_brush') && el.points && el.points.length > 0) {
      let maxX = el.points[0].x;
      let maxY = el.points[0].y;
      minX = el.points[0].x;
      minY = el.points[0].y;
      for (const p of el.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      w = maxX - minX;
      h = maxY - minY;
    }

    const pad = 6 / this.camera.zoom;
    ctx.strokeRect(minX - pad, minY - pad, Math.max(4, w) + pad * 2, Math.max(4, h) + pad * 2);

    if (label) {
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = `600 ${11 / this.camera.zoom}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(label, minX - pad, minY - pad - 6 / this.camera.zoom);
    }

    ctx.restore();
  }

  private drawRemoteCursors(ctx: CanvasRenderingContext2D): void {
    for (const [clientId, presence] of this.engine.presences.entries()) {
      if (clientId === this.engine.clientId) continue;
      const pos = this.lerpedCursors.get(clientId);
      if (!pos) continue;

      ctx.save();
      const x = pos.x;
      const y = pos.y;
      const color = presence.clientColor || '#38BDF8';

      // Draw Cursor Arrow
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.5 / this.camera.zoom;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 12 / this.camera.zoom, y + 16 / this.camera.zoom);
      ctx.lineTo(x + 5 / this.camera.zoom, y + 16 / this.camera.zoom);
      ctx.lineTo(x, y + 22 / this.camera.zoom);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Client Name Pill Tag
      const name = presence.clientName || 'Peer';
      ctx.font = `600 ${11 / this.camera.zoom}px "Plus Jakarta Sans", sans-serif`;
      const textMetrics = ctx.measureText(name);
      const tagWidth = textMetrics.width + 12 / this.camera.zoom;
      const tagHeight = 18 / this.camera.zoom;
      const tagX = x + 14 / this.camera.zoom;
      const tagY = y + 14 / this.camera.zoom;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagWidth, tagHeight, 4 / this.camera.zoom);
      ctx.fill();

      ctx.fillStyle = '#0F172A';
      ctx.fillText(name, tagX + 6 / this.camera.zoom, tagY + 13 / this.camera.zoom);

      ctx.restore();
    }
  }

  // --- Minimap Minimap Render ---
  private renderMinimap(): void {
    if (!this.minimapCanvas || !this.minimapCtx) return;

    const mCtx = this.minimapCtx;
    const mW = this.minimapCanvas.width;
    const mH = this.minimapCanvas.height;

    mCtx.fillStyle = this.theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.9)';
    mCtx.fillRect(0, 0, mW, mH);

    const elements = Array.from(this.engine.speculativeElements.values());
    if (elements.length === 0) return;

    // Calculate bounding box of all elements
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }

    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const worldW = Math.max(100, maxX - minX);
    const worldH = Math.max(100, maxY - minY);
    const scale = Math.min(mW / worldW, mH / worldH);

    // Draw elements on minimap
    for (const el of elements) {
      const mx = (el.x - minX) * scale;
      const my = (el.y - minY) * scale;
      const mw = Math.max(2, el.width * scale);
      const mh = Math.max(2, el.height * scale);

      mCtx.fillStyle = el.stroke || (this.theme === 'light' ? '#0F172A' : '#38BDF8');
      mCtx.fillRect(mx, my, mw, mh);
    }

    // Viewport Rect on Minimap
    const vpWorldLeft = -this.camera.x / this.camera.zoom;
    const vpWorldTop = -this.camera.y / this.camera.zoom;
    const vpWorldW = (this.canvas.width / this.dpr) / this.camera.zoom;
    const vpWorldH = (this.canvas.height / this.dpr) / this.camera.zoom;

    const vpMx = (vpWorldLeft - minX) * scale;
    const vpMy = (vpWorldTop - minY) * scale;
    const vpMw = vpWorldW * scale;
    const vpMh = vpWorldH * scale;

    mCtx.strokeStyle = this.theme === 'light' ? '#EA580C' : '#FB923C';
    mCtx.lineWidth = 1.5;
    mCtx.strokeRect(vpMx, vpMy, vpMw, vpMh);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }
}
