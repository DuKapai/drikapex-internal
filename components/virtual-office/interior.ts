import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { OfficeMember } from "@/supabase/workspace-api";
import type { OfficeControlAction } from "@/lib/office-control";
import type { ActorActivity } from "./actor";

export type OfficeDestination =
  | "overview"
  | "people"
  | "documents"
  | "notifications"
  | "administration";

export type OfficeZone = {
  id: string;
  name: string;
  subtitle: string;
  destination: OfficeDestination;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
};

export const zones: OfficeZone[] = [
  {
    id: "executive",
    name: "Executive suite",
    subtitle: "Leadership",
    destination: "overview",
    x: -8.15,
    z: -0.55,
    width: 3.65,
    depth: 5.3,
    color: "#e5d6bd",
  },
  {
    id: "meeting",
    name: "Boardroom",
    subtitle: "Meet & collaborate",
    destination: "overview",
    x: -2.55,
    z: -5.65,
    width: 15.5,
    depth: 4.4,
    color: "#d9e3e3",
  },
  {
    id: "administration",
    name: "Administration",
    subtitle: "Accounts & access",
    destination: "administration",
    x: 8.15,
    z: -5.7,
    width: 5.2,
    depth: 4.1,
    color: "#e6dac5",
  },
  {
    id: "documents",
    name: "Document center",
    subtitle: "Company resources",
    destination: "documents",
    x: -8.15,
    z: 4.7,
    width: 3.65,
    depth: 5.3,
    color: "#e5d6bd",
  },
  {
    id: "personnel",
    name: "People & culture café",
    subtitle: "Personnel · Lunch & recharge",
    destination: "people",
    x: 8.15,
    z: 0.65,
    width: 5.4,
    depth: 7.2,
    color: "#e1e1d4",
  },
  {
    id: "communication",
    name: "Communication",
    subtitle: "Updates & notices",
    destination: "notifications",
    x: 0,
    z: 1.65,
    width: 9.2,
    depth: 3.1,
    color: "#e4e6dc",
  },
  {
    id: "lounge",
    name: "Reception lounge",
    subtitle: "Welcome",
    destination: "overview",
    x: -3.2,
    z: 6.35,
    width: 5.6,
    depth: 3.1,
    color: "#dce6e4",
  },
  {
    id: "reception",
    name: "Reception",
    subtitle: "Front desk",
    destination: "overview",
    x: 4.25,
    z: 6.35,
    width: 5.6,
    depth: 3.1,
    color: "#eadfcd",
  },
  {
    id: "restroom",
    name: "Restrooms",
    subtitle: "Staff facilities",
    destination: "overview",
    x: 8.55,
    z: 6.45,
    width: 4.4,
    depth: 3,
    color: "#dce5e4",
  },
];



export type ActivitySpot = {
  id: string;
  resourceId: string;
  activity: Exclude<ActorActivity, "walking">;
  position: THREE.Vector3;
  rotation: number;
  obstacleId?: string;
  zoneId?: string;
  requiredUsername?: string;
  meetingChairperson?: boolean;
  aquariumViewing?: boolean;
  manualOnly?: OfficeControlAction;
};

export type Workstation = {
  group: THREE.Group;
  spotId?: string;
  screenMaterial: THREE.MeshStandardMaterial;
  powerLightMaterial: THREE.MeshStandardMaterial;
  keycaps: THREE.Mesh[];
  mouse: THREE.Group;
  powerLevel: number;
  transitionTime: number;
};

export type AutomaticDoor = {
  x: number;
  z: number;
  orientation: "horizontal" | "vertical";
  manual?: boolean;
  manualTargetOpen?: boolean;
  openAmount: number;
  panels: {
    mesh: THREE.Object3D;
    interactionObject?: THREE.Object3D;
    closed: THREE.Vector3;
    open: THREE.Vector3;
    halfWidth: number;
    halfDepth: number;
    swing?: { closedY: number; openY: number };
  }[];
  indicator?: THREE.Mesh;
};

export type InteriorLight = {
  fixture: THREE.Group;
  diffuser: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
};

export function roundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius = 0.18,
): RoundedBoxGeometry {
  const smallestDimension = Math.min(width, height, depth);
  const safeRadius = Math.max(
    0.001,
    Math.min(radius, smallestDimension / 2 - 0.001),
  );
  return new RoundedBoxGeometry(width, height, depth, 3, safeRadius);
}

export function roundedRectangleGeometry(
  width: number,
  depth: number,
  radius: number,
): THREE.ShapeGeometry {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const corner = Math.min(radius, halfWidth * 0.48, halfDepth * 0.48);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + corner, -halfDepth);
  shape.lineTo(halfWidth - corner, -halfDepth);
  shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + corner);
  shape.lineTo(halfWidth, halfDepth - corner);
  shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - corner, halfDepth);
  shape.lineTo(-halfWidth + corner, halfDepth);
  shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - corner);
  shape.lineTo(-halfWidth, -halfDepth + corner);
  shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + corner, -halfDepth);
  const geometry = new THREE.ShapeGeometry(shape, 8);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function box(
  scene: THREE.Scene,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  options: { cast?: boolean; receive?: boolean; blocksActors?: boolean } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(roundedBoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = options.cast ?? true;
  mesh.receiveShadow = options.receive ?? true;
  mesh.userData.blocksActors = options.blocksActors ?? false;
  scene.add(mesh);
  return mesh;
}

export function addPlant(
  scene: THREE.Scene,
  x: number,
  z: number,
  scale = 1,
  green = "#557c62",
) {
  const plant = new THREE.Group();
  plant.userData.blocksActors = true;
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * scale, 0.22 * scale, 0.28 * scale, 9),
    new THREE.MeshStandardMaterial({ color: "#b28c67", roughness: 0.8 }),
  );
  pot.position.set(x, 0.14 * scale, z);
  plant.add(pot);
  const leaves = new THREE.Group();
  leaves.position.set(x, 0.35 * scale, z);
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: green,
    roughness: 0.86,
  });
  for (let index = 0; index < 7; index += 1) {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.11 * scale, 0.58 * scale, 5),
      leafMaterial,
    );
    const angle = (index / 7) * Math.PI * 2;
    leaf.position.set(
      Math.cos(angle) * 0.14 * scale,
      0.19 * scale,
      Math.sin(angle) * 0.14 * scale,
    );
    leaf.rotation.z = Math.cos(angle) * -0.4;
    leaf.rotation.x = Math.sin(angle) * 0.4;
    leaves.add(leaf);
  }
  const center = new THREE.Mesh(
    new THREE.ConeGeometry(0.13 * scale, 0.68 * scale, 6),
    leafMaterial,
  );
  center.position.y = 0.37 * scale;
  leaves.add(center);
  plant.add(leaves);
  scene.add(plant);
}

export function addInteriorLight(
  scene: THREE.Scene,
  x: number,
  z: number,
  intensity: number,
  enabled = true,
): InteriorLight {
  const fixture = new THREE.Group();
  fixture.position.set(x, 0, z);
  const metal = new THREE.MeshStandardMaterial({
    color: "#a88958",
    metalness: 0.58,
    roughness: 0.34,
  });
  const diffuser = new THREE.MeshStandardMaterial({
    color: "#fff1d2",
    emissive: "#c18a42",
    emissiveIntensity: 0.08,
    roughness: 0.3,
  });
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8),
    metal,
  );
  stem.position.y = 2.48;
  fixture.add(stem);
  const canopy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.42, 0.13, 24),
    metal,
  );
  canopy.position.y = 2.23;
  fixture.add(canopy);
  const lens = new THREE.Mesh(
    roundedBoxGeometry(0.56, 0.07, 0.56, 0.06),
    diffuser,
  );
  lens.position.y = 2.14;
  fixture.add(lens);
  const light = new THREE.PointLight("#ffd99c", intensity, 8.5, 1.5);
  light.position.y = 1.98;
  light.visible = enabled;
  fixture.add(light);
  scene.add(fixture);
  fixture.userData.diffuserMaterial = diffuser;
  return { fixture, diffuser, light };
}

export function updateRoomLabel(sprite: THREE.Sprite, name: string) {
  const updateLabel = sprite.userData.updateLabel;
  const material = sprite.material as THREE.SpriteMaterial;
  if (typeof updateLabel !== "function" || !(material.map instanceof THREE.Texture)) {
    return;
  }
  updateLabel(name);
  material.map.needsUpdate = true;
}

export function addAutomaticDoor(
  scene: THREE.Scene,
  x: number,
  z: number,
  orientation: AutomaticDoor["orientation"],
): AutomaticDoor {
  const horizontal = orientation === "horizontal";
  const leafWidth = 0.94;
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: "#52645c",
    metalness: 0.24,
    roughness: 0.42,
  });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: "#b8d2d6",
    transparent: true,
    opacity: 0.58,
    roughness: 0.2,
    metalness: 0.08,
  });
  const frameSize: [number, number, number] = horizontal
    ? [0.08, 2.325, 0.12]
    : [0.12, 2.325, 0.08];
  const headerSize: [number, number, number] = horizontal
    ? [1.9, 0.15, 0.14]
    : [0.14, 0.15, 1.9];
  const postOffsets = [-0.95, 0.95];
  for (const offset of postOffsets) {
    const position: [number, number, number] = horizontal
      ? [x + offset, 1.35, z]
      : [x, 1.35, z + offset];
    box(scene, frameSize, position, frameMaterial);
  }
  box(scene, headerSize, [x, 2.505, z], frameMaterial);

  const indicatorMaterial = new THREE.MeshStandardMaterial({
    color: "#74ad85",
    emissive: "#316744",
    emissiveIntensity: 0.55,
    roughness: 0.35,
  });
  const indicator = new THREE.Mesh(
    roundedBoxGeometry(horizontal ? 0.28 : 0.08, 0.055, horizontal ? 0.08 : 0.28),
    indicatorMaterial,
  );
  indicator.position.set(x, 2.64, z);
  scene.add(indicator);

  const panels = [-1, 1].map((side) => {
    const mesh = new THREE.Mesh(
      roundedBoxGeometry(
        horizontal ? leafWidth : 0.07,
        2.13,
        horizontal ? 0.07 : leafWidth,
        0.035,
      ),
      glassMaterial,
    );
    const offset = side * leafWidth * 0.48;
    const closed = new THREE.Vector3(
      horizontal ? x + offset : x,
      1.245,
      horizontal ? z : z + offset,
    );
    const open = new THREE.Vector3(
      horizontal ? x + side * leafWidth * 1.42 : x,
      1.245,
      horizontal ? z : z + side * leafWidth * 1.42,
    );
    mesh.position.copy(closed);
    mesh.castShadow = true;
    mesh.userData.automaticDoorPanel = true;
    scene.add(mesh);
    return {
      mesh,
      closed,
      open,
      halfWidth: horizontal ? leafWidth / 2 : 0.035,
      halfDepth: horizontal ? 0.035 : leafWidth / 2,
    };
  });

  return { x, z, orientation, openAmount: 0, panels, indicator };
}

export function addManualRestroomDoor(
  scene: THREE.Scene,
  x: number,
  z: number,
  hingeSide: -1 | 1,
): AutomaticDoor {
  const width = 0.82;
  const pivot = new THREE.Group();
  pivot.position.set(x + hingeSide * width / 2, 0.12, z);
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: "#725b43",
    roughness: 0.76,
    metalness: 0.04,
  });
  const leaf = new THREE.Mesh(
    roundedBoxGeometry(width, 2.06, 0.09, 0.035),
    doorMaterial,
  );
  leaf.position.set(-hingeSide * width / 2, 1.03, 0);
  leaf.castShadow = true;
  leaf.userData.manualDoor = true;
  pivot.add(leaf);

  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 8),
    new THREE.MeshStandardMaterial({
      color: "#c5a569",
      metalness: 0.68,
      roughness: 0.28,
    }),
  );
  handle.position.set(-hingeSide * width * 0.84, 1.05, 0.07);
  pivot.add(handle);
  scene.add(pivot);

  const closedY = 0;
  const openY = -hingeSide * (Math.PI / 2);
  return {
    x,
    z,
    orientation: "horizontal",
    manual: true,
    manualTargetOpen: false,
    openAmount: 0,
    panels: [
      {
        mesh: pivot,
        interactionObject: leaf,
        closed: pivot.position.clone(),
        open: pivot.position.clone(),
        halfWidth: width / 2,
        halfDepth: 0.045,
        swing: { closedY, openY },
      },
    ],
  };
}

export function addChair(
  scene: THREE.Scene,
  x: number,
  z: number,
  rotation = 0,
  color = "#7e9aa1",
  executive = false,
): THREE.Group {
  const group = new THREE.Group();
  group.userData.blocksActors = true;
  group.userData.collisionId = group.uuid;
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const chairMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.65,
  });
  const legMaterial = new THREE.MeshStandardMaterial({
    color: executive ? "#b4935c" : "#6c7270",
    metalness: executive ? 0.72 : 0.45,
    roughness: executive ? 0.28 : 0.42,
  });
  const seat = new THREE.Mesh(
    roundedBoxGeometry(executive ? 0.54 : 0.46, 0.12, executive ? 0.5 : 0.44, 0.055),
    chairMaterial,
  );
  seat.position.y = 0.46;
  group.add(seat);
  const back = new THREE.Mesh(
    roundedBoxGeometry(executive ? 0.56 : 0.44, executive ? 0.92 : 0.48, executive ? 0.14 : 0.1, 0.045),
    chairMaterial,
  );
  back.position.set(0, executive ? 1.02 : 0.72, -0.19);
  group.add(back);
  if (executive) {
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.075, 0.38, 12),
      legMaterial,
    );
    column.position.y = 0.2;
    group.add(column);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.29, 0.31, 0.07, 5),
      legMaterial,
    );
    base.position.y = 0.045;
    group.add(base);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(
        roundedBoxGeometry(0.09, 0.1, 0.42, 0.04),
        chairMaterial,
      );
      arm.position.set(side * 0.32, 0.76, -0.015);
      group.add(arm);
      const armSupport = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.03, 0.24, 8),
        legMaterial,
      );
      armSupport.position.set(side * 0.31, 0.62, 0.1);
      group.add(armSupport);
      const backSeam = new THREE.Mesh(
        roundedBoxGeometry(0.025, 0.62, 0.015, 0.007),
        legMaterial,
      );
      backSeam.position.set(side * 0.2, 1.02, -0.111);
      group.add(backSeam);
    }
    const crown = new THREE.Mesh(
      roundedBoxGeometry(0.34, 0.075, 0.15, 0.035),
      legMaterial,
    );
    crown.position.set(0, 1.43, -0.19);
    group.add(crown);
  } else {
    for (const xOffset of [-0.16, 0.16]) {
      for (const zOffset of [-0.13, 0.13]) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.028, 0.44, 6),
          legMaterial,
        );
        leg.position.set(xOffset, 0.22, zOffset);
        group.add(leg);
      }
    }
  }
  scene.add(group);
  return group;
}

export function addDesk(
  scene: THREE.Scene,
  x: number,
  z: number,
  width = 2,
  depth = 1.05,
  angle = 0,
  executive = false,
  conference = false,
  surfaceHeight = 0.97,
  includeDesk = true,
  towerXOffset = width * 0.37,
): Workstation | null {
  const group = new THREE.Group();
  group.userData.blocksActors = true;
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  const surfaceOffset = surfaceHeight - 0.97;
  const wood = new THREE.MeshStandardMaterial({
    color: executive ? "#765942" : "#c49b70",
    roughness: executive ? 0.42 : 0.64,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#6d5845",
    roughness: 0.75,
  });
  if (includeDesk) {
    const table = new THREE.Mesh(
      roundedBoxGeometry(width, 0.22, depth, 0.15),
      wood,
    );
    table.position.y = surfaceHeight - 0.11;
    group.add(table);
  }
  if (executive && includeDesk) {
    const inlay = new THREE.Mesh(
      roundedBoxGeometry(width * 0.94, 0.025, 0.035, 0.01),
      new THREE.MeshStandardMaterial({
        color: "#c6a463",
        metalness: 0.58,
        roughness: 0.32,
      }),
    );
    inlay.position.set(0, surfaceHeight + 0.015, depth * 0.42);
    group.add(inlay);
    const frontPanel = new THREE.Mesh(
      roundedBoxGeometry(width * 0.55, 0.42, 0.055, 0.025),
      dark,
    );
    frontPanel.position.set(0, 0.56, depth * 0.32);
    group.add(frontPanel);
  }
  if (includeDesk) {
    for (const xOffset of [-width * 0.41, width * 0.41]) {
      for (const zOffset of [-depth * 0.34, depth * 0.34]) {
        const leg = new THREE.Mesh(
          roundedBoxGeometry(0.1, 0.77, 0.1, 0.04),
          dark,
        );
        leg.position.set(xOffset, 0.39, zOffset);
        group.add(leg);
      }
    }
  }
  if (conference) {
    const tableRunner = new THREE.Mesh(
      roundedBoxGeometry(width * 0.78, 0.025, depth * 0.22, 0.01),
      new THREE.MeshStandardMaterial({
        color: "#405b52",
        roughness: 0.7,
      }),
    );
    tableRunner.position.set(0, 0.985, 0);
    group.add(tableRunner);
    const centerpiece = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.08, 12),
      new THREE.MeshStandardMaterial({
        color: "#c6a463",
        metalness: 0.48,
        roughness: 0.42,
      }),
    );
    centerpiece.position.y = 0.98;
    group.add(centerpiece);
    scene.add(group);
    return null;
  } else {
    const monitorWidth = THREE.MathUtils.clamp(width * 0.43, 0.58, 0.88);
    const monitorHeight = monitorWidth * 0.68;
    const monitorZ = -depth * 0.24;
    const monitorBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.16, 0.035, 16),
      dark,
    );
    monitorBase.position.set(0, 0.99 + surfaceOffset, monitorZ);
    group.add(monitorBase);
    const monitorStand = new THREE.Mesh(
      roundedBoxGeometry(0.075, 0.22, 0.075, 0.025),
      dark,
    );
    monitorStand.position.set(0, 1.095 + surfaceOffset, monitorZ);
    group.add(monitorStand);
    const monitorFrame = new THREE.Mesh(
      roundedBoxGeometry(
        monitorWidth + 0.08,
        monitorHeight + 0.08,
        0.075,
        0.045,
      ),
      new THREE.MeshStandardMaterial({
        color: executive ? "#252d30" : "#303b3c",
        roughness: 0.38,
        metalness: 0.12,
      }),
    );
    monitorFrame.position.set(0, 1.34 + surfaceOffset, monitorZ);
    group.add(monitorFrame);
    const displayCanvas = document.createElement("canvas");
    displayCanvas.width = 256;
    displayCanvas.height = 160;
    const displayContext = displayCanvas.getContext("2d");
    if (displayContext) {
      displayContext.fillStyle = "#18292b";
      displayContext.fillRect(0, 0, 256, 160);
      displayContext.fillStyle = "#24463e";
      displayContext.fillRect(0, 0, 256, 22);
      displayContext.fillStyle = "#a9d8bd";
      displayContext.fillRect(12, 10, 58, 3);
      displayContext.fillStyle = "#354c47";
      displayContext.fillRect(12, 34, 68, 112);
      displayContext.fillRect(88, 34, 156, 48);
      displayContext.fillRect(88, 90, 156, 56);
      displayContext.fillStyle = "#75b99a";
      displayContext.fillRect(22, 48, 42, 4);
      displayContext.fillRect(22, 62, 34, 3);
      displayContext.fillRect(22, 75, 47, 3);
      displayContext.fillRect(100, 48, 112, 5);
      displayContext.fillStyle = "#c5a569";
      displayContext.fillRect(100, 63, 76, 4);
      for (let index = 0; index < 6; index += 1) {
        displayContext.fillStyle = index % 2 ? "#75b99a" : "#c5a569";
        displayContext.fillRect(102 + index * 20, 128 - (index % 3) * 11, 10, 12 + (index % 3) * 11);
      }
    }
    const displayTexture = new THREE.CanvasTexture(displayCanvas);
    displayTexture.colorSpace = THREE.SRGBColorSpace;
    const screenMaterial = new THREE.MeshStandardMaterial({
      color: "#10191b",
      emissive: "#9bd8b2",
      emissiveMap: displayTexture,
      emissiveIntensity: 0,
      roughness: 0.28,
      metalness: 0.04,
    });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(monitorWidth, monitorHeight),
      screenMaterial,
    );
    screen.position.set(0, 1.34 + surfaceOffset, monitorZ + 0.039);
    group.add(screen);
    const bezelBadge = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 6),
      new THREE.MeshStandardMaterial({
        color: "#78928a",
        roughness: 0.5,
      }),
    );
    bezelBadge.position.set(0, 1.292 + surfaceOffset, monitorZ + 0.041);
    group.add(bezelBadge);

    const keyboard = new THREE.Mesh(
      roundedBoxGeometry(monitorWidth * 0.82, 0.045, 0.22, 0.025),
      new THREE.MeshStandardMaterial({
        color: "#333b3b",
        roughness: 0.64,
      }),
    );
    keyboard.position.set(0, 0.995 + surfaceOffset, depth * 0.22);
    group.add(keyboard);
    const keycapMaterial = new THREE.MeshStandardMaterial({
      color: "#b7c2b9",
      roughness: 0.72,
    });
    const keycaps: THREE.Mesh[] = [];
    const keyRows = [10, 9, 8];
    keyRows.forEach((keyCount, row) => {
      for (let key = 0; key < keyCount; key += 1) {
        const keycap = new THREE.Mesh(
          roundedBoxGeometry(0.033, 0.012, 0.026, 0.004),
          keycapMaterial,
        );
        const rowWidth = monitorWidth * 0.68;
        keycap.position.set(
          ((key + 0.5) / keyCount - 0.5) * rowWidth,
          1.023 + surfaceOffset,
          depth * 0.22 - 0.074 + row * 0.047,
        );
        keycap.userData.keyIndex = keycaps.length;
        keycaps.push(keycap);
        group.add(keycap);
      }
    });
    const spacebar = new THREE.Mesh(
      roundedBoxGeometry(monitorWidth * 0.28, 0.012, 0.025, 0.004),
      keycapMaterial,
    );
    spacebar.position.set(
      0,
      1.023 + surfaceOffset,
      depth * 0.22 + 0.08,
    );
    spacebar.userData.keyIndex = keycaps.length;
    keycaps.push(spacebar);
    group.add(spacebar);

    const mouse = new THREE.Group();
    const mouseShell = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 14, 10),
      new THREE.MeshStandardMaterial({
        color: "#394544",
        roughness: 0.42,
        metalness: 0.08,
      }),
    );
    mouseShell.scale.set(0.72, 0.34, 1.08);
    mouseShell.position.y = 1.015 + surfaceOffset;
    mouse.add(mouseShell);
    const mouseButton = new THREE.Mesh(
      roundedBoxGeometry(0.026, 0.008, 0.06, 0.004),
      new THREE.MeshStandardMaterial({
        color: "#aebbb2",
        roughness: 0.5,
      }),
    );
    mouseButton.position.set(0, 1.047 + surfaceOffset, -0.025);
    mouse.add(mouseButton);
    mouse.position.set(monitorWidth * 0.49, 0, depth * 0.22);
    group.add(mouse);

    const tower = new THREE.Mesh(
      roundedBoxGeometry(0.27, 0.66, 0.46, 0.045),
      new THREE.MeshStandardMaterial({
        color: "#303a3b",
        roughness: 0.58,
        metalness: 0.18,
      }),
    );
    tower.position.set(towerXOffset, 0.39, 0.04);
    group.add(tower);
    const towerFront = new THREE.Mesh(
      roundedBoxGeometry(0.19, 0.53, 0.025, 0.025),
      new THREE.MeshStandardMaterial({
        color: "#20292a",
        roughness: 0.56,
      }),
    );
    towerFront.position.set(towerXOffset, 0.39, 0.285);
    group.add(towerFront);
    const powerLightMaterial = new THREE.MeshStandardMaterial({
      color: "#4ed8a0",
      emissive: "#35d89a",
      emissiveIntensity: 0,
      roughness: 0.35,
    });
    const powerLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 10, 8),
      powerLightMaterial,
    );
    powerLight.position.set(towerXOffset + 0.065, 0.58, 0.302);
    group.add(powerLight);
    const towerVentMaterial = new THREE.MeshStandardMaterial({
      color: "#566365",
      roughness: 0.7,
    });
    for (let vent = 0; vent < 4; vent += 1) {
      const line = new THREE.Mesh(
        roundedBoxGeometry(0.11, 0.012, 0.008, 0.003),
        towerVentMaterial,
      );
      line.position.set(towerXOffset, 0.47 - vent * 0.045, 0.302);
      group.add(line);
    }
    const workstation = {
      group,
      screenMaterial,
      powerLightMaterial,
      keycaps,
      mouse,
      powerLevel: 0,
      transitionTime: 0,
    };
    group.userData.workstation = workstation;
    scene.add(group);
    return workstation;
  }
}

export function addSofa(
  scene: THREE.Scene,
  x: number,
  z: number,
  rotation = 0,
  color = "#78939a",
): THREE.Group {
  const group = new THREE.Group();
  group.userData.blocksActors = true;
  group.userData.collisionId = group.uuid;
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const upholstery = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
  });
  const base = new THREE.Mesh(
    roundedBoxGeometry(1.7, 0.38, 0.78, 0.16),
    upholstery,
  );
  base.position.y = 0.35;
  group.add(base);
  const back = new THREE.Mesh(
    roundedBoxGeometry(1.7, 0.62, 0.2, 0.09),
    upholstery,
  );
  back.position.set(0, 0.74, -0.28);
  group.add(back);
  for (const side of [-0.78, 0.78]) {
    const arm = new THREE.Mesh(
      roundedBoxGeometry(0.18, 0.5, 0.74, 0.08),
      upholstery,
    );
    arm.position.set(side, 0.48, 0);
    group.add(arm);
  }
  scene.add(group);
  return group;
}

export function addRoomLabel(
  scene: THREE.Scene,
  name: string,
  x: number,
  z: number,
  color = "#304b44",
): THREE.Sprite | null {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const drawLabel = (label: string) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(255,255,255,0.88)";
    context.beginPath();
    context.roundRect(8, 8, 496, 80, 18);
    context.fill();
    context.fillStyle = color;
    context.font = "600 34px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label.toUpperCase(), 256, 49);
  };
  drawLabel(name);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.1, 0.58, 1);
  sprite.position.set(x, 2.45, z);
  sprite.userData.sourceName = name;
  sprite.userData.updateLabel = drawLabel;
  scene.add(sprite);
  return sprite;
}

export function addAvatarLabel(member: OfficeMember, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(37,53,48,0.97)";
    context.beginPath();
    context.roundRect(8, 8, 496, 112, 28);
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 5;
    context.stroke();
    context.beginPath();
    context.arc(66, 64, 34, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.fillStyle = "#fff";
    context.font = "700 29px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(member.name.trim().slice(0, 1).toUpperCase(), 66, 64);
    context.fillStyle = "#fffdf7";
    context.font = "700 30px Segoe UI, sans-serif";
    context.textAlign = "left";
    context.fillText(member.name.trim().slice(0, 25), 116, 52);
    context.fillStyle = "#dfc99e";
    context.font = "600 20px Segoe UI, sans-serif";
    context.fillText(
      (member.position || member.username || "Workspace member").slice(0, 31),
      116,
      86,
    );
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (context && member.avatarUrl) {
    try {
      const avatarUrl = new URL(member.avatarUrl, window.location.origin);
      if (
        avatarUrl.protocol === "https:" ||
        avatarUrl.origin === window.location.origin
      ) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          context.save();
          context.beginPath();
          context.arc(66, 64, 32, 0, Math.PI * 2);
          context.clip();
          const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
          const cropX = (image.naturalWidth - cropSize) / 2;
          const cropY = (image.naturalHeight - cropSize) / 2;
          context.drawImage(
            image,
            cropX,
            cropY,
            cropSize,
            cropSize,
            34,
            32,
            64,
            64,
          );
          context.restore();
          texture.needsUpdate = true;
        };
        image.src = avatarUrl.toString();
      }
    } catch {
      // [ANH-CHAN-DUNG] Giữ ảnh chữ cái đại diện nếu URL ảnh hồ sơ không hợp lệ.
    }
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(2.45, 0.62, 1);
  sprite.position.y = 2.25;
  return sprite;
}

export function colorForMember(id: string): string {
  let hash = 0;
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return new THREE.Color().setHSL((Math.abs(hash) % 360) / 360, 0.34, 0.49).getStyle();
}

export function shuffleItems<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}
