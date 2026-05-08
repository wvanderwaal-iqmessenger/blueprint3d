import * as THREE from 'three';
import type { Room } from '../model/room';

export class Floor {
  private floorPlane: THREE.Mesh | null = null;
  private textureLoader = new THREE.TextureLoader();

  constructor(private scene: THREE.Scene, public room: Room) {
    room.fireOnFloorChange(() => this.redraw());
    this.floorPlane = this.buildFloor();
    this.addToScene();
  }

  private redraw() {
    this.removeFromScene();
    this.floorPlane = this.buildFloor();
    this.addToScene();
  }

  private buildFloor(): THREE.Mesh {
    const textureSettings = this.room.getTexture();
    const floorTexture = this.textureLoader.load(textureSettings.url);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(1, 1);

    const floorMaterialTop = new THREE.MeshPhongMaterial({
      map: floorTexture,
      side: THREE.DoubleSide,
      color: 0xcccccc,
      specular: 0x0a0a0a,
    });

    const textureScale = textureSettings.scale;
    const points: THREE.Vector2[] = [];
    this.room.interiorCorners.forEach(corner => {
      points.push(new THREE.Vector2(corner.x / textureScale, corner.y / textureScale));
    });

    const shape = new THREE.Shape(points);
    const geometry = new THREE.ShapeGeometry(shape);
    const floor = new THREE.Mesh(geometry, floorMaterialTop);
    floor.rotation.set(Math.PI / 2, 0, 0);
    floor.scale.set(textureScale, textureScale, textureScale);
    floor.receiveShadow = true;
    floor.castShadow = false;
    return floor;
  }

  addToScene() {
    if (this.floorPlane) this.scene.add(this.floorPlane);
    if (this.room.floorPlane) this.scene.add(this.room.floorPlane);
  }

  removeFromScene() {
    if (this.floorPlane) this.scene.remove(this.floorPlane);
    if (this.room.floorPlane) this.scene.remove(this.room.floorPlane);
  }
}
