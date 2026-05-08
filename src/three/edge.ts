import * as THREE from 'three';
import { HalfEdge } from '../model/half_edge';
import { Utils } from '../core/utils';

const lightMap = new THREE.TextureLoader().load('rooms/textures/walllightmap.png');
const fillerColor = 0xdddddd;
const sideColor = 0xcccccc;
const baseColor = 0xdddddd;

export class Edge {
  public visible = false;

  private planes: THREE.Mesh[] = [];
  private basePlanes: THREE.Mesh[] = [];
  private texture: THREE.Texture | null = null;

  private threeScene: THREE.Scene;
  private edge: HalfEdge;
  private controls: any;
  private wall: any;
  private front: boolean;

  // Bound references so remove() can unregister them
  private boundRedraw = () => this.redraw();
  private boundUpdateVisibility = () => this.updateVisibility();

  constructor(scene: THREE.Scene, edge: HalfEdge, controls: any) {
    this.threeScene = scene;
    this.edge = edge;
    this.controls = controls;
    this.wall = edge.wall;
    this.front = (edge as any).front;

    this.init();
  }

  public remove() {
    this.edge.redrawCallbacks.remove(this.boundRedraw);
    this.controls.cameraMovedCallbacks.remove(this.boundUpdateVisibility);
    this.removeFromScene();
  }

  private init() {
    this.edge.redrawCallbacks.add(this.boundRedraw);
    this.controls.cameraMovedCallbacks.add(this.boundUpdateVisibility);
    this.updateTexture();
    this.updatePlanes();
    this.addToScene();
  }

  private redraw() {
    this.removeFromScene();
    this.updateTexture();
    this.updatePlanes();
    this.addToScene();
  }

  private removeFromScene() {
    this.planes.forEach((plane) => this.threeScene.remove(plane));
    this.basePlanes.forEach((plane) => this.threeScene.remove(plane));
    this.planes = [];
    this.basePlanes = [];
  }

  private addToScene() {
    this.planes.forEach((plane) => this.threeScene.add(plane));
    this.basePlanes.forEach((plane) => this.threeScene.add(plane));
    this.updateVisibility();
  }

  private updateVisibility() {
    const start = this.edge.interiorStart();
    const end = this.edge.interiorEnd();
    const x = end.x - start.x;
    const y = end.y - start.y;
    const normal = new THREE.Vector3(-y, 0, x).normalize();

    const position = this.controls.object.position.clone();
    const focus = new THREE.Vector3(
      (start.x + end.x) / 2.0,
      0,
      (start.y + end.y) / 2.0
    );
    const direction = position.sub(focus).normalize();

    const dot = normal.dot(direction);
    this.visible = dot >= 0;

    this.planes.forEach((plane) => { plane.visible = this.visible; });
    this.updateObjectVisibility();
  }

  private updateObjectVisibility() {
    this.wall.items.forEach((item: any) => {
      item.updateEdgeVisibility(this.visible, this.front);
    });
    this.wall.onItems.forEach((item: any) => {
      item.updateEdgeVisibility(this.visible, this.front);
    });
  }

  private updateTexture(callback?: () => void) {
    callback = callback || (() => { (this.threeScene as any).needsUpdate = true; });
    const textureData = this.edge.getTexture();
    const stretch = textureData.stretch;
    const url = textureData.url;
    const scale = textureData.scale;

    this.texture = new THREE.TextureLoader().load(url, callback);
    if (!stretch) {
      const height = this.wall.height;
      const width = this.edge.interiorDistance();
      this.texture.wrapT = THREE.RepeatWrapping;
      this.texture.wrapS = THREE.RepeatWrapping;
      this.texture.repeat.set(width / scale, height / scale);
      this.texture.needsUpdate = true;
    }
  }

  private updatePlanes() {
    const wallMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.FrontSide,
      map: this.texture!,
    });

    const fillerMaterial = new THREE.MeshBasicMaterial({
      color: fillerColor,
      side: THREE.DoubleSide,
    });

    this.planes.push(this.makeWall(
      this.edge.exteriorStart(), this.edge.exteriorEnd(),
      this.edge.exteriorTransform, this.edge.invExteriorTransform,
      fillerMaterial
    ));

    this.planes.push(this.makeWall(
      this.edge.interiorStart(), this.edge.interiorEnd(),
      this.edge.interiorTransform, this.edge.invInteriorTransform,
      wallMaterial
    ));

    this.basePlanes.push(this.buildFiller(this.edge, 0, THREE.BackSide, baseColor));
    this.planes.push(this.buildFiller(this.edge, this.wall.height, THREE.DoubleSide, fillerColor));

    this.planes.push(this.buildSideFiller(
      this.edge.interiorStart(), this.edge.exteriorStart(), this.wall.height, sideColor
    ));
    this.planes.push(this.buildSideFiller(
      this.edge.interiorEnd(), this.edge.exteriorEnd(), this.wall.height, sideColor
    ));
  }

  private makeWall(
    start: { x: number; y: number },
    end: { x: number; y: number },
    transform: THREE.Matrix4,
    invTransform: THREE.Matrix4,
    material: THREE.Material
  ): THREE.Mesh {
    const v1 = this.toVec3(start);
    const v2 = this.toVec3(end);
    const v3 = v2.clone(); v3.y = this.wall.height;
    const v4 = v1.clone(); v4.y = this.wall.height;

    const points = [v1.clone(), v2.clone(), v3.clone(), v4.clone()];
    points.forEach((p) => p.applyMatrix4(transform));

    const shape = new THREE.Shape([
      new THREE.Vector2(points[0].x, points[0].y),
      new THREE.Vector2(points[1].x, points[1].y),
      new THREE.Vector2(points[2].x, points[2].y),
      new THREE.Vector2(points[3].x, points[3].y),
    ]);

    this.wall.items.forEach((item: any) => {
      const pos = item.position.clone();
      pos.applyMatrix4(transform);
      const halfSize = item.halfSize;
      const min = halfSize.clone().multiplyScalar(-1).add(pos);
      const max = halfSize.clone().add(pos);

      shape.holes.push(new THREE.Path([
        new THREE.Vector2(min.x, min.y),
        new THREE.Vector2(max.x, min.y),
        new THREE.Vector2(max.x, max.y),
        new THREE.Vector2(min.x, max.y),
      ]));
    });

    const geometry = new THREE.ShapeGeometry(shape);

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const vec = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      vec.applyMatrix4(invTransform);
      posAttr.setXYZ(i, vec.x, vec.y, vec.z);
    }
    posAttr.needsUpdate = true;

    const totalDistance = Utils.distance(v1.x, v1.z, v2.x, v2.z);
    const height = this.wall.height;
    const uvAttr = geometry.getAttribute('uv') as THREE.BufferAttribute;

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const u = Utils.distance(v1.x, v1.z, x, z) / totalDistance;
      const v = y / height;
      uvAttr.setXY(i, u, v);
    }
    uvAttr.needsUpdate = true;

    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  private buildSideFiller(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    height: number,
    color: number
  ): THREE.Mesh {
    const a = this.toVec3(p1);
    const b = this.toVec3(p2);
    const c = this.toVec3(p2, height);
    const d = this.toVec3(p1, height);

    const positions = new Float32Array([
      a.x, a.y, a.z,
      b.x, b.y, b.z,
      c.x, c.y, c.z,
      a.x, a.y, a.z,
      c.x, c.y, c.z,
      d.x, d.y, d.z,
    ]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  }

  private buildFiller(
    edge: HalfEdge,
    height: number,
    side: THREE.Side,
    color: number
  ): THREE.Mesh {
    const points = [
      this.toVec2(edge.exteriorStart()),
      this.toVec2(edge.exteriorEnd()),
      this.toVec2(edge.interiorEnd()),
      this.toVec2(edge.interiorStart()),
    ];

    const shape = new THREE.Shape(points);
    const geometry = new THREE.ShapeGeometry(shape);
    const filler = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side }));
    filler.rotation.set(Math.PI / 2, 0, 0);
    filler.position.y = height;
    return filler;
  }

  private toVec2(pos: { x: number; y: number }): THREE.Vector2 {
    return new THREE.Vector2(pos.x, pos.y);
  }

  private toVec3(pos: { x: number; y: number }, height = 0): THREE.Vector3 {
    return new THREE.Vector3(pos.x, height, pos.y);
  }
}
