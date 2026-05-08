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
        return `${(Math.round(cm) / 100).toFixed(2)} m`;
    }
  }

  /** Parse a user-typed measurement string back to centimetres in the active unit system. */
  public static measureToCm(text: string): number | null {
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) return null;

    // Explicit units always honored regardless of active configuration.
    const mMatch = trimmed.match(/^(-?\d+(?:[.,]\d+)?)\s*m$/);
    if (mMatch) return parseFloat(mMatch[1].replace(',', '.')) * 100;

    const cmMatch = trimmed.match(/^(-?\d+(?:[.,]\d+)?)\s*cm$/);
    if (cmMatch) return parseFloat(cmMatch[1].replace(',', '.'));

    const mmMatch = trimmed.match(/^(-?\d+(?:[.,]\d+)?)\s*mm$/);
    if (mmMatch) return parseFloat(mmMatch[1].replace(',', '.')) / 10;

    // Imperial: 10'6", 10', 6", 10ft, 6in
    const ftInMatch = trimmed.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:'|ft)\s*(\d+(?:[.,]\d+)?)?\s*(?:"|in)?$/);
    if (ftInMatch) {
      const ft = parseFloat(ftInMatch[1].replace(',', '.'));
      const inches = ftInMatch[2] ? parseFloat(ftInMatch[2].replace(',', '.')) : 0;
      return (ft * 12 + inches) * 2.54;
    }
    const inchOnlyMatch = trimmed.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:"|in)$/);
    if (inchOnlyMatch) {
      return parseFloat(inchOnlyMatch[1].replace(',', '.')) * 2.54;
    }

    // Bare number: interpret in the active unit
    const numMatch = trimmed.match(/^(-?\d+(?:[.,]\d+)?)$/);
    if (!numMatch) return null;
    const v = parseFloat(numMatch[1].replace(',', '.'));
    switch (Configuration.getStringValue(configDimUnit)) {
      case dimInch: return v * 2.54;
      case dimMeter: return v * 100;
      case dimCentiMeter: return v;
      case dimMilliMeter: return v / 10;
      default: return v * 100;
    }
  }
}
