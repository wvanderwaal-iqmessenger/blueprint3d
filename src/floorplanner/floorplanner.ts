import { EventEmitter } from '../core/event-emitter';
import type { Floorplan } from '../model/floorplan';
import { FloorplannerView, floorplannerModes } from './floorplanner_view';

export { floorplannerModes };

const snapTolerance = 25;

export class Floorplanner {
  public mode = 0;
  public activeWall: any = null;
  public activeCorner: any = null;
  public originX = 0;
  public originY = 0;
  public targetX = 0;
  public targetY = 0;
  public lastNode: any = null;

  public modeResetCallbacks = new EventEmitter<(mode: number) => void>();

  private wallWidth: number;
  private canvasElement: HTMLCanvasElement;
  private view: FloorplannerView;
  private mouseDown = false;
  private mouseMoved = false;
  private mouseX = 0;
  private mouseY = 0;
  private rawMouseX = 0;
  private rawMouseY = 0;
  private lastX = 0;
  private lastY = 0;
  private cmPerPixel: number;
  private pixelsPerCm: number;

  constructor(canvas: string, private floorplan: Floorplan) {
    this.canvasElement = document.getElementById(canvas) as HTMLCanvasElement;
    this.view = new FloorplannerView(this.floorplan, this, canvas);

    const cmPerFoot = 30.48;
    const pixelsPerFoot = 15.0;
    this.cmPerPixel = cmPerFoot * (1.0 / pixelsPerFoot);
    this.pixelsPerCm = 1.0 / this.cmPerPixel;

    this.wallWidth = 10.0 * this.pixelsPerCm;

    this.setMode(floorplannerModes.MOVE);

    this.canvasElement.addEventListener('mousedown', () => this.mousedown());
    this.canvasElement.addEventListener('mousemove', (event) => this.mousemove(event));
    this.canvasElement.addEventListener('mouseup', () => this.mouseup());
    this.canvasElement.addEventListener('mouseleave', () => this.mouseleave());

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Escape') this.escapeKey();
    });

    floorplan.roomLoadedCallbacks.add(() => this.reset());
  }

  private escapeKey() {
    this.setMode(floorplannerModes.MOVE);
  }

  private updateTarget() {
    if (this.mode === floorplannerModes.DRAW && this.lastNode) {
      this.targetX = Math.abs(this.mouseX - this.lastNode.x) < snapTolerance ? this.lastNode.x : this.mouseX;
      this.targetY = Math.abs(this.mouseY - this.lastNode.y) < snapTolerance ? this.lastNode.y : this.mouseY;
    } else {
      this.targetX = this.mouseX;
      this.targetY = this.mouseY;
    }
    this.view.draw();
  }

  private mousedown() {
    this.mouseDown = true;
    this.mouseMoved = false;
    this.lastX = this.rawMouseX;
    this.lastY = this.rawMouseY;

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
    this.mouseMoved = true;
    this.rawMouseX = event.clientX;
    this.rawMouseY = event.clientY;

    const rect = this.canvasElement.getBoundingClientRect();
    this.mouseX = (event.clientX - rect.left) * this.cmPerPixel + this.originX * this.cmPerPixel;
    this.mouseY = (event.clientY - rect.top) * this.cmPerPixel + this.originY * this.cmPerPixel;

    if (this.mode === floorplannerModes.DRAW || (this.mode === floorplannerModes.MOVE && this.mouseDown)) {
      this.updateTarget();
    }

    if (this.mode !== floorplannerModes.DRAW && !this.mouseDown) {
      const hoverCorner = this.floorplan.overlappedCorner(this.mouseX, this.mouseY);
      const hoverWall = this.floorplan.overlappedWall(this.mouseX, this.mouseY);
      let draw = false;
      if (hoverCorner !== this.activeCorner) {
        this.activeCorner = hoverCorner;
        draw = true;
      }
      if (this.activeCorner == null) {
        if (hoverWall !== this.activeWall) {
          this.activeWall = hoverWall;
          draw = true;
        }
      } else {
        this.activeWall = null;
      }
      if (draw) this.view.draw();
    }

    if (this.mouseDown && !this.activeCorner && !this.activeWall) {
      this.originX += this.lastX - this.rawMouseX;
      this.originY += this.lastY - this.rawMouseY;
      this.lastX = this.rawMouseX;
      this.lastY = this.rawMouseY;
      this.view.draw();
    }

    if (this.mode === floorplannerModes.MOVE && this.mouseDown) {
      if (this.activeCorner) {
        this.activeCorner.move(this.mouseX, this.mouseY);
        this.activeCorner.snapToAxis(snapTolerance);
      } else if (this.activeWall) {
        this.activeWall.relativeMove(
          (this.rawMouseX - this.lastX) * this.cmPerPixel,
          (this.rawMouseY - this.lastY) * this.cmPerPixel
        );
        this.activeWall.snapToAxis(snapTolerance);
        this.lastX = this.rawMouseX;
        this.lastY = this.rawMouseY;
      }
      this.view.draw();
    }
  }

  private mouseup() {
    this.mouseDown = false;
    if (this.mode === floorplannerModes.DRAW && !this.mouseMoved) {
      const corner = this.floorplan.newCorner(this.targetX, this.targetY);
      if (this.lastNode != null) {
        this.floorplan.newWall(this.lastNode, corner);
      }
      if (corner.mergeWithIntersected() && this.lastNode != null) {
        this.setMode(floorplannerModes.MOVE);
      }
      this.lastNode = corner;
    }
  }

  private mouseleave() {
    this.mouseDown = false;
  }

  private reset() {
    this.resizeView();
    this.setMode(floorplannerModes.MOVE);
    this.resetOrigin();
    this.view.draw();
  }

  private resizeView() {
    this.view.handleWindowResize();
  }

  private setMode(mode: number) {
    this.lastNode = null;
    this.mode = mode;
    this.modeResetCallbacks.fire(mode);
    this.updateTarget();
  }

  private resetOrigin() {
    const centerX = this.canvasElement.clientWidth / 2.0;
    const centerY = this.canvasElement.clientHeight / 2.0;
    const centerFloorplan = this.floorplan.getCenter();
    this.originX = centerFloorplan.x * this.pixelsPerCm - centerX;
    this.originY = centerFloorplan.z * this.pixelsPerCm - centerY;
  }

  public convertX(x: number): number {
    return (x - this.originX * this.cmPerPixel) * this.pixelsPerCm;
  }

  public convertY(y: number): number {
    return (y - this.originY * this.cmPerPixel) * this.pixelsPerCm;
  }
}
