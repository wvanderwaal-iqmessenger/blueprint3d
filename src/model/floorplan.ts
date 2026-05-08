import * as THREE from 'three';
import { EventEmitter } from '../core/event-emitter';
import { Utils } from '../core/utils';
import { Wall } from './wall';
import { Corner } from './corner';
import { Room } from './room';
import { HalfEdge } from './half_edge';

const defaultFloorPlanTolerance = 10.0;

export class Floorplan {
  private walls: Wall[] = [];
  private corners: Corner[] = [];
  private rooms: Room[] = [];

  private new_wall_callbacks = new EventEmitter<(wall: Wall) => void>();
  private new_corner_callbacks = new EventEmitter<(corner: Corner) => void>();
  private redraw_callbacks = new EventEmitter<() => void>();
  private updated_rooms = new EventEmitter<() => void>();
  public roomLoadedCallbacks = new EventEmitter<() => void>();

  private floorTextures: { [uuid: string]: { url: string; scale: number } } = {};

  constructor() {}

  public wallEdges(): HalfEdge[] {
    const edges: HalfEdge[] = [];
    this.walls.forEach(wall => {
      if (wall.frontEdge) edges.push(wall.frontEdge);
      if (wall.backEdge) edges.push(wall.backEdge);
    });
    return edges;
  }

  public wallEdgePlanes(): THREE.Mesh[] {
    const planes: THREE.Mesh[] = [];
    this.walls.forEach(wall => {
      if (wall.frontEdge?.plane) planes.push(wall.frontEdge.plane);
      if (wall.backEdge?.plane) planes.push(wall.backEdge.plane);
    });
    return planes;
  }

  public floorPlanes(): THREE.Mesh[] {
    return Utils.map(this.rooms, room => room.floorPlane!).filter(Boolean) as THREE.Mesh[];
  }

  public fireOnNewWall(callback: (wall: Wall) => void) { this.new_wall_callbacks.add(callback); }
  public fireOnNewCorner(callback: (corner: Corner) => void) { this.new_corner_callbacks.add(callback); }
  public fireOnRedraw(callback: () => void) { this.redraw_callbacks.add(callback); }
  public fireOnUpdatedRooms(callback: () => void) { this.updated_rooms.add(callback); }

  public newWall(start: Corner, end: Corner): Wall {
    const wall = new Wall(start, end);
    this.walls.push(wall);
    wall.fireOnDelete(() => { this.removeWall(wall); });
    this.new_wall_callbacks.fire(wall);
    this.update();
    return wall;
  }

  private removeWall(wall: Wall) {
    Utils.removeValue(this.walls, wall);
    this.update();
  }

  public newCorner(x: number, y: number, id?: string): Corner {
    const corner = new Corner(this, x, y, id);
    this.corners.push(corner);
    corner.fireOnDelete(() => { this.removeCorner(corner); });
    this.new_corner_callbacks.fire(corner);
    return corner;
  }

  private removeCorner(corner: Corner) {
    Utils.removeValue(this.corners, corner);
  }

  public mergeCorners(a: Corner, b: Corner) {
    // reassign wall endpoints from b to a
    b.wallStartsArray().slice().forEach(wall => {
      wall.getStart(); // just reference
      // manually update: find the walls that start at b and make them start at a
    });
    // Simple merge: move b's walls to a
    a.x = (a.x + b.x) / 2;
    a.y = (a.y + b.y) / 2;
    Utils.removeValue(this.corners, b);
  }

  public getWalls(): Wall[] { return this.walls; }
  public getCorners(): Corner[] { return this.corners; }
  public getRooms(): Room[] { return this.rooms; }

  public overlappedCorner(x: number, y: number, tolerance?: number): Corner | null {
    tolerance = tolerance || defaultFloorPlanTolerance;
    for (const corner of this.corners) {
      if (corner.distanceFrom(x, y) < tolerance) return corner;
    }
    return null;
  }

  public overlappedWall(x: number, y: number, tolerance?: number): Wall | null {
    tolerance = tolerance || defaultFloorPlanTolerance;
    for (const wall of this.walls) {
      if (wall.distanceFrom(x, y) < tolerance) return wall;
    }
    return null;
  }

  public saveFloorplan() {
    const floorplan: any = {
      corners: {} as any,
      walls: [] as any[],
      wallTextures: [],
      floorTextures: {},
      newFloorTextures: {},
    };
    this.corners.forEach(corner => {
      floorplan.corners[corner.id!] = { x: corner.x, y: corner.y };
    });
    this.walls.forEach(wall => {
      floorplan.walls.push({
        corner1: wall.getStart().id,
        corner2: wall.getEnd().id,
        frontTexture: wall.frontTexture,
        backTexture: wall.backTexture,
      });
    });
    floorplan.newFloorTextures = this.floorTextures;
    return floorplan;
  }

  public loadFloorplan(floorplan: any) {
    this.reset();
    if (!floorplan || !('corners' in floorplan) || !('walls' in floorplan)) return;

    const corners: { [id: string]: Corner } = {};
    for (const id in floorplan.corners) {
      const corner = floorplan.corners[id];
      corners[id] = this.newCorner(corner.x, corner.y, id);
    }
    floorplan.walls.forEach((wall: any) => {
      const newWall = this.newWall(corners[wall.corner1], corners[wall.corner2]);
      if (wall.frontTexture) newWall.frontTexture = wall.frontTexture;
      if (wall.backTexture) newWall.backTexture = wall.backTexture;
    });
    if ('newFloorTextures' in floorplan) {
      this.floorTextures = floorplan.newFloorTextures;
    }
    this.update();
    this.roomLoadedCallbacks.fire();
  }

  public getFloorTexture(uuid: string) {
    return uuid in this.floorTextures ? this.floorTextures[uuid] : null;
  }

  public setFloorTexture(uuid: string, url: string, scale: number) {
    this.floorTextures[uuid] = { url, scale };
  }

  private updateFloorTextures() {
    const uuids = Utils.map(this.rooms, (room: any) => room.getUuid?.() ?? '');
    for (const uuid in this.floorTextures) {
      if (!Utils.hasValue(uuids, uuid)) delete this.floorTextures[uuid];
    }
  }

  private reset() {
    const tmpCorners = this.corners.slice(0);
    const tmpWalls = this.walls.slice(0);
    tmpCorners.forEach(c => c.remove());
    tmpWalls.forEach(w => w.remove());
    this.corners = [];
    this.walls = [];
  }

  public update() {
    this.walls.forEach(wall => wall.resetFrontBack());
    const roomCorners = this.findRooms(this.corners);
    this.rooms = [];
    roomCorners.forEach(corners => {
      this.rooms.push(new Room(this, corners));
    });
    this.assignOrphanEdges();
    this.updateFloorTextures();
    this.updated_rooms.fire();
  }

  public getCenter(): THREE.Vector3 {
    return this.getDimensions(true);
  }

  public getSize(): THREE.Vector3 {
    return this.getDimensions(false);
  }

  public getDimensions(center: boolean): THREE.Vector3 {
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    this.corners.forEach(corner => {
      if (corner.x < xMin) xMin = corner.x;
      if (corner.x > xMax) xMax = corner.x;
      if (corner.y < zMin) zMin = corner.y;
      if (corner.y > zMax) zMax = corner.y;
    });
    if (xMin === Infinity || xMax === -Infinity || zMin === Infinity || zMax === -Infinity) {
      return new THREE.Vector3();
    }
    if (center) {
      return new THREE.Vector3((xMin + xMax) * 0.5, 0, (zMin + zMax) * 0.5);
    } else {
      return new THREE.Vector3(xMax - xMin, 0, zMax - zMin);
    }
  }

  private assignOrphanEdges() {
    this.walls.forEach(wall => {
      if (!wall.backEdge && !wall.frontEdge) {
        wall.orphan = true;
        const back = new HalfEdge(null as any, wall, false);
        back.generatePlane();
        const front = new HalfEdge(null as any, wall, true);
        front.generatePlane();
      }
    });
  }

  public findRooms(corners: Corner[]): Corner[][] {
    const calculateTheta = (prev: Corner, cur: Corner, next: Corner) =>
      Utils.angle2pi(prev.x - cur.x, prev.y - cur.y, next.x - cur.x, next.y - cur.y);

    const removeDuplicateRooms = (roomArray: Corner[][]): Corner[][] => {
      const results: Corner[][] = [];
      const lookup: { [key: string]: boolean } = {};
      const sep = '-';
      for (const room of roomArray) {
        let add = true;
        for (let j = 0; j < room.length; j++) {
          const roomShift = Utils.cycle(room, j);
          const str = roomShift.map(c => c.id).join(sep);
          if (lookup[str]) { add = false; break; }
        }
        if (add) {
          results.push(room);
          const str = room.map(c => c.id).join(sep);
          lookup[str] = true;
        }
      }
      return results;
    };

    const findTightestCycle = (firstCorner: Corner, secondCorner: Corner): Corner[] => {
      const stack: { corner: Corner; previousCorners: Corner[] }[] = [];
      let next: { corner: Corner; previousCorners: Corner[] } | undefined = {
        corner: secondCorner,
        previousCorners: [firstCorner],
      };
      const visited: { [id: string]: boolean } = {};
      visited[firstCorner.id!] = true;

      while (next) {
        const currentCorner = next.corner;
        visited[currentCorner.id!] = true;

        if (next.corner === firstCorner && currentCorner !== secondCorner) {
          return next.previousCorners;
        }

        const addToStack: Corner[] = [];
        for (const nextCorner of next.corner.adjacentCorners()) {
          if (nextCorner.id! in visited &&
            !(nextCorner === firstCorner && currentCorner !== secondCorner)) {
            continue;
          }
          addToStack.push(nextCorner);
        }

        const previousCorners = [...next.previousCorners, currentCorner];
        if (addToStack.length > 1) {
          const previousCorner = next.previousCorners[next.previousCorners.length - 1];
          addToStack.sort((a, b) =>
            calculateTheta(previousCorner, currentCorner, b) -
            calculateTheta(previousCorner, currentCorner, a)
          );
        }
        for (const corner of addToStack) {
          stack.push({ corner, previousCorners });
        }
        next = stack.pop();
      }
      return [];
    };

    const loops: Corner[][] = [];
    corners.forEach(firstCorner => {
      firstCorner.adjacentCorners().forEach(secondCorner => {
        loops.push(findTightestCycle(firstCorner, secondCorner));
      });
    });

    const uniqueLoops = removeDuplicateRooms(loops);
    return Utils.removeIf(uniqueLoops, Utils.isClockwise as any);
  }
}
