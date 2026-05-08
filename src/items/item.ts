import * as THREE from 'three';
import { Utils } from '../core/utils';
import type { Model } from '../model/model';
import type { Scene, IItem } from '../model/scene';
import type { HalfEdge } from '../model/half_edge';
import type { Metadata } from './metadata';

export abstract class Item extends THREE.Mesh implements IItem {
  private _scene: Scene;
  private errorGlow: THREE.Mesh = new THREE.Mesh();
  private hover = false;
  private selected = false;
  private highlighted = false;
  private error = false;
  private emissiveColor = 0x444444;
  private errorColor = 0xff0000;
  private resizable: boolean;
  protected obstructFloorMoves = true;
  public position_set: boolean = false;
  protected allowRotate = true;
  public fixed = false;
  private dragOffset = new THREE.Vector3();
  protected halfSize: THREE.Vector3 = new THREE.Vector3();

  constructor(
    protected model: Model,
    public metadata: Metadata,
    geometry: THREE.BufferGeometry,
    materials: THREE.Material[],
    position: THREE.Vector3 | undefined,
    rotation: number | undefined,
    scale: THREE.Vector3 | undefined
  ) {
    super(geometry, materials);

    this._scene = this.model.scene;
    this.resizable = metadata.resizable ?? true;
    this.castShadow = true;
    this.receiveShadow = false;

    if (position) {
      this.position.copy(position);
      this.position_set = true;
    }

    // Center in bounding box
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(
      -0.5 * (bb.max.x + bb.min.x),
      -0.5 * (bb.max.y + bb.min.y),
      -0.5 * (bb.max.z + bb.min.z)
    ));
    geometry.computeBoundingBox();
    this.halfSize = this.objectHalfSize();

    if (rotation !== undefined) {
      this.rotation.y = rotation;
    }
    if (scale != null) {
      this.setScale(scale.x, scale.y, scale.z);
    }
  }

  public remove(...args: THREE.Object3D[]): this {
    if (args.length > 0) return super.remove(...args);
    this._scene.removeItem(this);
    return this;
  }

  public resize(height: number, width: number, depth: number) {
    this.setScale(width / this.getWidth(), height / this.getHeight(), depth / this.getDepth());
  }

  public setScale(x: number, y: number, z: number) {
    const scaleVec = new THREE.Vector3(x, y, z);
    this.halfSize.multiply(scaleVec);
    scaleVec.multiply(this.scale);
    this.scale.set(scaleVec.x, scaleVec.y, scaleVec.z);
    this.resized();
    this._scene.needsUpdate = true;
  }

  public setFixed(fixed: boolean) { this.fixed = fixed; }
  protected abstract resized(): void;

  public getHeight() { return this.halfSize.y * 2.0; }
  public getWidth() { return this.halfSize.x * 2.0; }
  public getDepth() { return this.halfSize.z * 2.0; }

  public abstract placeInRoom(): void;

  public initObject() {
    this.placeInRoom();
    this._scene.needsUpdate = true;
  }

  public removed() {}

  public updateHighlight() {
    const on = this.hover || this.selected;
    this.highlighted = on;
    const hex = on ? this.emissiveColor : 0x000000;
    const mats = Array.isArray(this.material) ? this.material : [this.material];
    mats.forEach(mat => {
      if ((mat as THREE.MeshPhongMaterial).emissive) {
        (mat as THREE.MeshPhongMaterial).emissive.setHex(hex);
      }
    });
  }

  public mouseOver() { this.hover = true; this.updateHighlight(); }
  public mouseOff() { this.hover = false; this.updateHighlight(); }
  public setSelected() { this.selected = true; this.updateHighlight(); }
  public setUnselected() { this.selected = false; this.updateHighlight(); }

  public clickPressed(intersection: THREE.Intersection) {
    this.dragOffset.copy(intersection.point).sub(this.position);
  }

  public clickDragged(intersection: THREE.Intersection | null) {
    if (intersection) {
      this.moveToPosition(intersection.point.clone().sub(this.dragOffset), intersection);
    }
  }

  public rotate(intersection: THREE.Intersection) {
    if (intersection) {
      let angle = Utils.angle(0, 1,
        intersection.point.x - this.position.x,
        intersection.point.z - this.position.z);
      const snapTolerance = Math.PI / 16.0;
      for (let i = -4; i <= 4; i++) {
        if (Math.abs(angle - i * (Math.PI / 2)) < snapTolerance) {
          angle = i * (Math.PI / 2);
          break;
        }
      }
      this.rotation.y = angle;
    }
  }

  public moveToPosition(vec3: THREE.Vector3, intersection: THREE.Intersection) {
    this.position.copy(vec3);
  }

  public clickReleased() {
    if (this.error) this.hideError();
  }

  public customIntersectionPlanes(): THREE.Object3D[] { return []; }

  public getCorners(xDim: string, yDim: string, position?: THREE.Vector3) {
    position = position || this.position;
    const halfSize = this.halfSize.clone();
    const c1 = new THREE.Vector3(-halfSize.x, 0, -halfSize.z);
    const c2 = new THREE.Vector3(halfSize.x, 0, -halfSize.z);
    const c3 = new THREE.Vector3(halfSize.x, 0, halfSize.z);
    const c4 = new THREE.Vector3(-halfSize.x, 0, halfSize.z);

    const transform = new THREE.Matrix4().makeRotationY(this.rotation.y);
    [c1, c2, c3, c4].forEach(c => { c.applyMatrix4(transform); c.add(position!); });

    return [
      { x: c1.x, y: c1.z },
      { x: c2.x, y: c2.z },
      { x: c3.x, y: c3.z },
      { x: c4.x, y: c4.z },
    ];
  }

  public abstract isValidPosition(vec3: THREE.Vector3): boolean;

  public showError(vec3?: THREE.Vector3) {
    vec3 = vec3 || this.position;
    if (!this.error) {
      this.error = true;
      this.errorGlow = this.createGlow(this.errorColor, 0.8, true);
      this._scene.add(this.errorGlow);
    }
    this.errorGlow.position.copy(vec3);
  }

  public hideError() {
    if (this.error) {
      this.error = false;
      this._scene.remove(this.errorGlow);
    }
  }

  private objectHalfSize(): THREE.Vector3 {
    const objectBox = new THREE.Box3().setFromObject(this);
    return objectBox.max.clone().sub(objectBox.min).divideScalar(2);
  }

  public createGlow(color: number, opacity: number, ignoreDepth: boolean): THREE.Mesh {
    const glowMaterial = new THREE.MeshBasicMaterial({
      color,
      blending: THREE.AdditiveBlending,
      opacity: opacity || 0.2,
      transparent: true,
      depthTest: !ignoreDepth,
    });
    const glow = new THREE.Mesh(this.geometry.clone(), glowMaterial);
    glow.position.copy(this.position);
    glow.rotation.copy(this.rotation);
    glow.scale.copy(this.scale);
    return glow;
  }
}
