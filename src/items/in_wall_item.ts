import * as THREE from 'three';
import { WallItem } from './wall_item';
import type { Model } from '../model/model';
import type { Metadata } from './metadata';

export abstract class InWallItem extends WallItem {
  constructor(
    model: Model, metadata: Metadata, geometry: THREE.BufferGeometry,
    materials: THREE.Material[], position?: THREE.Vector3,
    rotation?: number, scale?: THREE.Vector3
  ) {
    super(model, metadata, geometry, materials, position, rotation, scale);
    this.addToWall = true;
  }

  /**
   * Slight negative offset from interior surface so closestWallEdge()
   * always resolves to the same (interior) half-edge after save/reload.
   */
  public getWallOffset(): number {
    return this.currentWallEdge ? -this.currentWallEdge.offset + 0.5 : 0;
  }
}

