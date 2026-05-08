import * as THREE from 'three';
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

  public itemLoadingCallbacks = new EventEmitter<(item?: IItem) => void>();
  public itemLoadedCallbacks = new EventEmitter<(item: IItem) => void>();
  public itemRemovedCallbacks = new EventEmitter<(item: IItem) => void>();

  constructor(private model: Model, private textureDir: string) {
    this.scene = new THREE.Scene();
    this.loader = new LegacyJSONLoader();
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
    this.loader.load(fileName, loaderCallback);
  }
}
