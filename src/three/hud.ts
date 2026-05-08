import * as THREE from 'three';
import type { Main } from './main';
import type { Item } from '../items/item';

export class HUD {
  private scene = new THREE.Scene();
  private selectedItem: Item | null = null;
  private rotating = false;
  private mouseover = false;

  private readonly tolerance = 10;
  private readonly height = 5;
  private readonly distance = 20;
  private readonly color = '#ffffff';
  private readonly hoverColor = '#f1c40f';

  private activeObject: THREE.Object3D | null = null;

  constructor(private three: Main) {
    three.itemSelectedCallbacks.add((item: Item) => this.itemSelected(item));
    three.itemUnselectedCallbacks.add(() => this.itemUnselected());
  }

  getScene() { return this.scene; }
  getObject() { return this.activeObject; }

  setRotating(isRotating: boolean) {
    this.rotating = isRotating;
    this.setColor();
  }

  setMouseover(isMousedOver: boolean) {
    this.mouseover = isMousedOver;
    this.setColor();
  }

  update() {
    if (this.activeObject && this.selectedItem) {
      this.activeObject.rotation.y = this.selectedItem.rotation.y;
      this.activeObject.position.x = this.selectedItem.position.x;
      this.activeObject.position.z = this.selectedItem.position.z;
    }
  }

  private resetSelectedItem() {
    this.selectedItem = null;
    if (this.activeObject) {
      this.scene.remove(this.activeObject);
      this.activeObject = null;
    }
  }

  private itemSelected(item: Item) {
    if (this.selectedItem !== item) {
      this.resetSelectedItem();
      if ((item as any).allowRotate && !item.fixed) {
        this.selectedItem = item;
        this.activeObject = this.makeObject(item);
        this.scene.add(this.activeObject);
      }
    }
  }

  private itemUnselected() {
    this.resetSelectedItem();
  }

  private setColor() {
    if (this.activeObject) {
      this.activeObject.children.forEach(obj => {
        ((obj as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(this.getColor());
      });
    }
    this.three.needsUpdate();
  }

  private getColor() {
    return (this.mouseover || this.rotating) ? this.hoverColor : this.color;
  }

  private makeLineGeometry(item: Item): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      this.rotateVector(item),
    ]);
    return geometry;
  }

  private rotateVector(item: Item): THREE.Vector3 {
    const hs = (item as any).halfSize;
    return new THREE.Vector3(0, 0, Math.max(hs.x, hs.z) + 1.4 + this.distance);
  }

  private makeLineMaterial(): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({ color: this.getColor(), linewidth: 3 });
  }

  private makeCone(item: Item): THREE.Mesh {
    const coneGeo = new THREE.CylinderGeometry(5, 0, 10);
    const coneMat = new THREE.MeshBasicMaterial({ color: this.getColor() });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.copy(this.rotateVector(item));
    cone.rotation.x = -Math.PI / 2.0;
    return cone;
  }

  private makeSphere(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(4, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: this.getColor() });
    return new THREE.Mesh(geometry, material);
  }

  private makeObject(item: Item): THREE.Object3D {
    const object = new THREE.Object3D();
    // Single-segment line (two points) — use THREE.Line, not LineSegments
    const line = new THREE.Line(this.makeLineGeometry(item), this.makeLineMaterial());
    const cone = this.makeCone(item);
    const sphere = this.makeSphere();

    object.add(line);
    object.add(cone);
    object.add(sphere);

    object.rotation.y = item.rotation.y;
    object.position.x = item.position.x;
    object.position.z = item.position.z;
    object.position.y = this.height;
    return object;
  }
}
