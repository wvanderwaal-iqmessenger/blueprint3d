import * as THREE from 'three';
import { FloorItem } from './floor_item';
import type { Model } from '../model/model';
import type { Metadata } from './metadata';

export abstract class OnFloorItem extends FloorItem {
  constructor(
    model: Model, metadata: Metadata, geometry: THREE.BufferGeometry,
    materials: THREE.Material[], position?: THREE.Vector3,
    rotation?: number, scale?: THREE.Vector3
  ) {
    super(model, metadata, geometry, materials, position, rotation, scale);
    this.obstructFloorMoves = false;
    this.receiveShadow = true;
  }
}
