import { Dimensioning } from '../core/dimensioning';
import { Utils } from '../core/utils';
import type { Floorplan } from '../model/floorplan';
import type { HalfEdge } from '../model/half_edge';
import type { Floorplanner } from './floorplanner';

export const floorplannerModes = {
  MOVE: 0,
  DRAW: 1,
  DELETE: 2,
};

// ---- visual constants ---------------------------------------------------

const minorGridColor = 'rgba(255,255,255,0.06)';
const majorGridColor = 'rgba(255,255,255,0.14)';
const axisGridColor = 'rgba(255,255,255,0.28)';
const minorGridWidth = 1;
const majorGridWidth = 1;

const roomColor = 'rgba(255,255,255,0.07)';
const wallWidth = 5;
const wallWidthHover = 7;
const wallColor = '#e5e7eb';
const wallColorHover = '#a78bfa';
const edgeColor = 'rgba(255,255,255,0.28)';
const edgeColorHover = '#a78bfa';
const edgeWidth = 1;
const deleteColor = '#f87171';

const cornerRadius = 3;
const cornerRadiusHover = 7;
const cornerColor = '#cbd5e1';
const cornerColorHover = '#a78bfa';
const cornerColorClose = '#22c55e';

const drawGuideColor = 'rgba(167,139,250,0.95)';
const drawGuideWidth = 2;
const drawGuideDash = [6, 4];

const labelFont = '600 12px Inter, "SF Pro Display", system-ui, sans-serif';
const labelTextColor = '#ffffff';
const labelHaloColor = 'rgba(0,0,0,0.55)';

export class FloorplannerView {
  private canvasElement: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;

  constructor(
    private floorplan: Floorplan,
    private viewmodel: Floorplanner,
    private canvas: string
  ) {
    this.canvasElement = document.getElementById(canvas) as HTMLCanvasElement;
    this.context = this.canvasElement.getContext('2d')!;

    window.addEventListener('resize', () => this.handleWindowResize());
    this.handleWindowResize();
  }

  public handleWindowResize() {
    const parent = this.canvasElement.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    this.canvasElement.style.height = parent.clientHeight + 'px';
    this.canvasElement.style.width = parent.clientWidth + 'px';
    this.canvasElement.height = Math.floor(parent.clientHeight * dpr);
    this.canvasElement.width = Math.floor(parent.clientWidth * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  // ---- main draw ---------------------------------------------------------

  public draw() {
    const w = this.canvasElement.clientWidth;
    const h = this.canvasElement.clientHeight;
    this.context.clearRect(0, 0, w, h);
    this.drawGrid();

    this.floorplan.getRooms().forEach((room) => this.drawRoom(room));
    this.floorplan.getWalls().forEach((wall) => this.drawWall(wall));
    this.floorplan.getCorners().forEach((corner) => this.drawCorner(corner));

    if (this.viewmodel.mode === floorplannerModes.DRAW) {
      this.drawTarget(this.viewmodel.targetX, this.viewmodel.targetY, this.viewmodel.lastNode);
    }

    this.floorplan.getWalls().forEach((wall) => this.drawWallLabels(wall));
  }

  // ---- grid --------------------------------------------------------------

  /**
   * Draw a two-tier grid: minor lines at the configured grid size, major lines
   * every 5 cells, plus highlighted world axes through (0,0).
   */
  private drawGrid() {
    const w = this.canvasElement.clientWidth;
    const h = this.canvasElement.clientHeight;
    const cmPerPx = (this.viewmodel as any)['cmPerPixel'] as number;
    const pxPerCm = 1 / cmPerPx;

    // Minor grid in cm
    let minorCm = this.viewmodel.gridSizeCm;
    let minorPx = minorCm * pxPerCm;
    // Avoid drawing dense grids when zoomed out; double until lines are spaced ≥ 8 px.
    while (minorPx < 8) {
      minorCm *= 2;
      minorPx *= 2;
    }
    const majorCm = minorCm * 5;
    const majorPx = minorPx * 5;

    const offsetX = -this.viewmodel.originX;
    const offsetY = -this.viewmodel.originY;

    // Minor lines
    this.context.lineWidth = minorGridWidth;
    this.context.strokeStyle = minorGridColor;
    this.context.beginPath();
    for (let x = ((offsetX % minorPx) + minorPx) % minorPx; x < w; x += minorPx) {
      this.context.moveTo(Math.round(x) + 0.5, 0);
      this.context.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = ((offsetY % minorPx) + minorPx) % minorPx; y < h; y += minorPx) {
      this.context.moveTo(0, Math.round(y) + 0.5);
      this.context.lineTo(w, Math.round(y) + 0.5);
    }
    this.context.stroke();

    // Major lines
    this.context.lineWidth = majorGridWidth;
    this.context.strokeStyle = majorGridColor;
    this.context.beginPath();
    for (let x = ((offsetX % majorPx) + majorPx) % majorPx; x < w; x += majorPx) {
      this.context.moveTo(Math.round(x) + 0.5, 0);
      this.context.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = ((offsetY % majorPx) + majorPx) % majorPx; y < h; y += majorPx) {
      this.context.moveTo(0, Math.round(y) + 0.5);
      this.context.lineTo(w, Math.round(y) + 0.5);
    }
    this.context.stroke();

    // World axes through (0,0)
    const ax = this.viewmodel.convertX(0);
    const ay = this.viewmodel.convertY(0);
    this.context.strokeStyle = axisGridColor;
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.moveTo(0, ay);
    this.context.lineTo(w, ay);
    this.context.moveTo(ax, 0);
    this.context.lineTo(ax, h);
    this.context.stroke();
  }

  // ---- walls / rooms / corners ------------------------------------------

  private drawWall(wall: any) {
    const hover = wall === this.viewmodel.activeWall;
    let color = wallColor;
    if (hover && this.viewmodel.mode === floorplannerModes.DELETE) color = deleteColor;
    else if (hover) color = wallColorHover;

    this.drawLine(
      this.viewmodel.convertX(wall.getStartX()),
      this.viewmodel.convertY(wall.getStartY()),
      this.viewmodel.convertX(wall.getEndX()),
      this.viewmodel.convertY(wall.getEndY()),
      hover ? wallWidthHover : wallWidth,
      color
    );
    if (!hover && wall.frontEdge) this.drawEdge(wall.frontEdge, hover);
    if (!hover && wall.backEdge) this.drawEdge(wall.backEdge, hover);
  }

  private drawWallLabels(wall: any) {
    if (wall.backEdge && wall.frontEdge) {
      if (wall.backEdge.interiorDistance() < wall.frontEdge.interiorDistance()) {
        this.drawEdgeLabel(wall.backEdge);
      } else {
        this.drawEdgeLabel(wall.frontEdge);
      }
    } else if (wall.backEdge) {
      this.drawEdgeLabel(wall.backEdge);
    } else if (wall.frontEdge) {
      this.drawEdgeLabel(wall.frontEdge);
    } else {
      // Orphan wall (no rooms yet) — label the wall itself
      this.drawTextWithHalo(
        Dimensioning.cmToMeasure(Math.hypot(wall.getEndX() - wall.getStartX(), wall.getEndY() - wall.getStartY())),
        this.viewmodel.convertX((wall.getStartX() + wall.getEndX()) / 2),
        this.viewmodel.convertY((wall.getStartY() + wall.getEndY()) / 2)
      );
    }
  }

  private drawEdgeLabel(edge: HalfEdge) {
    const pos = edge.interiorCenter();
    const length = edge.interiorDistance();
    if (length < 60) return;
    this.drawTextWithHalo(
      Dimensioning.cmToMeasure(length),
      this.viewmodel.convertX(pos.x),
      this.viewmodel.convertY(pos.y)
    );
  }

  private drawTextWithHalo(text: string, x: number, y: number) {
    this.context.font = labelFont;
    this.context.textBaseline = 'middle';
    this.context.textAlign = 'center';
    this.context.lineWidth = 4;
    this.context.strokeStyle = labelHaloColor;
    this.context.strokeText(text, x, y);
    this.context.fillStyle = labelTextColor;
    this.context.fillText(text, x, y);
  }

  private drawEdge(edge: HalfEdge, hover: boolean) {
    let color = edgeColor;
    if (hover && this.viewmodel.mode === floorplannerModes.DELETE) color = deleteColor;
    else if (hover) color = edgeColorHover;

    const corners = edge.corners();
    this.drawPolygon(
      Utils.map(corners, (c) => this.viewmodel.convertX(c.x)),
      Utils.map(corners, (c) => this.viewmodel.convertY(c.y)),
      false, null, true, color, edgeWidth
    );
  }

  private drawRoom(room: any) {
    this.drawPolygon(
      Utils.map(room.corners, (c: any) => this.viewmodel.convertX(c.x)),
      Utils.map(room.corners, (c: any) => this.viewmodel.convertY(c.y)),
      true, roomColor
    );
  }

  private drawCorner(corner: any) {
    const hover = corner === this.viewmodel.activeCorner;
    let color = cornerColor;
    if (hover && this.viewmodel.mode === floorplannerModes.DELETE) color = deleteColor;
    else if (hover) color = cornerColorHover;
    this.drawCircle(
      this.viewmodel.convertX(corner.x),
      this.viewmodel.convertY(corner.y),
      hover ? cornerRadiusHover : cornerRadius,
      color
    );
  }

  /**
   * Draw the live "rubber band" line + label and a snap indicator at the cursor.
   * Also surfaces a perpendicular distance hint to the nearest unrelated wall.
   */
  private drawTarget(x: number, y: number, lastNode: any) {
    const px = this.viewmodel.convertX(x);
    const py = this.viewmodel.convertY(y);

    // Cursor indicator (green when it would close the polygon)
    const willClose = !!this.floorplan.overlappedCorner(x, y, 15) &&
      this.viewmodel.lastNode != null;
    this.drawCircle(px, py, cornerRadiusHover, willClose ? cornerColorClose : cornerColorHover);

    if (!lastNode) return;

    const sx = this.viewmodel.convertX(lastNode.x);
    const sy = this.viewmodel.convertY(lastNode.y);

    // Rubber-band wall
    this.context.save();
    this.context.setLineDash(drawGuideDash);
    this.drawLine(sx, sy, px, py, drawGuideWidth, drawGuideColor);
    this.context.restore();

    // Length + angle label slightly above the midpoint
    const dx = x - lastNode.x;
    const dy = y - lastNode.y;
    const len = Math.hypot(dx, dy);
    if (len > 5) {
      const midX = (sx + px) / 2;
      const midY = (sy + py) / 2;
      // Offset perpendicular so the label sits clear of the line
      const lenPx = Math.hypot(px - sx, py - sy) || 1;
      const nx = -(py - sy) / lenPx;
      const ny = (px - sx) / lenPx;
      this.drawTextWithHalo(
        `${Dimensioning.cmToMeasure(len)}  ·  ${this.formatAngle(dx, dy)}`,
        midX + nx * 14,
        midY + ny * 14
      );
    }

    // Perpendicular distance hint to the nearest non-adjacent wall
    const nearest = this.viewmodel.nearestWallDistanceCm();
    if (nearest && nearest.distance < 600) {
      const wall = nearest.wall;
      const closest = Utils.closestPointOnLine(
        x, y, wall.getStartX(), wall.getStartY(), wall.getEndX(), wall.getEndY()
      );
      const cx = this.viewmodel.convertX(closest.x);
      const cy = this.viewmodel.convertY(closest.y);
      this.context.save();
      this.context.setLineDash([3, 4]);
      this.drawLine(px, py, cx, cy, 1, 'rgba(34,197,94,0.85)');
      this.context.restore();
      this.drawTextWithHalo(
        Dimensioning.cmToMeasure(nearest.distance),
        (px + cx) / 2,
        (py + cy) / 2
      );
    }
  }

  private formatAngle(dx: number, dy: number): string {
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return `${Math.round(deg)}°`;
  }

  // ---- low-level canvas helpers -----------------------------------------

  private drawLine(startX: number, startY: number, endX: number, endY: number, width: number, color: string) {
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.lineTo(endX, endY);
    this.context.lineWidth = width;
    this.context.lineCap = 'round';
    this.context.strokeStyle = color;
    this.context.stroke();
  }

  private drawPolygon(
    xArr: number[], yArr: number[],
    fill: boolean, fillColor: any,
    stroke?: boolean, strokeColor?: any, strokeWidth?: number
  ) {
    fill = fill || false;
    stroke = stroke || false;
    this.context.beginPath();
    this.context.moveTo(xArr[0], yArr[0]);
    for (let i = 1; i < xArr.length; i++) this.context.lineTo(xArr[i], yArr[i]);
    this.context.closePath();
    if (fill) {
      this.context.fillStyle = fillColor;
      this.context.fill();
    }
    if (stroke) {
      this.context.lineWidth = strokeWidth!;
      this.context.strokeStyle = strokeColor;
      this.context.stroke();
    }
  }

  private drawCircle(centerX: number, centerY: number, radius: number, fillColor: string) {
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
    this.context.fillStyle = fillColor;
    this.context.fill();
  }
}
