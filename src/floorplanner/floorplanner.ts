import { EventEmitter } from '../core/event-emitter';
import { Dimensioning } from '../core/dimensioning';
import type { Floorplan } from '../model/floorplan';
import type { Corner } from '../model/corner';
import type { Wall } from '../model/wall';
import { FloorplannerView, floorplannerModes } from './floorplanner_view';

export { floorplannerModes };

/** Pixels of mouse movement after which a click becomes a drag. */
const dragThresholdPx = 4;
/** Maximum distance (cm) at which the cursor snaps to an existing corner. */
const cornerSnapCm = 25;
/** Distance (cm) under which two corners are considered coincident. */
const cornerCloseCm = 15;

/** Live drawing telemetry for UI subscribers (length, angle, etc.). */
export interface DrawState {
  active: boolean;
  /** Current rubber-band length in cm (0 when no lastNode). */
  lengthCm: number;
  /** Current rubber-band angle in degrees, 0 = +x axis, counter-clockwise. */
  angleDeg: number;
  /** Whether the next click would close a polygon by hitting an existing corner. */
  willClose: boolean;
  /** Constraint values currently locked by the user (null = free). */
  constraintLengthCm: number | null;
  constraintAngleDeg: number | null;
}

export class Floorplanner {
  public mode = 0;
  public activeWall: Wall | null = null;
  public activeCorner: Corner | null = null;
  public originX = 0;
  public originY = 0;
  public targetX = 0;
  public targetY = 0;
  public lastNode: Corner | null = null;

  /** Snap the cursor to the grid while drawing. */
  public snapToGrid = true;
  /** Grid spacing in centimetres (default = 25 cm ≈ 10"). */
  public gridSizeCm = 25;
  /** Snap to existing corners while drawing. */
  public snapToCorners = true;
  /** Snap to 15° angle increments while drawing (also forced by Shift). */
  public angleSnap = false;

  /** When non-null, the next-wall length is locked to this value (cm). */
  public constraintLengthCm: number | null = null;
  /** When non-null, the next-wall direction is locked to this angle (radians, 0 = +x). */
  public constraintAngleRad: number | null = null;

  public modeResetCallbacks = new EventEmitter<(mode: number) => void>();
  public drawStateCallbacks = new EventEmitter<(state: DrawState) => void>();

  private canvasElement: HTMLCanvasElement;
  private view: FloorplannerView;

  private mouseDown = false;
  private mouseDragged = false;
  private mouseX = 0;     // world (cm)
  private mouseY = 0;     // world (cm)
  private rawMouseX = 0;  // canvas pixels at last move
  private rawMouseY = 0;
  private downRawX = 0;
  private downRawY = 0;
  private lastX = 0;
  private lastY = 0;
  private shiftHeld = false;

  private cmPerPixel: number;
  private pixelsPerCm: number;

  constructor(canvas: string, private floorplan: Floorplan) {
    this.canvasElement = document.getElementById(canvas) as HTMLCanvasElement;
    this.view = new FloorplannerView(this.floorplan, this, canvas);

    // 15 px per foot — matches the original blueprint3d zoom level.
    const cmPerFoot = 30.48;
    const pixelsPerFoot = 15.0;
    this.cmPerPixel = cmPerFoot / pixelsPerFoot;
    this.pixelsPerCm = 1.0 / this.cmPerPixel;

    this.setMode(floorplannerModes.MOVE);

    this.canvasElement.addEventListener('mousedown', (e) => this.mousedown(e));
    this.canvasElement.addEventListener('mousemove', (e) => this.mousemove(e));
    this.canvasElement.addEventListener('mouseup', (e) => this.mouseup(e));
    this.canvasElement.addEventListener('mouseleave', () => this.mouseleave());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.shiftHeld = true;
      if (e.key === 'Escape') this.escapeKey();
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.shiftHeld = false;
    });

    floorplan.roomLoadedCallbacks.add(() => this.reset());
  }

  // ------------------------------------------------------------ public API

  public setMode(mode: number) {
    this.lastNode = null;
    this.constraintLengthCm = null;
    this.constraintAngleRad = null;
    this.mode = mode;
    this.modeResetCallbacks.fire(mode);
    this.fireDrawState();
    this.updateTarget();
  }

  public reset() {
    this.resizeView();
    this.setMode(floorplannerModes.MOVE);
    this.resetOrigin();
    this.view.draw();
  }

  public resizeView() {
    this.view.handleWindowResize();
  }

  public setSnapToGrid(value: boolean) {
    this.snapToGrid = value;
    this.updateTarget();
  }

  public setGridSizeCm(value: number) {
    this.gridSizeCm = Math.max(1, value);
    this.updateTarget();
  }

  public setAngleSnap(value: boolean) {
    this.angleSnap = value;
    this.updateTarget();
  }

  /** Lock the next-wall length to a specific cm value (or null to clear). */
  public setConstraintLengthCm(value: number | null) {
    this.constraintLengthCm = value;
    this.updateTarget();
  }

  /** Lock the next-wall angle (radians, 0 = +x axis CCW). null clears. */
  public setConstraintAngleRad(value: number | null) {
    this.constraintAngleRad = value;
    this.updateTarget();
  }

  /** Programmatically commit the current rubber-band wall (e.g. on input "Enter"). */
  public commitNextCorner() {
    if (this.mode !== floorplannerModes.DRAW) return;
    this.placeCornerAtTarget();
  }

  /** Force a redraw — useful when external state (units, etc.) changes. */
  public refresh() {
    this.view.draw();
  }

  // ------------------------------------------------------------ coordinate helpers

  /** Convert world (cm) X to canvas pixel X. */
  public convertX(x: number): number {
    return (x - this.originX * this.cmPerPixel) * this.pixelsPerCm;
  }

  /** Convert world (cm) Y to canvas pixel Y. */
  public convertY(y: number): number {
    return (y - this.originY * this.cmPerPixel) * this.pixelsPerCm;
  }

  // ------------------------------------------------------------ input handling

  private escapeKey() {
    if (this.mode === floorplannerModes.DRAW && this.lastNode != null) {
      // First Escape stops the current polyline; second exits draw mode.
      this.lastNode = null;
      this.constraintLengthCm = null;
      this.constraintAngleRad = null;
      this.fireDrawState();
      this.view.draw();
      return;
    }
    this.setMode(floorplannerModes.MOVE);
  }

  private mousedown(event: MouseEvent) {
    this.mouseDown = true;
    this.mouseDragged = false;
    this.lastX = this.rawMouseX;
    this.lastY = this.rawMouseY;
    this.downRawX = event.clientX;
    this.downRawY = event.clientY;

    if (this.mode === floorplannerModes.DELETE) {
      if (this.activeCorner) {
        this.activeCorner.removeAll();
      } else if (this.activeWall) {
        this.activeWall.remove();
      } else {
        this.setMode(floorplannerModes.MOVE);
      }
    }
  }

  private mousemove(event: MouseEvent) {
    this.rawMouseX = event.clientX;
    this.rawMouseY = event.clientY;

    if (this.mouseDown) {
      const dx = event.clientX - this.downRawX;
      const dy = event.clientY - this.downRawY;
      if (Math.hypot(dx, dy) > dragThresholdPx) this.mouseDragged = true;
    }

    const rect = this.canvasElement.getBoundingClientRect();
    this.mouseX = (event.clientX - rect.left) * this.cmPerPixel + this.originX * this.cmPerPixel;
    this.mouseY = (event.clientY - rect.top) * this.cmPerPixel + this.originY * this.cmPerPixel;

    if (this.mode === floorplannerModes.DRAW) {
      this.updateTarget();
    } else if (this.mode === floorplannerModes.MOVE && this.mouseDown) {
      this.updateTarget();
    }

    if (this.mode !== floorplannerModes.DRAW && !this.mouseDown) {
      const hoverCorner = this.floorplan.overlappedCorner(this.mouseX, this.mouseY);
      const hoverWall = this.floorplan.overlappedWall(this.mouseX, this.mouseY);
      let needsRedraw = false;
      if (hoverCorner !== this.activeCorner) {
        this.activeCorner = hoverCorner;
        needsRedraw = true;
      }
      if (this.activeCorner == null) {
        if (hoverWall !== this.activeWall) {
          this.activeWall = hoverWall;
          needsRedraw = true;
        }
      } else {
        this.activeWall = null;
      }
      if (needsRedraw) this.view.draw();
    }

    // Pan the canvas when dragging in MOVE mode with no active geometry.
    if (this.mouseDown && !this.activeCorner && !this.activeWall && this.mouseDragged) {
      this.originX += this.lastX - this.rawMouseX;
      this.originY += this.lastY - this.rawMouseY;
      this.lastX = this.rawMouseX;
      this.lastY = this.rawMouseY;
      this.view.draw();
    }

    if (this.mode === floorplannerModes.MOVE && this.mouseDown) {
      if (this.activeCorner) {
        this.activeCorner.move(this.mouseX, this.mouseY);
        this.activeCorner.snapToAxis(cornerSnapCm);
      } else if (this.activeWall) {
        this.activeWall.relativeMove(
          (this.rawMouseX - this.lastX) * this.cmPerPixel,
          (this.rawMouseY - this.lastY) * this.cmPerPixel
        );
        this.activeWall.snapToAxis(cornerSnapCm);
        this.lastX = this.rawMouseX;
        this.lastY = this.rawMouseY;
      }
      this.view.draw();
    }
  }

  private mouseup(_event: MouseEvent) {
    this.mouseDown = false;
    if (this.mode === floorplannerModes.DRAW && !this.mouseDragged) {
      this.placeCornerAtTarget();
    }
  }

  private mouseleave() {
    this.mouseDown = false;
  }

  // ------------------------------------------------------------ drawing logic

  /**
   * Compute the next corner position from the cursor, applying (in order):
   *   1. Constraints (locked length / angle from `lastNode`)
   *   2. Corner snap (cursor over an existing corner)
   *   3. Angle snap (Shift or `angleSnap` flag, 15° increments)
   *   4. Grid snap
   * Updates `targetX/Y` and triggers a redraw.
   */
  private updateTarget() {
    let tx = this.mouseX;
    let ty = this.mouseY;

    if (this.mode === floorplannerModes.DRAW && this.lastNode) {
      const lx = this.lastNode.x;
      const ly = this.lastNode.y;

      // 1) hard constraints win
      if (this.constraintLengthCm != null || this.constraintAngleRad != null) {
        const dx = tx - lx;
        const dy = ty - ly;
        const cursorAngle = Math.atan2(dy, dx);
        const cursorLen = Math.hypot(dx, dy);
        const angle = this.constraintAngleRad ?? cursorAngle;
        const len = this.constraintLengthCm ?? cursorLen;
        tx = lx + Math.cos(angle) * len;
        ty = ly + Math.sin(angle) * len;
      } else if (this.angleSnap || this.shiftHeld) {
        // 3) angle snap (15° increments)
        const dx = tx - lx;
        const dy = ty - ly;
        const len = Math.hypot(dx, dy);
        const step = Math.PI / 12;
        const snappedAngle = Math.round(Math.atan2(dy, dx) / step) * step;
        tx = lx + Math.cos(snappedAngle) * len;
        ty = ly + Math.sin(snappedAngle) * len;
      }
    }

    // 2) corner snap
    if (this.snapToCorners && this.mode === floorplannerModes.DRAW) {
      const candidate = this.floorplan.overlappedCorner(tx, ty, cornerSnapCm);
      if (candidate && candidate !== this.lastNode) {
        tx = candidate.x;
        ty = candidate.y;
      }
    }

    // 4) grid snap (skipped when constraints are active or we're already on a corner)
    if (this.snapToGrid && this.mode === floorplannerModes.DRAW &&
        this.constraintLengthCm == null && this.constraintAngleRad == null) {
      const onCorner = this.floorplan.overlappedCorner(tx, ty, 0.5);
      if (!onCorner) {
        tx = Math.round(tx / this.gridSizeCm) * this.gridSizeCm;
        ty = Math.round(ty / this.gridSizeCm) * this.gridSizeCm;
      }
    }

    this.targetX = tx;
    this.targetY = ty;

    this.fireDrawState();
    this.view.draw();
  }

  private placeCornerAtTarget() {
    const tx = this.targetX;
    const ty = this.targetY;

    // If we're landing on (or extremely close to) an existing corner, reuse it.
    let corner = this.floorplan.overlappedCorner(tx, ty, cornerCloseCm);
    const closing = corner != null && this.lastNode != null && corner !== this.lastNode;

    if (!corner) {
      corner = this.floorplan.newCorner(tx, ty);
    }

    if (this.lastNode != null && this.lastNode !== corner) {
      const existing = this.lastNode.wallToOrFrom(corner);
      if (!existing) {
        this.floorplan.newWall(this.lastNode, corner);
      }
    }

    // Clear constraints after each placement.
    this.constraintLengthCm = null;
    this.constraintAngleRad = null;

    if (closing) {
      // Closed back onto an existing corner — finish this polyline.
      this.lastNode = null;
    } else {
      this.lastNode = corner;
    }

    this.fireDrawState();
    this.view.draw();
  }

  private resetOrigin() {
    const centerX = this.canvasElement.clientWidth / 2.0;
    const centerY = this.canvasElement.clientHeight / 2.0;
    const centerFloorplan = this.floorplan.getCenter();
    this.originX = centerFloorplan.x * this.pixelsPerCm - centerX;
    this.originY = centerFloorplan.z * this.pixelsPerCm - centerY;
  }

  private fireDrawState() {
    let lengthCm = 0;
    let angleDeg = 0;
    let willClose = false;
    if (this.mode === floorplannerModes.DRAW && this.lastNode) {
      const dx = this.targetX - this.lastNode.x;
      const dy = this.targetY - this.lastNode.y;
      lengthCm = Math.hypot(dx, dy);
      angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const candidate = this.floorplan.overlappedCorner(this.targetX, this.targetY, cornerCloseCm);
      willClose = !!candidate && candidate !== this.lastNode;
    }
    this.drawStateCallbacks.fire({
      active: this.mode === floorplannerModes.DRAW,
      lengthCm,
      angleDeg,
      willClose,
      constraintLengthCm: this.constraintLengthCm,
      constraintAngleDeg:
        this.constraintAngleRad == null ? null : (this.constraintAngleRad * 180) / Math.PI,
    });
  }

  /** Used by the view to render distance hints from the cursor to nearby walls. */
  public nearestWallDistanceCm(): { wall: Wall; distance: number } | null {
    if (this.mode !== floorplannerModes.DRAW) return null;
    let best: { wall: Wall; distance: number } | null = null;
    for (const wall of this.floorplan.getWalls()) {
      // Skip walls connected to lastNode — distance 0 there isn't useful.
      if (this.lastNode &&
          (wall.getStart() === this.lastNode || wall.getEnd() === this.lastNode)) continue;
      const d = wall.distanceFrom(this.targetX, this.targetY);
      if (!best || d < best.distance) best = { wall, distance: d };
    }
    return best;
  }

  /** Format a length in cm using the active unit configuration. */
  public formatLength(cm: number): string {
    return Dimensioning.cmToMeasure(cm);
  }
}
