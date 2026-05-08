import * as THREE from 'three';
import { EventEmitter } from '../core/event-emitter';
import { Floorplan } from './floorplan';
import { Scene } from './scene';

export class Model {
  public floorplan: Floorplan;
  public scene: Scene;

  private roomLoadingCallbacks = new EventEmitter();
  private roomLoadedCallbacks = new EventEmitter();
  private roomSavedCallbacks = new EventEmitter();
  private roomDeletedCallbacks = new EventEmitter();

  constructor(textureDir: string) {
    this.floorplan = new Floorplan();
    this.scene = new Scene(this, textureDir);
  }

  public loadSerialized(json: string) {
    this.roomLoadingCallbacks.fire();
    const data = JSON.parse(json);
    this.newRoom(data.floorplan, data.items);
    this.roomLoadedCallbacks.fire();
  }

  public exportSerialized(): string {
    const items_arr: any[] = [];
    const objects = this.scene.getItems();
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      items_arr[i] = {
        item_name: object.metadata.itemName,
        item_type: object.metadata.itemType,
        model_url: object.metadata.modelUrl,
        xpos: object.position.x,
        ypos: object.position.y,
        zpos: object.position.z,
        rotation: object.rotation.y,
        scale_x: object.scale.x,
        scale_y: object.scale.y,
        scale_z: object.scale.z,
        fixed: (object as any).fixed,
      };
    }
    const room = {
      floorplan: this.floorplan.saveFloorplan(),
      items: items_arr,
    };
    return JSON.stringify(room);
  }

  private newRoom(floorplan: any, items: any[]) {
    this.scene.clearItems();
    this.floorplan.loadFloorplan(floorplan);
    if (items) {
      items.forEach(item => {
        const position = new THREE.Vector3(item.xpos, item.ypos, item.zpos);
        const metadata = {
          itemName: item.item_name,
          resizable: item.resizable,
          itemType: item.item_type,
          modelUrl: item.model_url,
        };
        const scale = new THREE.Vector3(item.scale_x, item.scale_y, item.scale_z);
        this.scene.addItem(
          item.item_type,
          item.model_url,
          metadata,
          position,
          item.rotation,
          scale,
          item.fixed
        );
      });
    }
  }
}
