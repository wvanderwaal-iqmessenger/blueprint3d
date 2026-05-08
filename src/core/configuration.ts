/** The dimensioning unit for 2D floorplan measurements. */
export const configDimUnit = "dimUnit";

/** The initial wall height in cm. */
export const configWallHeight = "wallHeight";

/** The initial wall thickness in cm. */
export const configWallThickness = "wallThickness";

/** Global configuration to customize the whole system. */
export class Configuration {
  /** Configuration data. */
  private static data: { [key: string]: any } = {
    dimUnit: "inch",
    wallHeight: 250,
    wallThickness: 10,
  };

  public static setValue(key: string, value: string | number) {
    this.data[key] = value;
  }

  public static getStringValue(key: string): string {
    switch (key) {
      case configDimUnit:
        return <string>this.data[key];
      default:
        throw new Error("Invalid string configuration parameter: " + key);
    }
  }

  public static getNumericValue(key: string): number {
    switch (key) {
      case configWallHeight:
      case configWallThickness:
        return <number>this.data[key];
      default:
        throw new Error("Invalid numeric configuration parameter: " + key);
    }
  }
}
