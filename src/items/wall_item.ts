import * as THREE from 'three';
import { Utils } from '../core/utils';
import { Item } from './item';
import type { Model } from '../model/model';
import type { HalfEdge } from '../model/half_edge';
import type { Metadata } from './metadata';

export abstract class WallItem extends Item {
  protected currentWallEdge: HalfEdge | null = null;
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

  protected resized() {
    if (this.currentWallEdge) {
      this.currentWallEdge.wall.fireRedraw();
    }
  }

  public removed() {
    if (this.currentWallEdge !== null) {
      if (this.addToWall) {
        Utils.removeValue(this.currentWallEdge.wall.items, this);
      } else {
        Utils.removeValue(this.currentWallEdge.wall.onItems, this);
      }
      this.currentWallEdge.wall.fireRedraw();
      this.currentWallEdge = null;
    }
  }

  /** Returns wall-plane meshes to use for drag intersection (instead of the ground plane). */
  public customIntersectionPlanes(): THREE.Object3D[] {
    return this.model.floorplan.wallEdgePlanes();
  }

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

  /**
   * Snaps vec3 onto the current wall edge:
   * - Clamps X within wall length bounds
   * - Sets Y based on floor-bound or wall-height constraints
   * - Sets Z to the wall offset (depth into wall)
   * Mutates vec3 in place.
   */
  protected boundMove(vec3: THREE.Vector3) {
    if (!this.currentWallEdge) return;
    const tolerance = 1;
    const edge = this.currentWallEdge;

    vec3.applyMatrix4(edge.interiorTransform);

    const sizeX = this.halfSize.x * 2;
    const sizeY = this.halfSize.y * 2;

    // Clamp along wall length
    if (vec3.x < sizeX / 2 + tolerance) {
      vec3.x = sizeX / 2 + tolerance;
    } else if (vec3.x > edge.interiorDistance() - sizeX / 2 - tolerance) {
      vec3.x = edge.interiorDistance() - sizeX / 2 - tolerance;
    }

    // Set height
    if (this.boundToFloor) {
      vec3.y = this.halfSize.y + 0.01;
    } else {
      if (vec3.y < sizeY / 2 + tolerance) {
        vec3.y = sizeY / 2 + tolerance;
      } else if (vec3.y > edge.height - sizeY / 2 - tolerance) {
        vec3.y = edge.height - sizeY / 2 - tolerance;
      }
    }

    // Set depth in wall
    vec3.z = this.getWallOffset();

    vec3.applyMatrix4(edge.invInteriorTransform);
  }

  public placeInRoom() {
    const closestEdge = this.closestWallEdge();
    this.changeWallEdge(closestEdge);

    if (!this.position_set && closestEdge) {
      const center = closestEdge.interiorCenter();
      const wallH = closestEdge.wall.height;
      const newPos = new THREE.Vector3(center.x, wallH / 2, center.y);
      this.boundMove(newPos);
      this.position.copy(newPos);
      closestEdge.wall.fireRedraw();
    }
  }

  protected changeWallEdge(edge: HalfEdge | null) {
    if (this.currentWallEdge !== null) {
      if (this.addToWall) {
        Utils.removeValue(this.currentWallEdge.wall.items, this);
        this.currentWallEdge.wall.fireRedraw();
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
    this.updateItemRotation();
  }

  /** Updates rotation to align with the current wall edge. Position is not touched here. */
  private updateItemRotation() {
    if (this.currentWallEdge === null) return;

    const v1 = this.currentWallEdge.wall.getStart();
    const v2 = this.currentWallEdge.wall.getEnd();
    const wallVec = new THREE.Vector2(v2.x - v1.x, v2.y - v1.y).normalize();
    const wallAngle = Math.atan2(wallVec.y, wallVec.x);
    this.rotation.y = -wallAngle;

    if (this.addToWall) {
      this.currentWallEdge.wall.fireRedraw();
    }
  }

  public isValidPosition(_vec3: THREE.Vector3): boolean {
    return true;
  }

  public moveToPosition(vec3: THREE.Vector3, intersection: THREE.Intersection) {
    // Prefer the wall edge from the intersection object (wall plane hit), fall back to nearest
    let targetEdge: HalfEdge | null = (intersection?.object as any)?.edge ?? null;

    if (!targetEdge) {
      // Fall back: nearest wall from ground intersection point
      const wallEdges = this.model.floorplan.wallEdges();
      let minDist = Infinity;
      wallEdges.forEach(edge => {
        const start = edge.wall.getStart();
        const end = edge.wall.getEnd();
        const dist = Utils.pointDistanceFromLine(vec3.x, vec3.z, start.x, start.y, end.x, end.y);
        if (dist < minDist) { minDist = dist; targetEdge = edge; }
      });
    }

    if (!targetEdge) return;

    if (this.currentWallEdge !== targetEdge) {
      this.changeWallEdge(targetEdge);
    }

    this.boundMove(vec3);
    this.position.copy(vec3);

    if (this.addToWall) {
      this.currentWallEdge!.wall.fireRedraw();
    }
  }

  /** Depth into the wall (in wall-local Z after interiorTransform). */
  public getWallOffset(): number {
    // halfSize.z = half the item depth; places item's back face flush with interior wall surface
    return this.halfSize.z;
  }

  public updateEdgeVisibility(visible: boolean, front: boolean) {
    if (front) {
      this.frontVisible = visible;
    } else {
      this.backVisible = visible;
    }
    this.visible = this.frontVisible || this.backVisible;
  }
}
