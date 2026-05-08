import * as THREE from 'three';
import { Utils } from '../core/utils';

export const Controller = function (three: any, model: any, camera: any, element: HTMLElement, controls: any, hud: any) {

  const scope = this as any;

  this.enabled = true;

  const scene = model.scene;

  let plane: THREE.Mesh;
  let mouse: THREE.Vector2;
  let intersectedObject: any = null;
  let mouseoverObject: any = null;
  let selectedObject: any = null;

  let mouseDown = false;
  let mouseMoved = false;
  let rotateMouseOver = false;

  const states = {
    UNSELECTED: 0,
    SELECTED: 1,
    DRAGGING: 2,
    ROTATING: 3,
    ROTATING_FREE: 4,
    PANNING: 5
  };
  let state = states.UNSELECTED;

  this.needsUpdate = true;

  function init() {
    element.addEventListener('mousedown', mouseDownEvent);
    element.addEventListener('mouseup', mouseUpEvent);
    element.addEventListener('mousemove', mouseMoveEvent);

    mouse = new THREE.Vector2();

    scene.itemRemovedCallbacks.add(itemRemoved);
    scene.itemLoadedCallbacks.add(itemLoaded);
    setGroundPlane();
  }

  // Reused per-frame allocations for raycasting; allocating these on every
  // mouse move (which fires dozens of times per second) caused noticeable GC
  // pressure and stutter.
  const _raycaster = new THREE.Raycaster();
  const _rayDir = new THREE.Vector3();
  const _rayOrigin = new THREE.Vector3();

  // Coalesce mouse-driven work to once per animation frame instead of running
  // it for every native mousemove event.
  let _pendingMouseFrame = 0;

  function itemLoaded(item: any) {
    if (!item.position_set) {
      scope.setSelectedObject(item);
      switchState(states.DRAGGING);
      const pos = item.position.clone();
      pos.y = 0;
      const vec = three.projectVector(pos);
      clickPressed(vec);
    }
    item.position_set = true;
  }

  function clickPressed(vec2?: THREE.Vector2) {
    vec2 = vec2 || mouse;
    const intersection = scope.itemIntersection(vec2, selectedObject);
    if (intersection) {
      selectedObject.clickPressed(intersection);
    }
  }

  function clickDragged(vec2?: THREE.Vector2) {
    vec2 = vec2 || mouse;
    const intersection = scope.itemIntersection(vec2, selectedObject);
    if (intersection) {
      if (scope.isRotating()) {
        selectedObject.rotate(intersection);
      } else {
        selectedObject.clickDragged(intersection);
      }
    }
  }

  function itemRemoved(item: any) {
    if (item === selectedObject) {
      selectedObject.setUnselected();
      selectedObject.mouseOff();
      scope.setSelectedObject(null);
    }
  }

  function setGroundPlane() {
    const size = 10000;
    plane = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial()
    );
    plane.rotation.x = -Math.PI / 2;
    plane.visible = false;
    scene.add(plane);
  }

  function checkWallsAndFloors() {
    if (state === states.UNSELECTED && mouseoverObject == null) {
      const wallEdgePlanes = model.floorplan.wallEdgePlanes();
      const wallIntersects = scope.getIntersections(mouse, wallEdgePlanes, true);
      if (wallIntersects.length > 0) {
        const wall = wallIntersects[0].object.edge;
        three.wallClicked.fire(wall);
        return;
      }

      const floorPlanes = model.floorplan.floorPlanes();
      const floorIntersects = scope.getIntersections(mouse, floorPlanes, false);
      if (floorIntersects.length > 0) {
        const room = floorIntersects[0].object.room;
        three.floorClicked.fire(room);
        return;
      }

      three.nothingClicked.fire();
    }
  }

  function mouseMoveEvent(event: MouseEvent) {
    if (scope.enabled) {
      event.preventDefault();
      mouseMoved = true;
      mouse.x = event.clientX;
      mouse.y = event.clientY;

      if (_pendingMouseFrame) return;
      _pendingMouseFrame = requestAnimationFrame(() => {
        _pendingMouseFrame = 0;
        if (!scope.enabled) return;

        if (!mouseDown) {
          updateIntersections();
        }

        switch (state) {
          case states.UNSELECTED:
          case states.SELECTED:
            updateMouseover();
            break;
          case states.DRAGGING:
          case states.ROTATING:
          case states.ROTATING_FREE:
            clickDragged();
            hud.update();
            scope.needsUpdate = true;
            break;
        }
      });
    }
  }

  this.isRotating = function () {
    return (state === states.ROTATING || state === states.ROTATING_FREE);
  };

  function mouseDownEvent(event: MouseEvent) {
    if (scope.enabled) {
      event.preventDefault();
      mouseMoved = false;
      mouseDown = true;

      switch (state) {
        case states.SELECTED:
          if (rotateMouseOver) {
            switchState(states.ROTATING);
          } else if (intersectedObject != null) {
            scope.setSelectedObject(intersectedObject);
            if (!intersectedObject.fixed) {
              switchState(states.DRAGGING);
            }
          }
          break;
        case states.UNSELECTED:
          if (intersectedObject != null) {
            scope.setSelectedObject(intersectedObject);
            if (!intersectedObject.fixed) {
              switchState(states.DRAGGING);
            }
          }
          break;
        case states.DRAGGING:
        case states.ROTATING:
          break;
        case states.ROTATING_FREE:
          switchState(states.SELECTED);
          break;
      }
    }
  }

  function mouseUpEvent(event: MouseEvent) {
    if (scope.enabled) {
      mouseDown = false;

      switch (state) {
        case states.DRAGGING:
          selectedObject.clickReleased();
          switchState(states.SELECTED);
          break;
        case states.ROTATING:
          if (!mouseMoved) {
            switchState(states.ROTATING_FREE);
          } else {
            switchState(states.SELECTED);
          }
          break;
        case states.UNSELECTED:
          if (!mouseMoved) {
            checkWallsAndFloors();
          }
          break;
        case states.SELECTED:
          if (intersectedObject == null && !mouseMoved) {
            switchState(states.UNSELECTED);
            checkWallsAndFloors();
          }
          break;
        case states.ROTATING_FREE:
          break;
      }
    }
  }

  function switchState(newState: number) {
    if (newState !== state) {
      onExit(state);
      onEntry(newState);
    }
    state = newState;
    hud.setRotating(scope.isRotating());
  }

  function onEntry(s: number) {
    switch (s) {
      case states.UNSELECTED:
        scope.setSelectedObject(null);
        // fall through
      case states.SELECTED:
        controls.enabled = true;
        break;
      case states.ROTATING:
      case states.ROTATING_FREE:
        controls.enabled = false;
        break;
      case states.DRAGGING:
        three.setCursorStyle('move');
        clickPressed();
        controls.enabled = false;
        break;
    }
  }

  function onExit(s: number) {
    switch (s) {
      case states.UNSELECTED:
      case states.SELECTED:
        break;
      case states.DRAGGING:
        three.setCursorStyle(mouseoverObject ? 'pointer' : 'auto');
        break;
      case states.ROTATING:
      case states.ROTATING_FREE:
        break;
    }
  }

  this.selectedObject = function () {
    return selectedObject;
  };

  function updateIntersections() {
    const hudObject = hud.getObject();
    if (hudObject != null) {
      const hudIntersects = scope.getIntersections(mouse, hudObject, false, false, true);
      if (hudIntersects.length > 0) {
        rotateMouseOver = true;
        hud.setMouseover(true);
        intersectedObject = null;
        return;
      }
    }
    rotateMouseOver = false;
    hud.setMouseover(false);

    const items = model.scene.getItems();
    const intersects = scope.getIntersections(mouse, items, false, true);
    intersectedObject = intersects.length > 0 ? intersects[0].object : null;
  }

  function normalizeVector2(vec2: THREE.Vector2) {
    const retVec = new THREE.Vector2();
    retVec.x = ((vec2.x - three.widthMargin) / (window.innerWidth - three.widthMargin)) * 2 - 1;
    retVec.y = -((vec2.y - three.heightMargin) / (window.innerHeight - three.heightMargin)) * 2 + 1;
    return retVec;
  }

  function mouseToVec3(vec2: THREE.Vector2) {
    const normVec2 = normalizeVector2(vec2);
    const vector = new THREE.Vector3(normVec2.x, normVec2.y, 0.5);
    vector.unproject(camera);
    return vector;
  }

  this.itemIntersection = function (vec2: THREE.Vector2, item: any) {
    const customIntersections = item.customIntersectionPlanes();
    if (customIntersections && customIntersections.length > 0) {
      // Try wall planes first; if cursor isn't over a wall, fall back to ground plane
      const wallHits = this.getIntersections(vec2, customIntersections, true);
      if (wallHits.length > 0) return wallHits[0];
    }
    // Ground plane fallback
    const groundHits = this.getIntersections(vec2, plane);
    return groundHits.length > 0 ? groundHits[0] : null;
  };

  this.getIntersections = function (
    vec2: THREE.Vector2,
    objects: any,
    filterByNormals?: boolean,
    onlyVisible?: boolean,
    recursive?: boolean,
    linePrecision?: number
  ) {
    onlyVisible = onlyVisible || false;
    filterByNormals = filterByNormals || false;
    recursive = recursive || false;
    linePrecision = linePrecision || 20;

    // Build a ray without allocating new Vector3s / Raycasters per call.
    const normVec2 = normalizeVector2(vec2);
    _rayDir.set(normVec2.x, normVec2.y, 0.5).unproject(camera).sub(camera.position).normalize();
    _rayOrigin.copy(camera.position);
    _raycaster.set(_rayOrigin, _rayDir);
    // Modern three.js uses params.Line.threshold instead of linePrecision.
    _raycaster.params.Line.threshold = linePrecision;

    let intersections: THREE.Intersection[];
    if (Array.isArray(objects)) {
      intersections = _raycaster.intersectObjects(objects, recursive);
    } else {
      intersections = _raycaster.intersectObject(objects, recursive);
    }

    if (onlyVisible) {
      intersections = Utils.removeIf(intersections, (i: any) => !i.object.visible);
    }

    if (filterByNormals) {
      intersections = Utils.removeIf(intersections, (i: any) => {
        return i.face.normal.dot(_rayDir) > 0;
      });
    }

    return intersections;
  };

  this.setSelectedObject = function (object: any) {
    if (state === states.UNSELECTED) {
      switchState(states.SELECTED);
    }
    if (selectedObject != null) {
      selectedObject.setUnselected();
    }
    if (object != null) {
      selectedObject = object;
      selectedObject.setSelected();
      three.itemSelectedCallbacks.fire(object);
    } else {
      selectedObject = null;
      three.itemUnselectedCallbacks.fire();
    }
    this.needsUpdate = true;
  };

  function updateMouseover() {
    if (intersectedObject != null) {
      if (mouseoverObject != null) {
        if (mouseoverObject !== intersectedObject) {
          mouseoverObject.mouseOff();
          mouseoverObject = intersectedObject;
          mouseoverObject.mouseOver();
          scope.needsUpdate = true;
        }
      } else {
        mouseoverObject = intersectedObject;
        mouseoverObject.mouseOver();
        three.setCursorStyle('pointer');
        scope.needsUpdate = true;
      }
    } else if (mouseoverObject != null) {
      mouseoverObject.mouseOff();
      three.setCursorStyle('auto');
      mouseoverObject = null;
      scope.needsUpdate = true;
    }
  }

  init();
};
