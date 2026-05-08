import * as THREE from 'three';
import type { Floorplan } from '../model/floorplan';

export class Lights {
  private dirLight: THREE.DirectionalLight;

  constructor(scene: THREE.Scene, floorplan: Floorplan) {
    const height = 300;
    const tol = 1;

    const light = new THREE.HemisphereLight(0xffffff, 0x888888, 1.1);
    light.position.set(0, height, 0);
    scene.add(light);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 0);
    this.dirLight.color.setHSL(1, 1, 0.1);
    this.dirLight.castShadow = true;

    // Modern Three.js shadow properties
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.far = height + tol;
    this.dirLight.shadow.bias = -0.0001;
    this.dirLight.visible = true;

    scene.add(this.dirLight);
    scene.add(this.dirLight.target);

    floorplan.fireOnUpdatedRooms(() => this.updateShadowCamera(floorplan, height, tol));
  }

  getDirLight() { return this.dirLight; }

  private updateShadowCamera(floorplan: Floorplan, height: number, tol: number) {
    const size = floorplan.getSize();
    const d = (Math.max(size.z, size.x) + tol) / 2.0;
    const center = floorplan.getCenter();

    this.dirLight.position.set(center.x, height, center.z);
    this.dirLight.target.position.copy(center);

    const shadowCam = this.dirLight.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -d;
    shadowCam.right = d;
    shadowCam.top = d;
    shadowCam.bottom = -d;
    shadowCam.updateProjectionMatrix();
  }
}
