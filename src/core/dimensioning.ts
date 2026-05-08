import { Configuration, configDimUnit } from "./configuration";

/** Dimensioning in Inch. */
export const dimInch = "inch";

/** Dimensioning in Meter. */
export const dimMeter = "m";

/** Dimensioning in Centi Meter. */
export const dimCentiMeter = "cm";

/** Dimensioning in Milli Meter. */
export const dimMilliMeter = "mm";

/** Dimensioning functions. */
export class Dimensioning {
  static readonly dimInch = dimInch;
  static readonly dimMeter = dimMeter;
  static readonly dimCentiMeter = dimCentiMeter;
  static readonly dimMilliMeter = dimMilliMeter;

  /** Converts cm to a human-readable measurement string. */
  public static cmToMeasure(cm: number): string {
    switch (Configuration.getStringValue(configDimUnit)) {
      case dimInch: {
        const realFeet = (cm * 0.3937) / 12;
        const feet = Math.floor(realFeet);
        const inches = Math.round((realFeet - feet) * 12);
        return `${feet}'${inches}"`;
      }
      case dimMilliMeter:
        return `${Math.round(10 * cm)} mm`;
      case dimCentiMeter:
        return `${Math.round(10 * cm) / 10} cm`;
      case dimMeter:
      default:
        return `${Math.round(10 * cm) / 1000} m`;
    }
  }
}
