import * as THREE from 'three';
import { Floor } from './floor';
import { Edge } from './edge';

export class ThreeFloorplan {
  public floors: Floor[] = [];
  public edges: Edge[] = [];

  constructor(
    private scene: THREE.Scene,
    public floorplan: any,
    private controls: any
  ) {
    floorplan.fireOnUpdatedRooms(() => this.redraw());
  }

  private redraw() {
    this.floors.forEach((floor) => floor.removeFromScene());
    this.edges.forEach((edge) => edge.remove());
    this.floors = [];
    this.edges = [];

    this.floorplan.getRooms().forEach((room: any) => {
      const threeFloor = new Floor(this.scene, room);
      this.floors.push(threeFloor);
      threeFloor.addToScene();
    });

    this.floorplan.wallEdges().forEach((edge: any) => {
      const threeEdge = new Edge(this.scene, edge, this.controls);
      this.edges.push(threeEdge);
    });
  }
}
