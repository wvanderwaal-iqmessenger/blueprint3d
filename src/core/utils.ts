/** Collection of utility functions. */
export class Utils {

  public static pointDistanceFromLine(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
    const tPoint = Utils.closestPointOnLine(x, y, x1, y1, x2, y2);
    const tDx = x - tPoint.x;
    const tDy = y - tPoint.y;
    return Math.sqrt(tDx * tDx + tDy * tDy);
  }

  static closestPointOnLine(x: number, y: number, x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
    const tA = x - x1, tB = y - y1, tC = x2 - x1, tD = y2 - y1;
    const tDot = tA * tC + tB * tD;
    const tLenSq = tC * tC + tD * tD;
    const tParam = tDot / tLenSq;
    let tXx: number, tYy: number;
    if (tParam < 0 || (x1 === x2 && y1 === y2)) {
      tXx = x1; tYy = y1;
    } else if (tParam > 1) {
      tXx = x2; tYy = y2;
    } else {
      tXx = x1 + tParam * tC; tYy = y1 + tParam * tD;
    }
    return { x: tXx, y: tYy };
  }

  static distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  static angle(x1: number, y1: number, x2: number, y2: number): number {
    return -Math.atan2(x1 * y2 - y1 * x2, x1 * x2 + y1 * y2);
  }

  static angle2pi(x1: number, y1: number, x2: number, y2: number): number {
    let tTheta = Utils.angle(x1, y1, x2, y2);
    if (tTheta < 0) tTheta += 2 * Math.PI;
    return tTheta;
  }

  static isClockwise(points: { x: number; y: number }[]): boolean {
    const tSubX = Math.min(0, ...points.map(p => p.x));
    const tSubY = Math.min(0, ...points.map(p => p.y));
    const tNewPoints = points.map(p => ({ x: p.x - tSubX, y: p.y - tSubY }));
    let tSum = 0;
    for (let tI = 0; tI < tNewPoints.length; tI++) {
      const tC1 = tNewPoints[tI];
      const tC2 = tNewPoints[(tI + 1) % tNewPoints.length];
      tSum += (tC2.x - tC1.x) * (tC2.y + tC1.y);
    }
    return tSum >= 0;
  }

  static guid(): string {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }

  static polygonPolygonIntersect(firstCorners: any[], secondCorners: any[]): boolean {
    for (let tI = 0; tI < firstCorners.length; tI++) {
      const tFirstCorner = firstCorners[tI];
      const tSecondCorner = firstCorners[(tI + 1) % firstCorners.length];
      if (Utils.linePolygonIntersect(tFirstCorner.x, tFirstCorner.y, tSecondCorner.x, tSecondCorner.y, secondCorners)) {
        return true;
      }
    }
    return false;
  }

  static linePolygonIntersect(x1: number, y1: number, x2: number, y2: number, corners: any[]): boolean {
    for (let tI = 0; tI < corners.length; tI++) {
      const tFirstCorner = corners[tI];
      const tSecondCorner = corners[(tI + 1) % corners.length];
      if (Utils.lineLineIntersect(x1, y1, x2, y2, tFirstCorner.x, tFirstCorner.y, tSecondCorner.x, tSecondCorner.y)) {
        return true;
      }
    }
    return false;
  }

  static lineLineIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
    const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
      (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
    return (
      ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
      ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4)
    );
  }

  static pointInPolygon(x: number, y: number, corners: any[], startX = 0, startY = 0): boolean {
    let tIntersects = 0;
    for (let tI = 0; tI < corners.length; tI++) {
      const tFirstCorner = corners[tI];
      const tSecondCorner = corners[(tI + 1) % corners.length];
      if (Utils.lineLineIntersect(startX, startY, x, y, tFirstCorner.x, tFirstCorner.y, tSecondCorner.x, tSecondCorner.y)) {
        tIntersects++;
      }
    }
    return tIntersects % 2 === 1;
  }

  static polygonInsidePolygon(insideCorners: any[], outsideCorners: any[], startX = 0, startY = 0): boolean {
    for (const corner of insideCorners) {
      if (!Utils.pointInPolygon(corner.x, corner.y, outsideCorners, startX, startY)) return false;
    }
    return true;
  }

  static polygonOutsidePolygon(insideCorners: any[], outsideCorners: any[], startX = 0, startY = 0): boolean {
    for (const corner of insideCorners) {
      if (Utils.pointInPolygon(corner.x, corner.y, outsideCorners, startX, startY)) return false;
    }
    return true;
  }

  static forEach<T>(array: T[], action: (item: T) => void): void {
    array.forEach(action);
  }

  static map<T, U>(array: T[], func: (item: T) => U): U[] {
    return array.map(func);
  }

  static removeIf<T>(array: T[], func: (item: T) => boolean): T[] {
    return array.filter(el => !func(el));
  }

  static cycle<T>(arr: T[], shift: number): T[] {
    const tReturn = arr.slice(0);
    for (let tI = 0; tI < shift; tI++) {
      tReturn.push(tReturn.shift()!);
    }
    return tReturn;
  }

  static unique<T>(arr: T[], hashFunc: (item: T) => string): T[] {
    const tResults: T[] = [];
    const tMap: { [key: string]: boolean } = {};
    for (const item of arr) {
      const key = hashFunc(item);
      if (!tMap[key]) {
        tResults.push(item);
        tMap[key] = true;
      }
    }
    return tResults;
  }

  static removeValue<T>(array: T[], value: T): void {
    for (let tI = array.length - 1; tI >= 0; tI--) {
      if (array[tI] === value) array.splice(tI, 1);
    }
  }

  static hasValue<T>(array: T[], value: T): boolean {
    return array.includes(value);
  }

  static subtract<T>(array: T[], subArray: T[]): T[] {
    return Utils.removeIf(array, el => Utils.hasValue(subArray, el));
  }
}
