import * as THREE from 'three';

export class Skybox {
  constructor(scene: THREE.Scene) {
    // Warm dusk gradient — provides a rich backdrop that lets the
    // translucent glass UI panels read clearly against the scene.
    const topColor = 0x1a1f3d;    // deep indigo
    const bottomColor = 0xc88b5e; // warm amber
    const verticalOffset = 500;
    const sphereRadius = 4000;

    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, (h + 1.0) / 2.0), 1.0);
      }
    `;

    const uniforms = {
      topColor: { value: new THREE.Color(topColor) },
      bottomColor: { value: new THREE.Color(bottomColor) },
      offset: { value: verticalOffset },
    };

    const skyGeo = new THREE.SphereGeometry(sphereRadius, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.BackSide,
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
  }
}
