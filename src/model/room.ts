import * as THREE from 'three';
import { EventEmitter } from '../core/event-emitter';
import { HalfEdge } from './half_edge';
import { Utils } from '../core/utils';
import type { Corner } from './corner';
import type { Floorplan } from './floorplan';

const defaultRoomTexture = {
  url: "rooms/textures/hardwood.png",
  scale: 400,
};

export class Room {
  public interiorCorners: Corner[] = [];
  private edgePointer: HalfEdge | null = null;
  public floorPlane: THREE.Mesh | null = null;
  private customTexture = false;
  private floorChangeCallbacks = new EventEmitter();

  constructor(private floorplan: Floorplan, public corners: Corner[]) {
    this.updateWalls();
    this.updateInteriorCorners();
    this.generatePlane();
  }

  private getUuid(): string {
    const cornerUuids = Utils.map(this.corners, c => c.id!);
    cornerUuids.sort();
    return cornerUuids.join();
  }

  public fireOnFloorChange(callback: () => void) {
    this.floorChangeCallbacks.add(callback);
  }

  public getTexture() {
    const uuid = this.getUuid();
    const tex = this.floorplan.getFloorTexture(uuid);
    return tex || defaultRoomTexture;
  }

  public setTexture(textureUrl: string, textureStretch: any, textureScale: number) {
    const uuid = this.getUuid();
    this.floorplan.setFloorTexture(uuid, textureUrl, textureScale);
    this.floorChangeCallbacks.fire();
  }

  private generatePlane() {
    const points: THREE.Vector2[] = [];
    this.interiorCorners.forEach(corner => {
      points.push(new THREE.Vector2(corner.x, corner.y));
    });
    const shape = new THREE.Shape(points);
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      visible: false,
    });
    this.floorPlane = new THREE.Mesh(geometry, material);
    this.floorPlane.rotation.set(Math.PI / 2, 0, 0);
    (this.floorPlane as any).room = this;
  }

  /**
   * Builds the doubly-connected edge list (DCEL) for this room.
   * Creates one HalfEdge per wall, links prev/next, and stores the first edge.
   */
  private updateWalls() {
    let prevEdge: HalfEdge | null = null;
    let firstEdge: HalfEdge | null = null;

    for (let i = 0; i < this.corners.length; i++) {
      const firstCorner = this.corners[i];
      const secondCorner = this.corners[(i + 1) % this.corners.length];

      const wallTo = firstCorner.wallTo(secondCorner);
      const wallFrom = firstCorner.wallFrom(secondCorner);

      let edge: HalfEdge;
      if (wallTo) {
        edge = new HalfEdge(this, wallTo, true);
      } else if (wallFrom) {
        edge = new HalfEdge(this, wallFrom, false);
      } else {
        console.warn('Room: corners not connected by a wall');
        continue;
      }

      if (i === 0) {
        firstEdge = edge;
      } else {
        edge.prev = prevEdge;
        prevEdge!.next = edge;
        if (i + 1 === this.corners.length) {
          firstEdge!.prev = edge;
          edge.next = firstEdge;
        }
      }
      prevEdge = edge;
    }

    this.edgePointer = firstEdge;
  }

  private updateInteriorCorners() {
    const edge = this.edgePointer;
    if (!edge) {
      this.interiorCorners = this.corners.slice();
      return;
    }
    this.interiorCorners = [];
    let current: HalfEdge = edge;
    while (true) {
      this.interiorCorners.push(current.interiorStart() as any);
      current.generatePlane();
      if (current.next === edge) break;
      current = current.next!;
    }
  }
}
