import * as THREE from 'three';
import { Utils } from '../core/utils';
import { Item } from './item';
import type { Model } from '../model/model';
import type { Metadata } from './metadata';

export abstract class FloorItem extends Item {
  constructor(
    model: Model, metadata: Metadata, geometry: THREE.BufferGeometry,
    materials: THREE.Material[], position?: THREE.Vector3,
    rotation?: number, scale?: THREE.Vector3
  ) {
    super(model, metadata, geometry, materials, position, rotation, scale);
  }

  protected resized() {}

  public placeInRoom() {
    if (!this.position_set) {
      const center = this.model.floorplan.getCenter();
      this.position.set(center.x, this.halfSize.y, center.z);
    }
  }

  public isValidPosition(vec3: THREE.Vector3): boolean {
    const corners = this.getCorners('x', 'z', vec3);
    const rooms = this.model.floorplan.getRooms();

    // check if item is in a room
    let inRoom = false;
    for (let i = 0; i < rooms.length; i++) {
      if (Utils.polygonInsidePolygon(corners, rooms[i].interiorCorners)) {
        inRoom = true;
        break;
      }
    }
    if (!inRoom) {
      return false;
    }

    // check if obstructed by other items
    if (this.obstructFloorMoves) {
      const items = this.model.scene.getItems();
      for (let i = 0; i < items.length; i++) {
        const other = items[i] as any;
        if (other === this || !other.obstructFloorMoves) continue;
        if (
          !Utils.polygonOutsidePolygon(corners, other.getCorners('x', 'z')) ||
          Utils.polygonPolygonIntersect(corners, other.getCorners('x', 'z'))
        ) {
          return false;
        }
      }
    }
    return true;
  }

  public moveToPosition(vec3: THREE.Vector3, _intersection: THREE.Intersection) {
    if (this.isValidPosition(vec3)) {
      this.hideError();
      this.position.set(vec3.x, this.halfSize.y, vec3.z);
    } else {
      this.showError(new THREE.Vector3(vec3.x, this.halfSize.y, vec3.z));
    }
  }
}
