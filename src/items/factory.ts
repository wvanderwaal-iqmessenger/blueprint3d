import { FloorItem } from './floor_item';
import { WallItem } from './wall_item';
import { InWallItem } from './in_wall_item';
import { InWallFloorItem } from './in_wall_floor_item';
import { OnFloorItem } from './on_floor_item';
import { WallFloorItem } from './wall_floor_item';

/** Factory class to create items by type. */
export class Factory {
  /** Gets the constructor class for the specified item type. */
  public static getClass(itemType: number): any {
    // Defined inside function body to avoid circular dep issues at module init time
    const item_types: { [key: number]: any } = {
      1: FloorItem,
      2: WallItem,
      3: InWallItem,
      7: InWallFloorItem,
      8: OnFloorItem,
      9: WallFloorItem,
    };
    return item_types[itemType] || FloorItem;
  }
}
