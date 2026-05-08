import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EventEmitter } from '../core/event-emitter';
import { Utils } from '../core/utils';
import { LegacyJSONLoader } from '../three/legacy-json-loader';
import type { Model } from './model';

// Forward declaration to break circular dep with items/
export interface IItem extends THREE.Mesh {
  metadata: any;
  fixed: boolean;
  position_set: boolean;
  initObject(): void;
  removed(): void;
}

export class Scene {
  private scene: THREE.Scene;
  private items: IItem[] = [];
  public needsUpdate = false;
  private loader: LegacyJSONLoader;
  private gltfLoader: GLTFLoader;

  public itemLoadingCallbacks = new EventEmitter<(item?: IItem) => void>();
  public itemLoadedCallbacks = new EventEmitter<(item: IItem) => void>();
  public itemRemovedCallbacks = new EventEmitter<(item: IItem) => void>();

  constructor(private model: Model, private textureDir: string) {
    this.scene = new THREE.Scene();
    this.loader = new LegacyJSONLoader();
    this.gltfLoader = new GLTFLoader();
  }

  public add(mesh: THREE.Object3D) { this.scene.add(mesh); }
  public remove(mesh: THREE.Object3D) {
    this.scene.remove(mesh);
    Utils.removeValue(this.items, mesh as IItem);
  }

  public getScene(): THREE.Scene { return this.scene; }
  public getItems(): IItem[] { return this.items; }
  public itemCount(): number { return this.items.length; }

  public clearItems() {
    const items_copy = this.items.slice();
    items_copy.forEach(item => this.removeItem(item, true));
    this.items = [];
  }

  public removeItem(item: IItem, dontRemove = false) {
    this.itemRemovedCallbacks.fire(item);
    item.removed();
    this.scene.remove(item);
    if (!dontRemove) {
      Utils.removeValue(this.items, item);
    }
  }

  public addItem(
    itemType: number,
    fileName: string,
    metadata: any,
    position?: THREE.Vector3,
    rotation?: number,
    scale?: THREE.Vector3,
    fixed?: boolean
  ) {
    itemType = itemType || 1;
    const scope = this;

    const loaderCallback = (geometry: THREE.BufferGeometry, materials: THREE.Material[]) => {
      // Lazy import to avoid circular dependency at module init time
      import('../items/factory').then(({ Factory }) => {
        const ItemClass = Factory.getClass(itemType);
        const item: IItem = new ItemClass(
          scope.model,
          metadata,
          geometry,
          materials,
          position,
          rotation,
          scale
        );
        item.fixed = fixed || false;
        scope.items.push(item);
        scope.add(item);
        item.initObject();
        scope.itemLoadedCallbacks.fire(item);
      });
    };

    this.itemLoadingCallbacks.fire();

    const isGltf = /\.(glb|gltf)$/i.test(fileName);

    if (isGltf) {
      this.gltfLoader.load(
        fileName,
        (gltf) => {
          const geometry = new THREE.BufferGeometry();
          const materials: THREE.Material[] = [];
          const meshes: THREE.Mesh[] = [];
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
          });

          if (meshes.length === 1) {
            const mesh = meshes[0];
            mesh.updateWorldMatrix(true, false);
            geometry.copy(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
            const mat = mesh.material;
            if (Array.isArray(mat)) materials.push(...mat);
            else materials.push(mat);
          } else {
            const geos: THREE.BufferGeometry[] = [];
            for (const mesh of meshes) {
              mesh.updateWorldMatrix(true, false);
              geos.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
              const mat = mesh.material;
              if (Array.isArray(mat)) materials.push(...mat);
              else materials.push(mat);
            }
            const merged = mergeGeometries(geos, true);
            geometry.copy(merged ?? geos[0]);
          }

          loaderCallback(geometry, materials.length ? materials : [new THREE.MeshStandardMaterial()]);
        },
        undefined,
        (err) => console.error('Scene: failed to load GLTF', fileName, err)
      );
    } else {
      this.loader.load(fileName, loaderCallback);
    }
  }
}
