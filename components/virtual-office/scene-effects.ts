import * as THREE from "three";
import {
  createRiderPerson,
  updateRiderPersonAnimation,
  type Actor,
  type RiderPersonRig,
} from "./actor";
import { riderActionSets } from "@/lib/office-actor-actions";
import { roundedBoxGeometry } from "./interior";
import {
  getMotorcycleManeuver,
  getTrafficSpeeds,
  movementSpeedMultiplier,
  type MotorcycleManeuver,
  type MotorcycleObstacleState,
  type TrafficVehicleState,
} from "@/lib/office-traffic";
import { getFlashIntensity } from "@/lib/office-animation";

export { movementSpeedMultiplier };

export type RoadVehicle = {
  group: THREE.Group;
  opacityMaterials: THREE.Material[];
  route: THREE.CatmullRomCurve3;
  model: "sedan" | "pickup" | "truck";
  laneId: string;
  routeLength: number;
  progress: number;
  speed: number;
  maxSpeed: number;
  respawnTime: number;
  headlights: THREE.SpotLight[];
  headlightMaterials: THREE.MeshStandardMaterial[];
  positionScratch: THREE.Vector3;
  directionScratch: THREE.Vector3;
};

export type RoadMotorcycle = {
  group: THREE.Group;
  rider: RiderPersonRig;
  policeGroup: THREE.Group;
  policeRider: RiderPersonRig;
  policePassenger: RiderPersonRig;
  opacityMaterials: THREE.Material[];
  policeOpacityMaterials: THREE.Material[];
  route: THREE.CatmullRomCurve3;
  trafficRoute: THREE.CatmullRomCurve3;
  laneId: string;
  routeLength: number;
  progress: number;
  speed: number;
  maxSpeed: number;
  respawnTime: number;
  adminSummoned: boolean;
  summonedAt: number;
  tuned: boolean;
  laneOffset: number;
  headlight: THREE.SpotLight;
  headlightMaterial: THREE.MeshStandardMaterial;
  tunedLightMaterials: THREE.MeshStandardMaterial[];
  policeLightMaterials: THREE.MeshStandardMaterial[];
  tunedLights: THREE.PointLight[];
  policeLights: THREE.PointLight[];
  laneCenterZ: number;
  maneuverScratch: MotorcycleManeuver;
  routePositionScratch: THREE.Vector3;
  routeDirectionScratch: THREE.Vector3;
  positionScratch: THREE.Vector3;
  policePositionScratch: THREE.Vector3;
  policeDirectionScratch: THREE.Vector3;
};

export type DeliveryShipper = {
  group: THREE.Group;
  rider: THREE.Group;
  riderUpperBody: THREE.Group;
  riderHead: THREE.Group;
  riderArms: THREE.Group[];
  riderLowerArms: THREE.Group[];
  riderLegs: THREE.Group[];
  riderLowerLegs: THREE.Group[];
  package: THREE.Mesh;
  packageInTransfer: boolean;
  packageHandedOff: boolean;
  packageStartPosition: THREE.Vector3;
  packageTargetPosition: THREE.Vector3;
  phone: THREE.Mesh;
  headlight: THREE.SpotLight;
  headlightMaterial: THREE.MeshStandardMaterial;
  kickstand: THREE.Mesh;
  opacityMaterials: THREE.Material[];
  approachRoute: THREE.CatmullRomCurve3;
  approachRouteLength: number;
  departureRoute: THREE.CatmullRomCurve3;
  departureRouteLength: number;
  phase:
    | "idle"
    | "actor_call"
    | "communication_wait"
    | "approaching"
    | "calling"
    | "waiting_actor"
    | "pickup"
    | "mounting"
    | "departing";
  progress: number;
  waitTime: number;
  retryTime: number;
  respawnTime: number;
  recipient: Actor | null;
};

export type CleaningServiceVehicle = {
  group: THREE.Group;
  route: THREE.CatmullRomCurve3;
  routeLength: number;
  progress: number;
  speed: number;
  wheels: THREE.Mesh[];
  motorbike: boolean;
};

export type RoadsideLight = {
  fixture: THREE.Group;
  lamp: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  light: THREE.SpotLight;
};

export type ExteriorWall = {
  material: THREE.MeshStandardMaterial;
  normal: THREE.Vector3;
};

export type FlyingBird = {
  group: THREE.Group;
  opacityMaterials: THREE.Material[];
  wings: [THREE.Group, THREE.Group];
  route: THREE.CatmullRomCurve3;
  progress: number;
  speed: number;
  phase: number;
  respawnTime: number;
  segmentsRemaining: number;
  exiting: boolean;
  positionScratch: THREE.Vector3;
  directionScratch: THREE.Vector3;
};

export const officeWidth = 22;

export const officeDepth = 16;

export function progressOpacity(progress: number, fadeInEnd: number, fadeOutStart: number) {
  return (
    THREE.MathUtils.smoothstep(progress, 0, fadeInEnd) *
    (1 - THREE.MathUtils.smoothstep(progress, fadeOutStart, 1))
  );
}

export function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function randomBirdPosition() {
  return new THREE.Vector3(
    randomBetween(-78, 78),
    randomBetween(10, 21),
    randomBetween(-38, 14),
  );
}

export function randomSummonedBirdApproach() {
  const start = new THREE.Vector3(
    randomBetween(-officeWidth / 2 - 5, officeWidth / 2 + 5),
    randomBetween(8, 12),
    randomBetween(-officeDepth / 2 - 5, officeDepth / 2 + 5),
  );
  const fromXEdge = Math.random() < 0.5;
  if (fromXEdge) {
    start.x = (Math.random() < 0.5 ? -1 : 1) * (officeWidth / 2 + 5);
  } else {
    start.z = (Math.random() < 0.5 ? -1 : 1) * (officeDepth / 2 + 5);
  }
  const heading = new THREE.Vector3(
    -start.x + randomBetween(-3, 3),
    randomBetween(-0.15, 0.15),
    -start.z + randomBetween(-3, 3),
  ).normalize();
  return { start, heading };
}

export function createBirdFlightRoute(
  start: THREE.Vector3,
  heading: THREE.Vector3,
  exiting = false,
  distanceOverride?: number,
) {
  const direction = heading.clone().normalize();
  const distance = exiting ? 160 : distanceOverride ?? randomBetween(18, 30);
  const end = start.clone().addScaledVector(direction, distance);
  const controlOne = start
    .clone()
    .addScaledVector(direction, distance / 3);
  const controlTwo = end
    .clone()
    .addScaledVector(direction, -distance / 3);

  return new THREE.CatmullRomCurve3(
    [start.clone(), controlOne, controlTwo, end],
    false,
    "centripetal",
  );
}

export function addLandscapeTree(
  scene: THREE.Scene,
  x: number,
  z: number,
  scale = 1,
  foliageColor = "#587b61",
): THREE.Group {
  const tree = new THREE.Group();
  tree.position.set(x, -0.54, z);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: "#806248",
    roughness: 0.92,
  });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13 * scale, 0.2 * scale, 1.5 * scale, 8),
    trunkMaterial,
  );
  trunk.position.y = 0.75 * scale;
  tree.add(trunk);
  const foliage = new THREE.MeshStandardMaterial({
    color: foliageColor,
    roughness: 0.9,
  });
  for (const [height, size] of [
    [1.35, 0.88],
    [1.95, 0.68],
    [2.45, 0.46],
  ]) {
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(size * scale, 1),
      foliage,
    );
    crown.position.set(0, height * scale, 0);
    crown.scale.set(1, 1.15, 1);
    tree.add(crown);
  }
  scene.add(tree);
  return tree;
}

export function createRoadVehicle(
  scene: THREE.Scene,
  color: string,
  route: THREE.CatmullRomCurve3,
  laneId: string,
  maxSpeed: number,
  model: RoadVehicle["model"] = "sedan",
): RoadVehicle {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.24,
    roughness: 0.38,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: "#b9d1d1",
    metalness: 0.1,
    roughness: 0.24,
  });
  const isTruck = model === "truck";
  const isPickup = model === "pickup";
  const bodyLength = isTruck ? 2.45 : isPickup ? 2.2 : 1.9;
  const wheelbase = isTruck ? 0.86 : isPickup ? 0.73 : 0.58;
  const frontZ = -bodyLength * 0.46;
  const rearZ = bodyLength * 0.46;
  const body = new THREE.Mesh(
    roundedBoxGeometry(
      isTruck ? 1.08 : 1.05,
      isTruck ? 0.4 : 0.34,
      bodyLength,
      isTruck ? 0.1 : 0.12,
    ),
    paint,
  );
  body.position.y = isTruck ? 0.38 : 0.34;
  group.add(body);
  const cabin = new THREE.Mesh(
    roundedBoxGeometry(
      isTruck ? 0.88 : 0.82,
      isTruck ? 0.55 : isPickup ? 0.42 : 0.38,
      isTruck ? 0.82 : isPickup ? 0.78 : 0.9,
      0.12,
    ),
    glass,
  );
  cabin.position.set(0, isTruck ? 0.82 : 0.68, isTruck ? -0.62 : isPickup ? -0.48 : -0.12);
  group.add(cabin);
  if (isPickup) {
    const bedFloor = new THREE.Mesh(
      roundedBoxGeometry(0.78, 0.09, 0.67, 0.025),
      paint,
    );
    bedFloor.position.set(0, 0.57, 0.58);
    group.add(bedFloor);
    for (const x of [-0.43, 0.43]) {
      const rail = new THREE.Mesh(
        roundedBoxGeometry(0.09, 0.23, 0.72, 0.025),
        paint,
      );
      rail.position.set(x, 0.68, 0.58);
      group.add(rail);
    }
  } else if (isTruck) {
    const cargoBody = new THREE.MeshStandardMaterial({
      color: "#e5e3db",
      roughness: 0.7,
    });
    const cargoBox = new THREE.Mesh(
      roundedBoxGeometry(1.02, 0.76, 1.2, 0.08),
      cargoBody,
    );
    cargoBox.position.set(0, 0.91, 0.52);
    group.add(cargoBox);
    const cargoStripe = new THREE.Mesh(
      roundedBoxGeometry(1.035, 0.09, 0.82, 0.025),
      paint,
    );
    cargoStripe.position.set(0, 0.76, 0.54);
    group.add(cargoStripe);
  }
  const bumperMaterial = new THREE.MeshStandardMaterial({
    color: "#4b514d",
    metalness: 0.35,
    roughness: 0.48,
  });
  const headlightMaterials: THREE.MeshStandardMaterial[] = [];
  for (const z of [frontZ, rearZ]) {
    const bumper = new THREE.Mesh(
      roundedBoxGeometry(isTruck ? 1.12 : 1.08, 0.13, 0.12, 0.05),
      bumperMaterial,
    );
    bumper.position.set(0, 0.24, z);
    group.add(bumper);
    for (const x of [-0.34, 0.34]) {
      const isHeadlight = z < 0;
      const material = new THREE.MeshStandardMaterial({
        color: isHeadlight ? "#fff2c7" : "#b7564c",
        emissive: isHeadlight ? "#fff0bc" : "#48130f",
        emissiveIntensity: isHeadlight ? 0 : 0.18,
        roughness: 0.3,
      });
      if (isHeadlight) headlightMaterials.push(material);
      const light = new THREE.Mesh(
        roundedBoxGeometry(0.18, 0.09, 0.035, 0.014),
        material,
      );
      light.position.set(x, 0.35, z + (z < 0 ? -0.07 : 0.07));
      group.add(light);
    }
  }
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: "#242a28",
    roughness: 0.86,
  });
  for (const x of [-0.53, 0.53]) {
    for (const z of [-wheelbase, wheelbase]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12),
        wheelMaterial,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.23, z);
      group.add(wheel);
    }
  }
  const headlights = [-0.34, 0.34].map((x) => {
    const spot = new THREE.SpotLight("#ffe6b0", 0, 44, 0.32, 0.86, 1.1);
    spot.position.set(x, 0.43, frontZ - 0.04);
    spot.target.position.set(x, 0.08, -26);
    group.add(spot);
    group.add(spot.target);
    return spot;
  });
  group.scale.set(isTruck ? 1.3 : 1.34, isTruck ? 1.28 : 1.24, isTruck ? 1.5 : 1.34);
  group.visible = false;
  const opacityMaterials: THREE.Material[] = [];
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      material.transparent = true;
      material.depthWrite = false;
      opacityMaterials.push(material);
    }
  });
  scene.add(group);
  return {
    group,
    opacityMaterials,
    route,
    model,
    laneId,
    routeLength: route.getLength(),
    progress: 0,
    speed: maxSpeed,
    maxSpeed,
    respawnTime: 0,
    headlights,
    headlightMaterials,
    positionScratch: new THREE.Vector3(),
    directionScratch: new THREE.Vector3(),
  };
}

export function createRoadMotorcycle(
  scene: THREE.Scene,
  route: THREE.CatmullRomCurve3,
  laneId: string,
): RoadMotorcycle {
  const group = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({
    color: "#2b3433",
    metalness: 0.52,
    roughness: 0.36,
    emissive: "#121918",
  });
  const bodyPaint = new THREE.MeshStandardMaterial({
    color: ["#354a50", "#5a4a39", "#3c4148"][Math.floor(Math.random() * 3)],
    metalness: 0.38,
    roughness: 0.3,
  });
  const tire = new THREE.MeshStandardMaterial({
    color: "#171b1b",
    roughness: 0.82,
  });
  for (const z of [-0.58, 0.58]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14),
      tire,
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.2, z);
    group.add(wheel);
  }
  const chassis = new THREE.Mesh(
    roundedBoxGeometry(0.22, 0.22, 0.92, 0.08),
    frame,
  );
  chassis.position.set(0, 0.45, 0.02);
  group.add(chassis);
  const fairing = new THREE.Mesh(
    roundedBoxGeometry(0.48, 0.28, 0.46, 0.13),
    bodyPaint,
  );
  fairing.position.set(0, 0.52, -0.26);
  group.add(fairing);
  const seat = new THREE.Mesh(
    roundedBoxGeometry(0.27, 0.09, 0.48, 0.04),
    tire,
  );
  seat.position.set(0, 0.58, 0.26);
  group.add(seat);
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: "#fff1bd",
    emissive: "#ffe6a1",
    emissiveIntensity: 0.2,
    roughness: 0.2,
  });
  const headlamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 12, 10),
    headlightMaterial,
  );
  headlamp.position.set(0, 0.58, -0.5);
  group.add(headlamp);
  const headlight = new THREE.SpotLight(
    "#ffe7ad",
    0,
    34,
    Math.PI / 5,
    0.76,
    1.1,
  );
  headlight.position.set(0, 0.62, -0.54);
  headlight.target.position.set(0, 0.08, -22);
  group.add(headlight, headlight.target);
  const rider = createRiderPerson(group, "motorcyclist", 0.04, true);
  const tunedLightMaterials: THREE.MeshStandardMaterial[] = [];
  for (const [index, color] of ["#e8495c", "#4385e8", "#a548d0", "#f0c64c"].entries()) {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.15,
      roughness: 0.22,
    });
    tunedLightMaterials.push(material);
    const lightBar = new THREE.Mesh(
      roundedBoxGeometry(0.12, 0.055, 0.06, 0.02),
      material,
    );
    lightBar.position.set(index % 2 ? 0.17 : -0.17, 0.68, index < 2 ? -0.43 : 0.43);
    group.add(lightBar);
  }
  const tunedLights = ["#e8495c", "#4385e8"].map((color, index) => {
    const light = new THREE.PointLight(color, 0, 5, 2);
    light.position.set(index ? 0.17 : -0.17, 0.68, -0.43);
    group.add(light);
    return light;
  });

  const policeGroup = new THREE.Group();
  const policeFrame = new THREE.MeshStandardMaterial({
    color: "#1d2c37",
    metalness: 0.42,
    roughness: 0.34,
  });
  const policeBody = new THREE.Mesh(
    roundedBoxGeometry(0.46, 0.27, 0.54, 0.12),
    policeFrame,
  );
  policeBody.position.set(0, 0.5, -0.2);
  policeGroup.add(policeBody);
  for (const z of [-0.56, 0.56]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14),
      tire,
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.2, z);
    policeGroup.add(wheel);
  }
  const policeRider = createRiderPerson(policeGroup, "police", 0.1);
  const policePassenger = createRiderPerson(
    policeGroup,
    "police",
    0.4,
    true,
  );
  const policeLightMaterials: THREE.MeshStandardMaterial[] = [];
  const policeLights: THREE.PointLight[] = [];
  for (const [index, color] of ["#ff263f", "#3184ff"].entries()) {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.15,
      roughness: 0.2,
    });
    policeLightMaterials.push(material);
    const beacon = new THREE.Mesh(
      roundedBoxGeometry(0.15, 0.075, 0.085, 0.025),
      material,
    );
    beacon.position.set(index ? 0.11 : -0.11, 0.77, -0.1);
    policeGroup.add(beacon);
    const light = new THREE.PointLight(color, 0, 7, 2);
    light.position.copy(beacon.position);
    policeGroup.add(light);
    policeLights.push(light);
  }
  scene.add(group, policeGroup);
  policeGroup.visible = false;
  const opacityMaterials: THREE.Material[] = [];
  const policeOpacityMaterials: THREE.Material[] = [];
  const collectMaterials = (target: THREE.Group, output: THREE.Material[]) => {
    target.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        material.transparent = true;
        material.depthWrite = false;
        output.push(material);
      }
    });
  };
  collectMaterials(group, opacityMaterials);
  collectMaterials(policeGroup, policeOpacityMaterials);
  return {
    group,
    rider,
    policeGroup,
    policeRider,
    policePassenger,
    opacityMaterials,
    policeOpacityMaterials,
    route,
    trafficRoute: route,
    laneId,
    routeLength: route.getLength(),
    progress: 0,
    speed: 0,
    maxSpeed: 0,
    respawnTime: 2 + Math.random() * 12,
    adminSummoned: false,
    summonedAt: 0,
    tuned: false,
    laneOffset: 0,
    headlight,
    headlightMaterial,
    tunedLightMaterials,
    policeLightMaterials,
    tunedLights,
    policeLights,
    laneCenterZ: route.getPointAt(0).z,
    maneuverScratch: { laneOffset: 0, speedFactor: 1 },
    routePositionScratch: new THREE.Vector3(),
    routeDirectionScratch: new THREE.Vector3(),
    positionScratch: new THREE.Vector3(),
    policePositionScratch: new THREE.Vector3(),
    policeDirectionScratch: new THREE.Vector3(),
  };
}

export function updateMotorcycleEmergencyLights(
  motorcycle: RoadMotorcycle,
  elapsed: number,
  includeUntuned = false,
) {
  const opacity = motorcycle.opacityMaterials[0]?.opacity ?? 1;
  for (let index = 0; index < motorcycle.tunedLightMaterials.length; index += 1) {
    const active =
      (motorcycle.tuned || includeUntuned) && motorcycle.group.visible;
    const intensity = getFlashIntensity(elapsed, index, 9, 0.1);
    motorcycle.tunedLightMaterials[index].emissiveIntensity = active
      ? intensity * opacity
      : 0.15;
    if (index < motorcycle.tunedLights.length) {
      motorcycle.tunedLights[index].intensity =
        active && intensity > 0.1 ? 16 * opacity : 0;
    }
  }

  const policeOpacity =
    motorcycle.policeOpacityMaterials[0]?.opacity ?? 1;
  const policeActive = motorcycle.policeGroup.visible;
  for (let index = 0; index < motorcycle.policeLightMaterials.length; index += 1) {
    const intensity = getFlashIntensity(elapsed, index, 12, 0.1);
    motorcycle.policeLightMaterials[index].emissiveIntensity = policeActive
      ? intensity * policeOpacity
      : 0.15;
    motorcycle.policeLights[index].intensity =
      policeActive && intensity > 0.1 ? 26 * policeOpacity : 0;
  }
}

export function updateRoadMotorcycles(
  motorcycles: RoadMotorcycle[],
  trafficStates: TrafficVehicleState[],
  adminRequests: boolean[],
  shipperObstacle: MotorcycleObstacleState,
  delta: number,
  night: number,
  elapsed: number,
) {
  let dispatchOrder = 0;
  while (adminRequests.length > 0) {
    const motorcycle =
      motorcycles.find((candidate) => !candidate.adminSummoned) ??
      motorcycles.reduce((oldest, candidate) =>
        candidate.summonedAt < oldest.summonedAt ? candidate : oldest,
      );
    motorcycle.adminSummoned = true;
    motorcycle.tuned = adminRequests.shift() ?? false;
    motorcycle.summonedAt = elapsed + dispatchOrder * 0.001;
    dispatchOrder += 1;
    motorcycle.maxSpeed = motorcycle.tuned
      ? 5.8 + Math.random() * 0.5
      : 4.1 + Math.random() * 0.55;
    motorcycle.speed = motorcycle.maxSpeed;
    const routeStart = motorcycle.trafficRoute.getPointAt(
      0,
      motorcycle.routePositionScratch,
    );
    const routeEnd = motorcycle.trafficRoute.getPointAt(
      1,
      new THREE.Vector3(),
    );
    const route = new THREE.CatmullRomCurve3([
      new THREE.Vector3(routeStart.x, routeStart.y, routeStart.z),
      new THREE.Vector3(routeEnd.x, routeEnd.y, routeEnd.z),
    ]);
    motorcycle.route = route;
    motorcycle.routeLength = route.getLength();
    motorcycle.progress = 0;
    motorcycle.laneOffset = 0;
    motorcycle.group.visible = true;
    motorcycle.policeGroup.visible = false;
    motorcycle.group.position.copy(
      route.getPointAt(0, motorcycle.positionScratch),
    );
    motorcycle.opacityMaterials.forEach((material) => {
      material.opacity = 0;
    });
  }
  for (const motorcycle of motorcycles) {
    if (
      night < 0.55 &&
      !motorcycle.adminSummoned &&
      adminRequests.length === 0
    ) {
      motorcycle.group.visible = false;
      motorcycle.policeGroup.visible = false;
      motorcycle.respawnTime = 3 + Math.random() * 8;
      continue;
    }
    if (!motorcycle.group.visible) {
      motorcycle.respawnTime -= delta;
      if (motorcycle.respawnTime > 0) continue;
      motorcycle.adminSummoned = false;
      motorcycle.tuned = Math.random() < 0.025;
      motorcycle.maxSpeed = motorcycle.tuned
        ? 5.8 + Math.random() * 0.5
        : 4.1 + Math.random() * 0.55;
      motorcycle.speed = motorcycle.maxSpeed;
      motorcycle.route = motorcycle.trafficRoute;
      motorcycle.routeLength = motorcycle.trafficRoute.getLength();
      motorcycle.progress = 0;
      motorcycle.laneOffset = 0;
      motorcycle.group.visible = true;
      motorcycle.policeGroup.visible = false;
    }

    const direction = motorcycle.route
      .getTangentAt(motorcycle.progress, motorcycle.routeDirectionScratch)
      .normalize();
    const routePosition = motorcycle.route.getPointAt(
      motorcycle.progress,
      motorcycle.routePositionScratch,
    );
    const maneuver = getMotorcycleManeuver(
      trafficStates,
      routePosition.x,
      motorcycle.laneCenterZ,
      direction.x >= 0 ? 1 : -1,
      motorcycle.laneOffset,
      motorcycle.tuned,
      shipperObstacle,
      motorcycle.maneuverScratch,
    );
    motorcycle.speed = THREE.MathUtils.damp(
      motorcycle.speed,
      motorcycle.maxSpeed * maneuver.speedFactor,
      3,
      delta,
    );
    motorcycle.laneOffset = THREE.MathUtils.damp(
      motorcycle.laneOffset,
      maneuver.laneOffset,
      3,
      delta,
    );
    motorcycle.progress +=
      (motorcycle.speed * movementSpeedMultiplier * delta) /
      motorcycle.routeLength;
    if (motorcycle.progress >= 1) {
      motorcycle.group.visible = false;
      motorcycle.policeGroup.visible = false;
      motorcycle.adminSummoned = false;
      motorcycle.respawnTime = 3 + Math.random() * 14;
      motorcycle.route = motorcycle.trafficRoute;
      motorcycle.routeLength = motorcycle.trafficRoute.getLength();
      continue;
    }

    const opacity = progressOpacity(motorcycle.progress, 0.07, 0.9);
    const position = motorcycle.route.getPointAt(
      motorcycle.progress,
      motorcycle.positionScratch,
    );
    position.z += motorcycle.laneOffset;
    motorcycle.group.position.copy(position);
    motorcycle.group.rotation.y = Math.atan2(-direction.x, -direction.z);
    motorcycle.headlight.intensity = night * 55 * opacity;
    motorcycle.headlightMaterial.emissiveIntensity = night * 2.8 * opacity;
    motorcycle.opacityMaterials.forEach((material) => {
      material.opacity = opacity;
    });
    if (motorcycle.tuned) {
      if (motorcycle.progress * motorcycle.routeLength > 9) {
        motorcycle.policeGroup.visible = true;
        const policeProgress = Math.max(
          0,
          motorcycle.progress - 8 / motorcycle.routeLength,
        );
        const policePosition = motorcycle.route.getPointAt(
          policeProgress,
          motorcycle.policePositionScratch,
        );
        policePosition.z += motorcycle.laneOffset;
        const policeDirection = motorcycle.route
          .getTangentAt(policeProgress, motorcycle.policeDirectionScratch)
          .normalize();
        motorcycle.policeGroup.position.copy(policePosition);
        motorcycle.policeGroup.rotation.y = Math.atan2(
          -policeDirection.x,
          -policeDirection.z,
        );
        motorcycle.policeOpacityMaterials.forEach((material) => {
          material.opacity = opacity;
        });
      } else {
        motorcycle.policeGroup.visible = false;
      }
    }
    const activeRiderActions = motorcycle.tuned
      ? riderActionSets.police
      : riderActionSets.motorcyclist;
    const riderActionIndex =
      Math.floor(elapsed / 3.8 + Math.abs(motorcycle.laneCenterZ) * 0.17) %
      activeRiderActions.length;
    updateRiderPersonAnimation(
      motorcycle.rider,
      activeRiderActions[riderActionIndex],
      elapsed,
      delta,
    );
    const policeActionIndex =
      Math.floor(elapsed / 4.5 + Math.abs(motorcycle.laneCenterZ) * 0.13) %
      riderActionSets.police.length;
    updateRiderPersonAnimation(
      motorcycle.policeRider,
      riderActionSets.police[policeActionIndex],
      elapsed,
      delta,
    );
    updateRiderPersonAnimation(
      motorcycle.policePassenger,
      "passenger",
      elapsed + 0.8,
      delta,
    );
    updateMotorcycleEmergencyLights(motorcycle, elapsed);
  }
}

export function createCleaningServiceVehicle(
  scene: THREE.Scene,
  route: THREE.CatmullRomCurve3,
  motorbike: boolean,
): CleaningServiceVehicle {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: motorbike ? "#28675d" : "#334b45",
    metalness: 0.42,
    roughness: 0.38,
  });
  const steelMaterial = new THREE.MeshStandardMaterial({
    color: "#b7c1bc",
    metalness: 0.72,
    roughness: 0.28,
  });
  const tireMaterial = new THREE.MeshStandardMaterial({
    color: "#202627",
    roughness: 0.82,
  });
  const wheelRadius = motorbike ? 0.24 : 0.19;
  const wheelZ = [-0.62, 0.55];
  const wheels = wheelZ.map((z) => {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.11, 16),
      tireMaterial,
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, wheelRadius, z);
    group.add(wheel);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(wheelRadius * 0.62, 0.018, 6, 18),
      steelMaterial,
    );
    rim.position.set(0.06, wheelRadius, z);
    group.add(rim);
    return wheel;
  });
  const addFrameTube = (
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius = 0.035,
    material = frameMaterial,
  ) => {
    const difference = end.clone().sub(start);
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, difference.length(), 8),
      material,
    );
    tube.position.copy(start).add(end).multiplyScalar(0.5);
    tube.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      difference.normalize(),
    );
    group.add(tube);
  };
  const rear = new THREE.Vector3(0, wheelRadius, 0.55);
  const crank = new THREE.Vector3(0, 0.32, 0.02);
  const head = new THREE.Vector3(0, 0.61, -0.48);
  const front = new THREE.Vector3(0, wheelRadius, -0.62);
  const seat = new THREE.Vector3(0, 0.72, 0.38);
  addFrameTube(rear, crank);
  addFrameTube(crank, head);
  addFrameTube(head, front, 0.026, steelMaterial);
  addFrameTube(crank, rear);
  addFrameTube(rear, seat, 0.025, steelMaterial);
  addFrameTube(seat, crank);
  addFrameTube(seat, new THREE.Vector3(0, 0.58, 0.34), 0.028, steelMaterial);
  const saddle = new THREE.Mesh(
    roundedBoxGeometry(0.28, 0.08, 0.22, 0.035),
    tireMaterial,
  );
  saddle.position.set(0, 0.76, 0.36);
  group.add(saddle);
  const handlebar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.026, 0.52, 8),
    steelMaterial,
  );
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 0.69, -0.5);
  group.add(handlebar);
  if (motorbike) {
    const engine = new THREE.Mesh(
      roundedBoxGeometry(0.3, 0.32, 0.36, 0.08),
      new THREE.MeshStandardMaterial({
        color: "#58625e",
        metalness: 0.58,
        roughness: 0.38,
      }),
    );
    engine.position.set(0, 0.39, 0.02);
    group.add(engine);
    const fairing = new THREE.Mesh(
      roundedBoxGeometry(0.48, 0.38, 0.42, 0.1),
      frameMaterial,
    );
    fairing.position.set(0, 0.61, -0.35);
    group.add(fairing);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 8),
      new THREE.MeshStandardMaterial({
        color: "#fff1bd",
        emissive: "#ffd975",
        emissiveIntensity: 0.42,
        roughness: 0.25,
      }),
    );
    lamp.position.set(0, 0.68, -0.57);
    group.add(lamp);
  } else {
    const pedalAxle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.26, 10),
      steelMaterial,
    );
    pedalAxle.rotation.z = Math.PI / 2;
    pedalAxle.position.copy(crank);
    group.add(pedalAxle);
    const basket = new THREE.Mesh(
      roundedBoxGeometry(0.44, 0.24, 0.3, 0.045),
      new THREE.MeshStandardMaterial({
        color: "#d0b77d",
        roughness: 0.82,
        metalness: 0.06,
      }),
    );
    basket.position.set(0, 0.82, -0.51);
    group.add(basket);
    for (const x of [-0.2, 0.2]) {
      const brace = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.31, 6),
        steelMaterial,
      );
      brace.position.set(x, 0.66, -0.51);
      group.add(brace);
    }
  }
  const rearRack = new THREE.Mesh(
    roundedBoxGeometry(0.34, 0.045, 0.34, 0.02),
    steelMaterial,
  );
  rearRack.position.set(0, 0.69, 0.59);
  group.add(rearRack);
  const kickstand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.02, 0.42, 6),
    steelMaterial,
  );
  kickstand.position.set(-0.2, 0.18, 0.36);
  kickstand.rotation.z = -0.58;
  group.add(kickstand);
  scene.add(group);
  group.visible = false;
  return {
    group,
    route,
    routeLength: route.getLength(),
    progress: 0,
    speed: motorbike ? 4.2 : 2.7,
    wheels,
    motorbike,
  };
}

export function moveCleaningServiceVehicle(
  vehicle: CleaningServiceVehicle,
  delta: number,
  direction: 1 | -1,
): boolean {
  vehicle.progress = THREE.MathUtils.clamp(
    vehicle.progress +
      (direction * vehicle.speed * movementSpeedMultiplier * delta) /
        vehicle.routeLength,
    0,
    1,
  );
  const position = vehicle.route.getPointAt(vehicle.progress);
  const tangent = vehicle.route.getTangentAt(vehicle.progress);
  if (direction === -1) tangent.negate();
  vehicle.group.position.copy(position);
  vehicle.group.rotation.y = Math.atan2(-tangent.x, -tangent.z);
  for (const wheel of vehicle.wheels) {
    wheel.rotation.x += direction * delta * vehicle.speed / 0.2;
  }
  return direction === 1
    ? vehicle.progress >= 1
    : vehicle.progress <= 0;
}

export function createDeliveryShipper(
  scene: THREE.Scene,
  approachRoute: THREE.CatmullRomCurve3,
  departureRoute: THREE.CatmullRomCurve3,
): DeliveryShipper {
  const group = new THREE.Group();
  const bikePaint = new THREE.MeshStandardMaterial({
    color: "#b44e3f",
    metalness: 0.18,
    roughness: 0.52,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: "#303738",
    roughness: 0.78,
  });
  const steelMaterial = new THREE.MeshStandardMaterial({
    color: "#a9b0ad",
    metalness: 0.72,
    roughness: 0.28,
  });
  const rearWheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.27, 0.16, 18),
    darkMaterial,
  );
  rearWheel.rotation.z = Math.PI / 2;
  rearWheel.position.set(0, 0.28, 0.55);
  group.add(rearWheel);
  const frontWheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.14, 18),
    darkMaterial,
  );
  frontWheel.rotation.z = Math.PI / 2;
  frontWheel.position.set(0, 0.26, -0.68);
  group.add(frontWheel);
  const frame = new THREE.Mesh(
    roundedBoxGeometry(0.34, 0.2, 0.9, 0.1),
    bikePaint,
  );
  frame.position.set(0, 0.48, -0.02);
  group.add(frame);
  const frontFairing = new THREE.Mesh(
    roundedBoxGeometry(0.42, 0.52, 0.27, 0.12),
    bikePaint,
  );
  frontFairing.position.set(0, 0.66, -0.53);
  group.add(frontFairing);
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: "#fff2c7",
    emissive: "#efce7c",
    emissiveIntensity: 0,
    roughness: 0.26,
  });
  const headlamp = new THREE.Mesh(
    roundedBoxGeometry(0.22, 0.1, 0.04, 0.04),
    headlightMaterial,
  );
  headlamp.position.set(0, 0.77, -0.68);
  group.add(headlamp);
  const headlight = new THREE.SpotLight(
    "#fff0bc",
    0,
    26,
    Math.PI / 5,
    0.72,
    1.1,
  );
  headlight.position.set(0, 0.78, -0.7);
  headlight.target.position.set(0, 0.1, -18);
  group.add(headlight, headlight.target);
  const fork = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.57, 8),
    steelMaterial,
  );
  fork.position.set(0, 0.5, -0.61);
  fork.rotation.x = -0.18;
  group.add(fork);
  const seat = new THREE.Mesh(
    roundedBoxGeometry(0.36, 0.13, 0.54, 0.06),
    darkMaterial,
  );
  seat.position.set(0, 0.75, 0.22);
  group.add(seat);
  const handlebar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.86, 8),
    steelMaterial,
  );
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 0.98, -0.56);
  group.add(handlebar);
  const kickstand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.035, 0.46, 8),
    steelMaterial,
  );
  kickstand.position.set(-0.25, 0.19, 0.32);
  kickstand.rotation.z = -0.62;
  kickstand.rotation.x = -0.2;
  kickstand.visible = false;
  group.add(kickstand);
  const {
    group: rider,
    upperBody: riderUpperBody,
    head: riderHead,
    phone,
    arms: riderArms,
    lowerArms: riderLowerArms,
    legs: riderLegs,
    lowerLegs: riderLowerLegs,
  } = createRiderPerson(
    group,
    "courier",
    0.1,
    true,
    0.95,
  );
  const parcel = new THREE.Mesh(
    roundedBoxGeometry(0.44, 0.4, 0.42, 0.055),
    new THREE.MeshStandardMaterial({
      color: "#bb956b",
      roughness: 0.92,
    }),
  );
  parcel.position.set(0, 0.98, 0.62);
  group.add(parcel);
  const parcelTape = new THREE.Mesh(
    roundedBoxGeometry(0.09, 0.405, 0.43, 0.025),
    new THREE.MeshStandardMaterial({
      color: "#e4c98e",
      roughness: 0.76,
    }),
  );
  parcelTape.position.copy(parcel.position);
  group.add(parcelTape);

  const opacityMaterials: THREE.Material[] = [];
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      material.transparent = true;
      material.depthWrite = false;
      opacityMaterials.push(material);
    }
  });
  group.visible = false;
  scene.add(group);
  return {
    group,
    rider,
    riderUpperBody,
    riderHead,
    riderArms,
    riderLowerArms,
    riderLegs,
    riderLowerLegs,
    package: parcel,
    packageInTransfer: false,
    packageHandedOff: false,
    packageStartPosition: new THREE.Vector3(),
    packageTargetPosition: new THREE.Vector3(),
    phone,
    headlight,
    headlightMaterial,
    kickstand,
    opacityMaterials,
    approachRoute,
    approachRouteLength: approachRoute.getLength(),
    departureRoute,
    departureRouteLength: departureRoute.getLength(),
    phase: "idle",
    progress: 0,
    waitTime: 0,
    retryTime: 0,
    respawnTime: 18 + Math.random() * 18,
    recipient: null,
  };
}

export function updateRoadTraffic(
  vehicles: RoadVehicle[],
  trafficStates: TrafficVehicleState[],
  trafficSpeeds: number[],
  delta: number,
  night: number,
) {
  for (let index = 0; index < vehicles.length; index += 1) {
    const vehicle = vehicles[index];
    const state = trafficStates[index];
    state.laneId = vehicle.laneId;
    state.progress = vehicle.progress;
    state.routeLength = vehicle.routeLength;
    state.speed = vehicle.speed;
    state.maxSpeed = vehicle.maxSpeed;
    state.active = vehicle.group.visible;
    state.positionX = vehicle.group.position.x;
    state.positionZ = vehicle.group.position.z;
  }
  getTrafficSpeeds(trafficStates, delta, trafficSpeeds);
  vehicles.forEach((vehicle, index) => {
    if (!vehicle.group.visible) {
      vehicle.headlights.forEach((headlight) => {
        headlight.intensity = 0;
      });
      vehicle.respawnTime -= delta;
      if (vehicle.respawnTime <= 0) {
        const entryBlocked = vehicles.some(
          (other) =>
            other !== vehicle &&
            other.group.visible &&
            other.laneId === vehicle.laneId &&
            other.progress * vehicle.routeLength < 18,
        );
        if (entryBlocked) {
          vehicle.respawnTime = 1 + Math.random() * 2;
        } else {
          vehicle.progress = 0;
          vehicle.speed = vehicle.maxSpeed;
          vehicle.group.visible = true;
          const position = vehicle.route.getPointAt(0, vehicle.positionScratch);
          const direction = vehicle.route
            .getTangentAt(0, vehicle.directionScratch)
            .normalize();
          vehicle.group.position.copy(position);
          vehicle.group.rotation.y = Math.atan2(-direction.x, -direction.z);
        }
      }
      return;
    }
    vehicle.speed = trafficSpeeds[index];
    vehicle.progress +=
      (vehicle.speed * movementSpeedMultiplier * delta) / vehicle.routeLength;
    const opacity = progressOpacity(vehicle.progress, 0.07, 0.9);
    vehicle.headlights.forEach((headlight) => {
      headlight.intensity = night * 26 * opacity;
    });
    vehicle.headlightMaterials.forEach((material) => {
      material.emissiveIntensity = night * 3 * opacity;
    });
    vehicle.opacityMaterials.forEach((material) => {
      material.opacity = opacity;
    });
    if (vehicle.progress >= 1) {
      vehicle.group.visible = false;
      vehicle.respawnTime = 2 + Math.random() * 8;
      return;
    }
    const position = vehicle.route.getPointAt(
      vehicle.progress,
      vehicle.positionScratch,
    );
    const direction = vehicle.route
      .getTangentAt(vehicle.progress, vehicle.directionScratch)
      .normalize();
    vehicle.group.position.copy(position);
    trafficStates[index].positionX = position.x;
    trafficStates[index].positionZ = position.z;
    vehicle.group.rotation.y = Math.atan2(-direction.x, -direction.z);
  });
}

export function addLandscapePlanter(
  scene: THREE.Scene,
  x: number,
  z: number,
  width = 2.25,
  depth = 0.9,
) {
  const planter = new THREE.Group();
  planter.position.set(x, -0.54, z);
  const stone = new THREE.MeshStandardMaterial({
    color: "#d0cec3",
    roughness: 0.86,
  });
  const soil = new THREE.MeshStandardMaterial({
    color: "#5c5140",
    roughness: 1,
  });
  const base = new THREE.Mesh(
    roundedBoxGeometry(width, 0.42, depth, 0.16),
    stone,
  );
  base.position.y = 0.21;
  planter.add(base);
  const earth = new THREE.Mesh(
    roundedBoxGeometry(width - 0.14, 0.08, depth - 0.14, 0.06),
    soil,
  );
  earth.position.y = 0.45;
  planter.add(earth);
  const foliage = new THREE.MeshStandardMaterial({
    color: "#55795c",
    roughness: 0.9,
  });
  const leafCount = Math.max(3, Math.floor(width / 0.42));
  for (let index = 0; index < leafCount; index += 1) {
    const leaf = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.27 + (index % 2) * 0.05, 1),
      foliage,
    );
    leaf.position.set(
      -width / 2 + 0.22 + (index * (width - 0.44)) / Math.max(1, leafCount - 1),
      0.68 + (index % 3) * 0.035,
      (index % 2 ? 1 : -1) * depth * 0.12,
    );
    leaf.scale.set(1, 0.84, 0.9);
    planter.add(leaf);
  }
  scene.add(planter);
}

export function addModernStreetlight(
  scene: THREE.Scene,
  x: number,
  z: number,
  direction: -1 | 1,
): RoadsideLight {
  const fixture = new THREE.Group();
  fixture.position.set(x, -0.54, z);
  fixture.rotation.y = -direction * (Math.PI / 2);
  const darkMetal = new THREE.MeshStandardMaterial({
    color: "#384744",
    metalness: 0.48,
    roughness: 0.36,
  });
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: "#fff1ce",
    emissive: "#ffc978",
    emissiveIntensity: 0.04,
    roughness: 0.3,
  });
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.13, 5.2, 12),
    darkMetal,
  );
  pole.position.y = 2.6;
  fixture.add(pole);
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 5.1, 0),
    new THREE.Vector3(0.25, 5.35, 0),
    new THREE.Vector3(0.8, 5.42, 0),
    new THREE.Vector3(1.2, 5.25, 0),
  ]);
  fixture.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(armCurve, 14, 0.055, 8, false),
      darkMetal,
    ),
  );
  const lamp = new THREE.Mesh(
    roundedBoxGeometry(0.85, 0.12, 0.35, 0.07),
    lampMaterial,
  );
  lamp.position.set(1.18, 5.18, 0);
  fixture.add(lamp);
  const light = new THREE.SpotLight(
    "#ffd99c",
    0,
    28,
    Math.PI / 3,
    0.65,
    1.3,
  );
  light.position.set(1.16, 5.0, 0);
  light.target.position.set(1.6, 0, 0);
  fixture.add(light);
  fixture.add(light.target);
  scene.add(fixture);
  return { fixture, lamp, light };
}

export function addBackgroundBuilding(
  scene: THREE.Scene,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  windowMaterials: THREE.MeshStandardMaterial[],
) {
  const building = new THREE.Group();
  building.position.set(x, -0.54, z);
  const facade = new THREE.Mesh(
    roundedBoxGeometry(width, height, depth, 0.22),
    new THREE.MeshStandardMaterial({
      color: ["#aeb5b0", "#b8b2a7", "#a9b5b4"][Math.floor(Math.random() * 3)],
      roughness: 0.88,
    }),
  );
  facade.position.y = height / 2;
  building.add(facade);

  const floors = Math.max(2, Math.floor(height / 1.15));
  const columns = Math.max(3, Math.floor(width / 1.25));
  const windowWidth = Math.min(0.58, width / (columns + 1) * 0.48);
  const windowHeight = Math.min(0.48, height / (floors + 1) * 0.5);
  for (let floor = 0; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: "#d7d2c2",
        emissive: "#ffc978",
        emissiveIntensity: 0,
        roughness: 0.45,
      });
      windowMaterials.push(material);
      const windowMesh = new THREE.Mesh(
        roundedBoxGeometry(windowWidth, windowHeight, 0.045, 0.035),
        material,
      );
      windowMesh.position.set(
        -width / 2 +
          ((column + 1) * width) / (columns + 1),
        0.62 + ((floor + 0.5) * (height - 0.5)) / floors, 
        depth / 2 + 0.025,
      );
      building.add(windowMesh);
    }
  }
  scene.add(building);
}

export function createFlyingBird(
  scene: THREE.Scene,
  speed: number,
): FlyingBird {
  const start = randomBirdPosition();
  const heading = new THREE.Vector3(
    randomBetween(-1, 1),
    randomBetween(-0.2, 0.2),
    randomBetween(-0.7, 0.7),
  ).normalize();
  const group = new THREE.Group();
  const feather = new THREE.MeshBasicMaterial({ color: "#36464a" });
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 8, 6),
    feather,
  );
  body.scale.set(0.72, 0.72, 1.8);
  group.add(body);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.x = side * 0.065;
    const wing = new THREE.Mesh(
      new THREE.ConeGeometry(0.095, 0.62, 3),
      feather,
    );
    wing.rotation.z = side * -Math.PI / 2;
    wing.position.x = side * 0.27;
    wing.rotation.x = Math.PI / 2;
    pivot.add(wing);
    group.add(pivot);
    return pivot;
  }) as [THREE.Group, THREE.Group];
  group.scale.setScalar(1.7);
  feather.transparent = true;
  feather.depthWrite = false;
  group.visible = false;
  scene.add(group);
  return {
    group,
    opacityMaterials: [feather],
    wings,
    route: createBirdFlightRoute(start, heading),
    progress: 0,
    speed,
    phase: Math.random() * Math.PI * 2,
    respawnTime: 3 + Math.random() * 18,
    segmentsRemaining: 4 + Math.floor(Math.random() * 5),
    exiting: false,
    positionScratch: new THREE.Vector3(),
    directionScratch: new THREE.Vector3(),
  };
}
