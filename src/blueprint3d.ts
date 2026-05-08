import { Model } from './model/model';
import { Main } from './three/main';
import { Floorplanner } from './floorplanner/floorplanner';

export interface Options {
  widget?: boolean;
  threeElement?: string;
  threeCanvasElement?: string;
  floorplannerElement?: string;
  textureDir?: string;
}

export class Blueprint3d {
  public model: Model;
  public three: Main;
  public floorplanner?: Floorplanner;

  constructor(options: Options) {
    this.model = new Model(options.textureDir);
    this.three = new Main(this.model, options.threeElement!, options.threeCanvasElement!, {});

    if (!options.widget) {
      this.floorplanner = new Floorplanner(options.floorplannerElement!, this.model.floorplan);
    } else {
      this.three.getController().enabled = false;
    }
  }
}
