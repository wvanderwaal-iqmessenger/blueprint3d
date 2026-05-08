import * as THREE from 'three';
import { EventEmitter } from '../core/event-emitter';
import { Configuration, configWallHeight, configWallThickness } from '../core/configuration';
import { Utils } from '../core/utils';
import type { Corner } from './corner';
import type { HalfEdge } from './half_edge';

const defaultWallTexture = {
  url: "rooms/textures/wallmap.png",
  stretch: true,
  scale: 0,
};

export class Wall {
  private id: string;

  public frontEdge: HalfEdge | null = null;
  public backEdge: HalfEdge | null = null;
  public orphan = false;
  public items: any[] = [];
  public onItems: any[] = [];
  public frontTexture = { ...defaultWallTexture };
  public backTexture = { ...defaultWallTexture };
  public thickness = Configuration.getNumericValue(configWallThickness);
  public height = Configuration.getNumericValue(configWallHeight);

  private moved_callbacks = new EventEmitter();
  private deleted_callbacks = new EventEmitter();
  private action_callbacks = new EventEmitter();

  constructor(private start: Corner, private end: Corner) {
    this.id = this.getUuid();
    this.start.attachStart(this);
    this.end.attachEnd(this);
  }

  private getUuid(): string {
    return [this.start.id, this.end.id].join();
  }

  public resetFrontBack() {
    this.frontEdge = null;
    this.backEdge = null;
  }

  public snapToAxis(tolerance: number) {
    this.start.snapToAxis(tolerance);
    this.end.snapToAxis(tolerance);
  }

  public fireOnMove(func: () => void) { this.moved_callbacks.add(func); }
  public fireOnDelete(func: () => void) { this.deleted_callbacks.add(func); }

  public move(startX: number, startY: number, endX: number, endY: number) {
    this.start.x = startX;
    this.start.y = startY;
    this.end.x = endX;
    this.end.y = endY;
    this.moved_callbacks.fire();
  }

  public relativeMove(dx: number, dy: number) {
    this.move(
      this.start.x + dx, this.start.y + dy,
      this.end.x + dx, this.end.y + dy
    );
  }

  public fireMoved() { this.moved_callbacks.fire(); }
  public fireAction() { this.action_callbacks.fire(); }

  public remove() {
    this.start.detachWall(this);
    this.end.detachWall(this);
    this.deleted_callbacks.fire();
  }

  public getStart(): Corner { return this.start; }
  public getEnd(): Corner { return this.end; }

  public getStartX(): number { return this.start.x; }
  public getEndX(): number { return this.end.x; }
  public getStartY(): number { return this.start.y; }
  public getEndY(): number { return this.end.y; }

  public distanceFrom(x: number, y: number): number {
    return Utils.pointDistanceFromLine(
      x, y,
      this.start.x, this.start.y,
      this.end.x, this.end.y
    );
  }

  public saveWall() {
    return {
      corner1: this.start.id,
      corner2: this.end.id,
      frontTexture: this.frontTexture,
      backTexture: this.backTexture,
    };
  }
}
