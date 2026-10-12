"use client";

import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type StageObject = {
  id: string;
  name: string;
  url: string;
};

type Props = {
  splatUrl: string;
  coordinateFrame: "three" | "marble";
  metricScaleFactor: number;
  groundPlaneOffset: number;
  objects: StageObject[];
  onReady: () => void;
  onError: (message: string) => void;
};

const LOOK_SPEED = 0.0022;
const DRAG_SPEED = 0.005;

export function SplatStage({ splatUrl, coordinateFrame, metricScaleFactor, groundPlaneOffset, objects, onReady, onError }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const keys = useRef(new Set<string>());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const objectGroup = useRef<THREE.Group | null>(null);
  const [hint, setHint] = useState("Click the world, then use WASD to fly. Shift is faster. Q and E move down and up.");
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(coordinateFrame === "marble" ? "#12110f" : "#b7c6d2");
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 500);
    camera.position.set(0, 1.45, 1.55);

    const spark = new SparkRenderer({ renderer });
    scene.add(spark);

    const mesh = new SplatMesh({
      url: splatUrl,
      onLoad: () => {
        if (!disposed) callbacks.current.onReady();
      },
    });
    const root = new THREE.Group();
    if (coordinateFrame === "marble") {
      root.rotation.x = Math.PI;
      const aligned = new THREE.Group();
      aligned.position.y = -groundPlaneOffset;
      aligned.scale.setScalar(metricScaleFactor > 0 ? metricScaleFactor : 1);
      aligned.add(mesh);
      root.add(aligned);
    } else {
      root.add(mesh);
    }
    scene.add(root);
    const props = new THREE.Group();
    objectGroup.current = props;
    scene.add(props);

    const look = { yaw: 0, pitch: 0 };
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const move = new THREE.Vector3();
    let dragging = false;
    let frame = 0;
    let last = performance.now();

    const resize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.type === "keydown") keys.current.add(event.code);
      else keys.current.delete(event.code);
    };
    const onMouseDown = (event: MouseEvent) => {
      dragging = true;
      renderer.domElement.requestPointerLock?.();
      event.preventDefault();
    };
    const onMouseUp = () => {
      dragging = false;
    };
    const onMouseMove = (event: MouseEvent) => {
      const locked = document.pointerLockElement === renderer.domElement;
      if (!locked && !dragging) return;
      const speed = locked ? LOOK_SPEED : DRAG_SPEED;
      look.yaw -= event.movementX * speed;
      look.pitch = Math.max(-1.15, Math.min(1.15, look.pitch - event.movementY * speed));
    };
    const onWheel = (event: WheelEvent) => {
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(forward, -event.deltaY * 0.004);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      euler.set(look.pitch, look.yaw, 0);
      camera.quaternion.setFromEuler(euler);
      let fwd = 0;
      let strafe = 0;
      let vert = 0;
      const held = keys.current;
      if (held.has("KeyW") || held.has("ArrowUp")) fwd += 1;
      if (held.has("KeyS") || held.has("ArrowDown")) fwd -= 1;
      if (held.has("KeyA") || held.has("ArrowLeft")) strafe -= 1;
      if (held.has("KeyD") || held.has("ArrowRight")) strafe += 1;
      if (held.has("KeyE")) vert += 1;
      if (held.has("KeyQ")) vert -= 1;
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      move.set(0, 0, 0).addScaledVector(forward, fwd).addScaledVector(right, strafe).addScaledVector(new THREE.Vector3(0, 1, 0), vert);
      if (move.lengthSq() > 1) move.normalize();
      const speed = (held.has("ShiftLeft") || held.has("ShiftRight") ? 7.5 : 2.6) * delta;
      camera.position.addScaledVector(move, speed);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    mesh.initialized.catch((cause: unknown) => {
      if (disposed) return;
      callbacks.current.onError(cause instanceof Error ? cause.message : "The splat could not be loaded. Download it and open it locally if the host blocks the browser.");
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("wheel", onWheel);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      scene.remove(spark);
      mesh.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      objectGroup.current = null;
    };
  }, [coordinateFrame, groundPlaneOffset, metricScaleFactor, splatUrl]);

  useEffect(() => {
    const group = objectGroup.current;
    if (!group) return;
    let cancelled = false;
    const loaded: THREE.Object3D[] = [];
    const run = async () => {
      if (objects.length === 0) return;
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const loader = new GLTFLoader();
      for (const [index, item] of objects.entries()) {
        if (cancelled) return;
        try {
          const gltf = await loader.loadAsync(item.url);
          if (cancelled) return;
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const height = size.y || 1;
          model.scale.setScalar(0.75 / height);
          const fitted = new THREE.Box3().setFromObject(model);
          model.position.y -= fitted.min.y;
          model.position.x += (index - (objects.length - 1) / 2) * 1.2;
          model.position.z = -1.1;
          model.name = item.name;
          group.add(model);
          loaded.push(model);
        } catch {
          // The download link in the side panel still works if the mesh host blocks the viewer.
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      for (const model of loaded) group.remove(model);
      while (group.children.length > 0) group.remove(group.children[0]);
    };
  }, [objects, splatUrl]);

  function hold(code: string, down: boolean) {
    if (down) keys.current.add(code);
    else keys.current.delete(code);
    setHint("Flying. Release the pad to stop.");
  }

  return (
    <div className="stage">
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      <div className="touch" aria-label="Move">
        <span />
        <Pad label="Forward" code="KeyW" onHold={hold} />
        <span />
        <Pad label="Left" code="KeyA" onHold={hold} />
        <Pad label="Back" code="KeyS" onHold={hold} />
        <Pad label="Right" code="KeyD" onHold={hold} />
      </div>
      <p className="help">{hint}</p>
    </div>
  );
}

function Pad({ label, code, onHold }: { label: string; code: string; onHold: (code: string, down: boolean) => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onHold(code, true);
      }}
      onPointerUp={() => onHold(code, false)}
      onPointerCancel={() => onHold(code, false)}
    >
      {label.slice(0, 1)}
    </button>
  );
}
