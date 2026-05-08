import * as THREE from 'three';
import { Utils } from '../core/utils';
import { Item } from './item';
import type { Model } from '../model/model';
import type { HalfEdge } from '../model/half_edge';
import type { Metadata } from './metadata';

export abstract class WallItem extends Item {
  protected currentWallEdge: HalfEdge | null = null;
  private refVec = new THREE.Vector2(0, 1.0);
  private wallOffsetScalar = 0;
  private sizeX = 0;
  private sizeY = 0;
  protected addToWall = false;
  protected boundToFloor = false;
  protected frontVisible = false;
  protected backVisible = false;

  constructor(
    model: Model, metadata: Metadata, geometry: THREE.BufferGeometry,
    materials: THREE.Material[], position?: THREE.Vector3,
    rotation?: number, scale?: THREE.Vector3
  ) {
    super(model, metadata, geometry, materials, position, rotation, scale);
    this.allowRotate = false;
  }

  protected resized() {}

  public closestWallEdge(): HalfEdge | null {
    const wallEdges = this.model.floorplan.wallEdges();
    let wallEdge: HalfEdge | null = null;
    let minDistance: number | null = null;

    const itemX = this.position.x;
    const itemZ = this.position.z;

    wallEdges.forEach(edge => {
      const start = edge.wall.getStart();
      const end = edge.wall.getEnd();
      const dist = Utils.pointDistanceFromLine(itemX, itemZ, start.x, start.y, end.x, end.y);
      if (minDistance === null || dist < minDistance) {
        minDistance = dist;
        wallEdge = edge;
      }
    });
    return wallEdge;
  }

  public placeInRoom() {
    const closestEdge = this.closestWallEdge();
    this.changeWallEdge(closestEdge);
    this.updateItemPosition();
  }

  protected changeWallEdge(edge: HalfEdge | null) {
    if (this.currentWallEdge !== null) {
      // remove from current wall
      if (this.addToWall) {
        Utils.removeValue(this.currentWallEdge.wall.items, this);
      } else {
        Utils.removeValue(this.currentWallEdge.wall.onItems, this);
      }
    }
    this.currentWallEdge = edge;
    if (edge !== null) {
      if (this.addToWall) {
        edge.wall.items.push(this);
      } else {
        edge.wall.onItems.push(this);
      }
    }
    this.updateItemPosition();
  }

  private updateItemPosition() {
    if (this.currentWallEdge === null) return;

    const v1 = this.currentWallEdge.wall.getStart();
    const v2 = this.currentWallEdge.wall.getEnd();
    const wallVec = new THREE.Vector2(v2.x - v1.x, v2.y - v1.y).normalize();
    const wallAngle = Math.atan2(wallVec.y, wallVec.x);

    const offset = this.currentWallEdge.offset;
    const wallDir = new THREE.Vector2(v2.x - v1.x, v2.y - v1.y).normalize();
    const normal = new THREE.Vector2(-wallDir.y, wallDir.x);

    this.rotation.y = -wallAngle + Math.PI / 2;

    if (this.boundToFloor) {
      this.position.y = 0;
    } else {
      this.position.y = this.getHeight() / 2.0;
    }
  }

  public isValidPosition(vec3: THREE.Vector3): boolean {
    return true;
  }

  public moveToPosition(vec3: THREE.Vector3, intersection: THREE.Intersection) {
    const wallEdges = this.model.floorplan.wallEdges();
    if (wallEdges.length === 0) return;

    let closestEdge: HalfEdge | null = null;
    let minDist = Infinity;
    wallEdges.forEach(edge => {
      const start = edge.wall.getStart();
      const end = edge.wall.getEnd();
      const dist = Utils.pointDistanceFromLine(vec3.x, vec3.z, start.x, start.y, end.x, end.y);
      if (dist < minDist) { minDist = dist; closestEdge = edge; }
    });

    if (this.currentWallEdge !== closestEdge) {
      this.changeWallEdge(closestEdge);
    }

    if (closestEdge) {
      const start = (closestEdge as HalfEdge).wall.getStart();
      const end = (closestEdge as HalfEdge).wall.getEnd();
      const closest = Utils.closestPointOnLine(vec3.x, vec3.z, start.x, start.y, end.x, end.y);
      this.position.set(closest.x, this.position.y, closest.y);
    }
  }

  public getWallOffset(): number {
    return this.currentWallEdge ? this.currentWallEdge.offset : 0;
  }
}
