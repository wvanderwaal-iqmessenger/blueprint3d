import * as THREE from 'three';
import Stats from 'stats.js';
import { EventEmitter } from '../core/event-emitter';
import { Controls } from './controls';
import { Controller } from './controller';
import { ThreeFloorplan } from './floorplan';
import { Lights } from './lights';
import { Skybox } from './skybox';
import { HUD } from './hud';

export class Main {
  public element: HTMLElement;
  public heightMargin = 0;
  public widthMargin = 0;
  public elementHeight = 0;
  public elementWidth = 0;
  public controls: any;

  public itemSelectedCallbacks = new EventEmitter<(item: any) => void>();
  public itemUnselectedCallbacks = new EventEmitter<() => void>();
  public wallClicked = new EventEmitter<(wall: any) => void>();
  public floorClicked = new EventEmitter<(room: any) => void>();
  public nothingClicked = new EventEmitter<() => void>();

  private scene: any;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controller: any;
  private floorplan: any;
  private hud: any;
  private needsUpdateFlag = false;
  private lastRender = Date.now();
  private mouseOver = false;
  private hasClicked = false;
  private options: any;
  private stats!: Stats;

  constructor(private model: any, elementSelector: string, canvasElement: string, opts: any) {
    this.element = document.querySelector(elementSelector) as HTMLElement;
    this.scene = model.scene;

    this.options = {
      resize: true,
      pushHref: false,
      spin: true,
      spinSpeed: 0.00002,
      clickPan: true,
      canMoveFixedItems: false,
      ...opts,
    };

    this.init();
  }

  private init() {
    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      // preserveDrawingBuffer disables important driver optimizations.
      // We re-render on demand inside dataUrl() instead.
      powerPreference: 'high-performance',
    });
    // Cap pixel ratio to 2 to avoid rendering 9x the pixels on hi-DPI displays.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    // PCFShadowMap is roughly 2-3x cheaper than PCFSoftShadowMap with a 1024^2 map.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    new Skybox(this.scene.getScene());

    this.controls = new (Controls as any)(this.camera, this.element);
    this.hud = new HUD(this);

    this.controller = new (Controller as any)(
      this, this.model, this.camera, this.element, this.controls, this.hud
    );

    this.element.appendChild(this.renderer.domElement);

    // Stats overlay (FPS + MS panels) anchored to top-right of the viewport.
    this.stats = new Stats();
    this.stats.showPanel(0); // 0=FPS, start visible
    // Add the MS panel too so the user can click to toggle between them.
    Object.assign(this.stats.dom.style, {
      position: 'absolute',
      top: '0',
      right: '0',
      left: 'auto',
    });
    this.element.style.position = this.element.style.position || 'relative';
    this.element.appendChild(this.stats.dom);

    this.updateWindowSize();
    if (this.options.resize) {
      window.addEventListener('resize', () => this.updateWindowSize());
    }

    this.centerCamera();
    this.model.floorplan.fireOnUpdatedRooms(() => this.centerCamera());

    new Lights(this.scene.getScene(), this.model.floorplan);

    this.floorplan = new ThreeFloorplan(this.scene.getScene(), this.model.floorplan, this.controls);

    this.animate();

    this.element.addEventListener('mouseenter', () => { this.mouseOver = true; });
    this.element.addEventListener('mouseleave', () => { this.mouseOver = false; });
    this.element.addEventListener('click', () => { this.hasClicked = true; });
  }

  private spin() {
    if (this.options.spin && !this.mouseOver && !this.hasClicked) {
      const theta = 2 * Math.PI * this.options.spinSpeed * (Date.now() - this.lastRender);
      this.controls.rotateLeft(theta);
      this.controls.update();
    }
  }

  public dataUrl() {
    // Render synchronously so the drawing buffer is populated before readback,
    // since we no longer use preserveDrawingBuffer.
    this.renderer.clear();
    this.renderer.render(this.scene.getScene(), this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.hud.getScene(), this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  public stopSpin() {
    this.hasClicked = true;
  }

  public getModel() { return this.model; }
  public getScene() { return this.scene; }
  public getController() { return this.controller; }
  public getCamera() { return this.camera; }

  public needsUpdate() {
    this.needsUpdateFlag = true;
  }

  private shouldRender() {
    if (this.controls.needsUpdate || this.controller.needsUpdate || this.needsUpdateFlag || this.model.scene.needsUpdate) {
      this.controls.needsUpdate = false;
      this.controller.needsUpdate = false;
      this.needsUpdateFlag = false;
      this.model.scene.needsUpdate = false;
      return true;
    }
    return false;
  }

  private render() {
    this.stats.begin();
    this.spin();
    if (this.shouldRender()) {
      this.renderer.clear();
      this.renderer.render(this.scene.getScene(), this.camera);
      this.renderer.clearDepth();
      this.renderer.render(this.hud.getScene(), this.camera);
    }
    this.lastRender = Date.now();
    this.stats.end();
  }

  private animate() {
    // Drive the loop directly off rAF so the browser can pace us at the
    // display refresh rate. The previous setTimeout(50) capped us at ~20 FPS.
    requestAnimationFrame(() => this.animate());
    this.render();
  }

  public setCursorStyle(cursorStyle: string) {
    this.element.style.cursor = cursorStyle;
  }

  public updateWindowSize() {
    const rect = this.element.getBoundingClientRect();
    this.heightMargin = rect.top;
    this.widthMargin = rect.left;

    this.elementWidth = this.element.clientWidth;
    if (this.options.resize) {
      this.elementHeight = window.innerHeight - this.heightMargin;
    } else {
      this.elementHeight = this.element.clientHeight;
    }

    this.camera.aspect = this.elementWidth / this.elementHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.elementWidth, this.elementHeight);
    this.needsUpdateFlag = true;
  }

  public centerCamera() {
    const yOffset = 150.0;
    const pan = this.model.floorplan.getCenter();
    pan.y = yOffset;

    this.controls.target = pan;

    const distance = this.model.floorplan.getSize().z * 1.5;
    const offset = pan.clone().add(new THREE.Vector3(0, distance, distance));
    this.camera.position.copy(offset);
    this.controls.update();
  }

  public projectVector(vec3: THREE.Vector3, ignoreMargin = false) {
    const widthHalf = this.elementWidth / 2;
    const heightHalf = this.elementHeight / 2;

    const vector = vec3.clone().project(this.camera);

    const vec2 = new THREE.Vector2();
    vec2.x = vector.x * widthHalf + widthHalf;
    vec2.y = -(vector.y * heightHalf) + heightHalf;

    if (!ignoreMargin) {
      vec2.x += this.widthMargin;
      vec2.y += this.heightMargin;
    }

    return vec2;
  }
}
