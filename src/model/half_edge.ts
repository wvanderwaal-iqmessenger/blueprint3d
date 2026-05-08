import * as THREE from 'three';
import { EventEmitter } from '../core/event-emitter';
import { Utils } from '../core/utils';
import type { Room } from './room';
import type { Wall } from './wall';

export class HalfEdge {
  public next: HalfEdge | null = null;
  public prev: HalfEdge | null = null;
  public offset: number;
  public height: number;
  public plane: THREE.Mesh | null = null;
  public interiorTransform = new THREE.Matrix4();
  public invInteriorTransform = new THREE.Matrix4();
  public exteriorTransform = new THREE.Matrix4();
  public invExteriorTransform = new THREE.Matrix4();
  public redrawCallbacks = new EventEmitter();

  constructor(
    private room: Room | null,
    public wall: Wall,
    private front: boolean
  ) {
    this.front = front || false;
    this.offset = wall.thickness / 2.0;
    this.height = wall.height;
    if (this.front) {
      this.wall.frontEdge = this;
    } else {
      this.wall.backEdge = this;
    }
  }

  private getStart(): { x: number; y: number } {
    return this.front ? this.wall.getStart() : this.wall.getEnd();
  }

  private getEnd(): { x: number; y: number } {
    return this.front ? this.wall.getEnd() : this.wall.getStart();
  }

  private getOppositeEdge(): HalfEdge | null {
    return this.front ? this.wall.backEdge : this.wall.frontEdge;
  }

  private halfAngleVector(v1: HalfEdge | null, v2: HalfEdge | null): { x: number; y: number } {
    let v1startX: number, v1startY: number, v1endX: number, v1endY: number;
    let v2startX: number, v2startY: number, v2endX: number, v2endY: number;

    if (!v1) {
      v1startX = v2!.getStart().x - (v2!.getEnd().x - v2!.getStart().x);
      v1startY = v2!.getStart().y - (v2!.getEnd().y - v2!.getStart().y);
      v1endX = v2!.getStart().x;
      v1endY = v2!.getStart().y;
    } else {
      v1startX = v1.getStart().x;
      v1startY = v1.getStart().y;
      v1endX = v1.getEnd().x;
      v1endY = v1.getEnd().y;
    }

    if (!v2) {
      v2startX = v1!.getEnd().x;
      v2startY = v1!.getEnd().y;
      v2endX = v1!.getEnd().x + (v1!.getEnd().x - v1!.getStart().x);
      v2endY = v1!.getEnd().y + (v1!.getEnd().y - v1!.getStart().y);
    } else {
      v2startX = v2.getStart().x;
      v2startY = v2.getStart().y;
      v2endX = v2.getEnd().x;
      v2endY = v2.getEnd().y;
    }

    const theta = Utils.angle2pi(
      v1startX - v1endX, v1startY - v1endY,
      v2endX - v1endX, v2endY - v1endY
    );

    const cs = Math.cos(theta / 2.0);
    const sn = Math.sin(theta / 2.0);

    const v2dx = v2endX - v2startX;
    const v2dy = v2endY - v2startY;

    const vx = v2dx * cs - v2dy * sn;
    const vy = v2dx * sn + v2dy * cs;

    const mag = Utils.distance(0, 0, vx, vy);
    const desiredMag = this.offset / sn;
    const scalar = desiredMag / mag;

    return { x: vx * scalar, y: vy * scalar };
  }

  public interiorStart(): { x: number; y: number } {
    const vec = this.halfAngleVector(this.prev, this);
    return { x: this.getStart().x + vec.x, y: this.getStart().y + vec.y };
  }

  public interiorEnd(): { x: number; y: number } {
    const vec = this.halfAngleVector(this, this.next);
    return { x: this.getEnd().x + vec.x, y: this.getEnd().y + vec.y };
  }

  public interiorCenter(): { x: number; y: number } {
    return {
      x: (this.interiorStart().x + this.interiorEnd().x) / 2.0,
      y: (this.interiorStart().y + this.interiorEnd().y) / 2.0,
    };
  }

  public exteriorStart(): { x: number; y: number } {
    const vec = this.halfAngleVector(this.prev, this);
    return { x: this.getStart().x - vec.x, y: this.getStart().y - vec.y };
  }

  public exteriorEnd(): { x: number; y: number } {
    const vec = this.halfAngleVector(this, this.next);
    return { x: this.getEnd().x - vec.x, y: this.getEnd().y - vec.y };
  }

  public corners(): { x: number; y: number }[] {
    return [this.interiorStart(), this.interiorEnd(), this.exteriorEnd(), this.exteriorStart()];
  }

  public getTexture() {
    return this.front ? this.wall.frontTexture : this.wall.backTexture;
  }

  public setTexture(textureUrl: string, textureStretch: boolean, textureScale: number) {
    const texture = { url: textureUrl, stretch: textureStretch, scale: textureScale };
    if (this.front) {
      this.wall.frontTexture = texture;
    } else {
      this.wall.backTexture = texture;
    }
    this.redrawCallbacks.fire();
  }

  public interiorDistance(): number {
    const start = this.interiorStart();
    const end = this.interiorEnd();
    return Utils.distance(start.x, start.y, end.x, end.y);
  }

  public generatePlane() {
    const is = this.interiorStart();
    const ie = this.interiorEnd();
    const v1 = new THREE.Vector3(is.x, 0, is.y);
    const v2 = new THREE.Vector3(ie.x, 0, ie.y);
    const v3 = v2.clone(); v3.y = this.height;
    const v4 = v1.clone(); v4.y = this.height;

    const geometry = new THREE.BufferGeometry().setFromPoints([v1, v2, v3, v4]);
    // Create triangles from the 4 points
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, visible: false });
    const mesh = new THREE.Mesh(geometry, material);
    (mesh as any).edge = this;
    this.plane = mesh;

    this.computeTransforms(
      this.interiorTransform, this.invInteriorTransform,
      this.interiorStart(), this.interiorEnd()
    );
    this.computeTransforms(
      this.exteriorTransform, this.invExteriorTransform,
      this.exteriorStart(), this.exteriorEnd()
    );
  }

  private computeTransforms(
    transform: THREE.Matrix4,
    invTransform: THREE.Matrix4,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) {
    const angle = Utils.angle(1, 0, end.x - start.x, end.y - start.y);

    const tt = new THREE.Matrix4().makeTranslation(-start.x, 0, -start.y);
    const tr = new THREE.Matrix4().makeRotationY(-angle);

    transform.multiplyMatrices(tr, tt);
    invTransform.copy(transform).invert();
  }
}
