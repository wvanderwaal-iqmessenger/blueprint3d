import * as THREE from 'three';

/**
 * Loads Three.js JSON geometry format 3.x (legacy) and converts it to
 * modern BufferGeometry + Material[].  This replaces the removed THREE.JSONLoader.
 *
 * Face type bit flags:
 *   bit 0 (1)  : isQuad
 *   bit 1 (2)  : hasMaterial
 *   bit 2 (4)  : hasFaceUv  (deprecated, ignored)
 *   bit 3 (8)  : hasVertexUv
 *   bit 4 (16) : hasFaceNormal (ignored, per-vertex normals preferred)
 *   bit 5 (32) : hasVertexNormal
 *   bit 6 (64) : hasFaceColor (ignored)
 *   bit 7 (128): hasVertexColor (ignored)
 */

interface LegacyJSONMaterial {
  DbgName?: string;
  mapDiffuse?: string;
  colorDiffuse?: [number, number, number];
  colorSpecular?: [number, number, number];
  colorEmissive?: [number, number, number];
  colorAmbient?: [number, number, number];
  specularCoef?: number;
  transparency?: number;
  transparent?: boolean;
  shading?: string;
  blending?: string;
}

interface LegacyJSONGeometry {
  metadata?: { formatVersion?: number };
  scale?: number;
  vertices: number[];
  normals: number[];
  uvs: number[][];
  faces: number[];
  materials?: LegacyJSONMaterial[];
}

interface LoadedModel {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
}

export class LegacyJSONLoader {
  private textureLoader = new THREE.TextureLoader();

  load(
    url: string,
    onLoad: (geometry: THREE.BufferGeometry, materials: THREE.Material[]) => void,
    onError?: (err: unknown) => void
  ): void {
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading ${url}`);
        return r.json();
      })
      .then((json: LegacyJSONGeometry) => {
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        const result = this.parse(json, baseUrl);
        onLoad(result.geometry, result.materials);
      })
      .catch(err => {
        console.error('LegacyJSONLoader: failed to load', url, err);
        onError?.(err);
      });
  }

  parse(json: LegacyJSONGeometry, baseUrl = ''): LoadedModel {
    const vertices = json.vertices || [];
    const normals = json.normals || [];
    const uvLayerData = json.uvs && json.uvs.length > 0 ? json.uvs[0] : [];
    const facesArr = json.faces || [];
    const nUvLayers = json.uvs ? json.uvs.length : 0;

    const jsonMaterials = json.materials || [];
    const materials = this.buildMaterials(jsonMaterials, baseUrl);
    const nMats = Math.max(1, materials.length);

    // Per-material buckets for unrolled geometry data
    const buckets = new Map<number, {
      positions: number[];
      normals: number[];
      uvs: number[];
    }>();
    for (let m = 0; m < nMats; m++) {
      buckets.set(m, { positions: [], normals: [], uvs: [] });
    }

    let offset = 0;
    while (offset < facesArr.length) {
      const type = facesArr[offset++];
      const isQuad = !!(type & 1);
      const hasMaterial = !!(type & 2);
      const hasFaceUv = !!(type & 4);
      const hasVertexUv = !!(type & 8);
      const hasFaceNormal = !!(type & 16);
      const hasVertexNormal = !!(type & 32);
      const hasFaceColor = !!(type & 64);
      const hasVertexColor = !!(type & 128);
      const nVerts = isQuad ? 4 : 3;

      // Vertex indices
      const vi: number[] = [];
      for (let v = 0; v < nVerts; v++) vi.push(facesArr[offset++]);

      // Material index
      let matIdx = 0;
      if (hasMaterial) matIdx = facesArr[offset++];

      // Face UV (one index per UV layer, deprecated)
      if (hasFaceUv) {
        for (let l = 0; l < nUvLayers; l++) offset++;
      }

      // Vertex UV indices (one index per vertex per UV layer)
      const uvi: number[] = [];
      if (hasVertexUv) {
        // Only first UV layer used
        for (let v = 0; v < nVerts; v++) uvi.push(facesArr[offset++]);
        // Skip additional UV layers
        for (let l = 1; l < nUvLayers; l++) {
          for (let v = 0; v < nVerts; v++) offset++;
        }
      }

      // Face normal (single index, skip)
      if (hasFaceNormal) offset++;

      // Vertex normal indices
      const ni: number[] = [];
      if (hasVertexNormal) {
        for (let v = 0; v < nVerts; v++) ni.push(facesArr[offset++]);
      }

      // Face color (skip)
      if (hasFaceColor) offset++;

      // Vertex colors (skip)
      if (hasVertexColor) {
        for (let v = 0; v < nVerts; v++) offset++;
      }

      matIdx = Math.min(matIdx, nMats - 1);
      const bucket = buckets.get(matIdx)!;

      const addVertex = (vidx: number, nidx: number, uvidx: number) => {
        // Position
        bucket.positions.push(
          vertices[vidx * 3],
          vertices[vidx * 3 + 1],
          vertices[vidx * 3 + 2]
        );
        // Normal
        if (ni.length > 0 && nidx >= 0 && normals.length > 0) {
          bucket.normals.push(
            normals[nidx * 3],
            normals[nidx * 3 + 1],
            normals[nidx * 3 + 2]
          );
        }
        // UV
        if (uvi.length > 0 && uvidx >= 0 && uvLayerData.length > 0) {
          bucket.uvs.push(
            uvLayerData[uvidx * 2],
            uvLayerData[uvidx * 2 + 1]
          );
        }
      };

      if (isQuad) {
        // Split quad into 2 triangles: (0,1,2) and (0,2,3)
        addVertex(vi[0], ni[0] ?? -1, uvi[0] ?? -1);
        addVertex(vi[1], ni[1] ?? -1, uvi[1] ?? -1);
        addVertex(vi[2], ni[2] ?? -1, uvi[2] ?? -1);
        addVertex(vi[0], ni[0] ?? -1, uvi[0] ?? -1);
        addVertex(vi[2], ni[2] ?? -1, uvi[2] ?? -1);
        addVertex(vi[3], ni[3] ?? -1, uvi[3] ?? -1);
      } else {
        addVertex(vi[0], ni[0] ?? -1, uvi[0] ?? -1);
        addVertex(vi[1], ni[1] ?? -1, uvi[1] ?? -1);
        addVertex(vi[2], ni[2] ?? -1, uvi[2] ?? -1);
      }
    }

    // Count total vertices
    let totalVerts = 0;
    let hasNormals = false;
    let hasUvs = false;
    for (const [, bucket] of buckets) {
      if (bucket.positions.length > 0) {
        totalVerts += bucket.positions.length / 3;
        if (bucket.normals.length > 0) hasNormals = true;
        if (bucket.uvs.length > 0) hasUvs = true;
      }
    }

    const posArr = new Float32Array(totalVerts * 3);
    const normArr = hasNormals ? new Float32Array(totalVerts * 3) : null;
    const uvArr = hasUvs ? new Float32Array(totalVerts * 2) : null;

    const geometry = new THREE.BufferGeometry();
    let vertStart = 0;

    for (const [matIdx, bucket] of buckets) {
      if (bucket.positions.length === 0) continue;
      const vertCount = bucket.positions.length / 3;

      posArr.set(bucket.positions, vertStart * 3);
      if (normArr && bucket.normals.length > 0) {
        normArr.set(bucket.normals, vertStart * 3);
      }
      if (uvArr && bucket.uvs.length > 0) {
        uvArr.set(bucket.uvs, vertStart * 2);
      }

      geometry.addGroup(vertStart, vertCount, matIdx);
      vertStart += vertCount;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    if (normArr) geometry.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    if (uvArr) geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

    if (!normArr) {
      geometry.computeVertexNormals();
    }

    // Apply model scale if present.
    // The old THREE.JSONLoader used 1/scale (scale was a divisor, not a multiplier).
    const scale = json.scale !== undefined ? (1.0 / json.scale) : 1.0;
    if (scale !== 1) {
      geometry.scale(scale, scale, scale);
    }

    return { geometry, materials };
  }

  private buildMaterials(jsonMats: LegacyJSONMaterial[], baseUrl: string): THREE.Material[] {
    if (jsonMats.length === 0) {
      return [new THREE.MeshPhongMaterial({ color: 0xcccccc })];
    }

    return jsonMats.map(mat => {
      const params: THREE.MeshPhongMaterialParameters = {
        color: 0xcccccc,
        specular: 0x111111,
        shininess: 30,
      };

      if (mat.colorDiffuse) {
        params.color = new THREE.Color(
          mat.colorDiffuse[0], mat.colorDiffuse[1], mat.colorDiffuse[2]
        );
      }
      if (mat.colorSpecular) {
        params.specular = new THREE.Color(
          mat.colorSpecular[0], mat.colorSpecular[1], mat.colorSpecular[2]
        );
      }
      if (mat.colorEmissive) {
        params.emissive = new THREE.Color(
          mat.colorEmissive[0], mat.colorEmissive[1], mat.colorEmissive[2]
        );
      }
      if (mat.specularCoef !== undefined) {
        params.shininess = mat.specularCoef;
      }
      if (mat.transparency !== undefined && mat.transparency < 1.0) {
        params.transparent = true;
        params.opacity = mat.transparency;
      }
      if (mat.transparent) {
        params.transparent = true;
      }
      if (mat.mapDiffuse) {
        params.map = this.textureLoader.load(baseUrl + mat.mapDiffuse);
      }

      const material = new THREE.MeshPhongMaterial(params);
      return material;
    });
  }
}
