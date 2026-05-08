import * as THREE from 'three';
import { EventEmitter } from '../core/event-emitter';
import { Utils } from '../core/utils';
import type { Floorplan } from './floorplan';
import type { Wall } from './wall';

const cornerTolerance = 20;

export class Corner {
  private wallStarts: Wall[] = [];
  private wallEnds: Wall[] = [];

  private moved_callbacks = new EventEmitter();
  private deleted_callbacks = new EventEmitter();
  private action_callbacks = new EventEmitter();

  constructor(
    private floorplan: Floorplan,
    public x: number,
    public y: number,
    public id?: string
  ) {
    this.id = id || Utils.guid();
  }

  public fireOnMove(func: () => void) { this.moved_callbacks.add(func); }
  public fireOnDelete(func: () => void) { this.deleted_callbacks.add(func); }
  public fireOnAction(func: () => void) { this.action_callbacks.add(func); }

  public getX() { return this.x; }
  public getY() { return this.y; }

  public snapToAxis(tolerance: number): { x: boolean; y: boolean } {
    // look for walls that share this corner
    const snapped = { x: false, y: false };
    const self = this;

    this.adjacentCorners().forEach(function (corner) {
      if (Math.abs(corner.x - self.x) < tolerance) {
        self.x = corner.x;
        snapped.x = true;
      }
      if (Math.abs(corner.y - self.y) < tolerance) {
        self.y = corner.y;
        snapped.y = true;
      }
    });
    return snapped;
  }

  public attachStart(wall: Wall) { this.wallStarts.push(wall); }
  public attachEnd(wall: Wall) { this.wallEnds.push(wall); }

  public detachWall(wall: Wall) {
    Utils.removeValue(this.wallStarts, wall);
    Utils.removeValue(this.wallEnds, wall);
    if (this.wallStarts.length === 0 && this.wallEnds.length === 0) {
      this.remove();
    }
  }

  public remove() {
    this.deleted_callbacks.fire();
  }

  public removeAll() {
    for (let i = this.wallStarts.length - 1; i >= 0; i--) {
      this.wallStarts[i].remove();
    }
    for (let i = this.wallEnds.length - 1; i >= 0; i--) {
      this.wallEnds[i].remove();
    }
    this.remove();
  }

  public move(newX: number, newY: number) {
    this.x = newX;
    this.y = newY;
    this.snapToAxis(cornerTolerance);
    this.moved_callbacks.fire();
  }

  public mergeWithIntersected(): boolean {
    for (let i = 0; i < this.floorplan.getCorners().length; i++) {
      const corner = this.floorplan.getCorners()[i];
      if (this.distanceFrom(corner.x, corner.y) < cornerTolerance && corner !== this) {
        this.floorplan.mergeCorners(this, corner);
        return true;
      }
    }
    return false;
  }

  public distanceFrom(x: number, y: number): number {
    return Utils.distance(this.x, this.y, x, y);
  }

  public distanceFromWall(wall: Wall): number {
    return Utils.pointDistanceFromLine(this.x, this.y, wall.getStart().x, wall.getStart().y, wall.getEnd().x, wall.getEnd().y);
  }

  public distanceFromCorner(corner: Corner): number {
    return this.distanceFrom(corner.x, corner.y);
  }

  public adjacentCorners(): Corner[] {
    const result: Corner[] = [];
    for (const wall of this.wallStarts) {
      result.push(wall.getEnd());
    }
    for (const wall of this.wallEnds) {
      result.push(wall.getStart());
    }
    return result;
  }

  public isConvex(floorplan: Floorplan): boolean {
    return true;
  }

  public wallStartsArray(): Wall[] { return this.wallStarts; }
  public wallEndsArray(): Wall[] { return this.wallEnds; }

  /** Returns the wall going from this corner TO the given corner (i.e. starts here, ends there). */
  public wallTo(corner: Corner): Wall | null {
    for (const wall of this.wallStarts) {
      if (wall.getEnd() === corner) return wall;
    }
    return null;
  }

  /** Returns the wall going FROM the given corner TO this corner (i.e. starts there, ends here). */
  public wallFrom(corner: Corner): Wall | null {
    for (const wall of this.wallEnds) {
      if (wall.getStart() === corner) return wall;
    }
    return null;
  }

  public wallToOrFrom(corner: Corner): Wall | null {
    return this.wallTo(corner) || this.wallFrom(corner);
  }
}
