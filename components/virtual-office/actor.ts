import * as THREE from "three";
import type { OfficeMember } from "@/supabase/workspace-api";
import {
  chooseActorAction,
  getActorActionPose,
  riderActionSets,
  type ActorAction,
} from "@/lib/office-actor-actions";
import type { OfficeControlAction } from "@/lib/office-control";
import { addAvatarLabel, colorForMember, roundedBoxGeometry } from "./interior";
import { movementSpeedMultiplier } from "@/lib/office-traffic";

export type Actor = {
  group: THREE.Group;
  body: THREE.Group;
  upperBody: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  eyeWhites: THREE.Mesh[];
  eyes: THREE.Mesh[];
  eyebrows: THREE.Mesh[];
  mouth: THREE.Mesh;
  cleaningTools?: {
    broom: THREE.Group;
    cloth: THREE.Group;
    wateringCan: THREE.Group;
    mop: THREE.Group;
  };
  legs: THREE.Group[];
  lowerLegs: THREE.Group[];
  arms: THREE.Group[];
  lowerArms: THREE.Group[];
  wrists: THREE.Group[];
  sleepIndicator: THREE.Sprite;
  phone: THREE.Mesh;
  carriedPackage: THREE.Mesh;
  meetingLaptop: THREE.Group;
  meetingLaptopLid: THREE.Group;
  meetingLaptopScreen: THREE.MeshStandardMaterial;
  meetingLaptopOpen: number;
  meetingLaptopReturning: boolean;
  meetingLaptopOnTable: boolean;
  meetingReturnPending: boolean;
  meetingLaptopTargetPosition?: THREE.Vector3;
  meetingLaptopTargetRotation?: number;
  currentAction: ActorAction | null;
  actionTime: number;
  deliveryTask:
    | "none"
    | "calling"
    | "communication_wait"
    | "outbound"
    | "waiting"
    | "pickup"
    | "returning";
  deliveryReturnSpotId?: string;
  username: string | null;
  path: THREE.Vector3[];
  pathIndex: number;
  blockedTime: number;
  hasTriedEscape: boolean;
  activity: ActorActivity;
  activityTime: number;
  goalSpotId: string | null;
  currentObstacleId?: string;
  currentSeatPosition?: THREE.Vector3;
  seatExitIgnoreObstacleId?: string;
  seatExitRestoreAt?: number;
  isMeetingParticipant: boolean;
  isWatchingAquarium: boolean;
  meetingReturnSpotId?: string | null;
  meetingReturnActivityTime?: number;
  manualControlAction: OfficeControlAction | null;
  reportingToAdmin: boolean;
  goalObstacleId?: string;
  targetRotation: number;
  offset: number;
  speed: number;
  greetingUntil?: number;
  adminGreetingUntil?: number;
};

export type ActorActivity = "walking" | "working" | "chatting" | "eating" | "sleeping";
export type CleaningTool = "broom" | "cloth" | "wateringCan" | "mop";

export type RiderPersonStyle = "courier" | "motorcyclist" | "police";
export type RiderMotion =
  | "cruise"
  | "police-pursuit"
  | "passenger"
  | "dismount"
  | "handoff"
  | "mount"
  | "phone-check"
  | "steer"
  | "balance"
  | "brake"
  | "patrol"
  | "signal"
  | "escort";

export { riderActionSets };

export type RiderPersonRig = {
  group: THREE.Group;
  upperBody: THREE.Group;
  head: THREE.Group;
  phone: THREE.Mesh;
  arms: THREE.Group[];
  lowerArms: THREE.Group[];
  legs: THREE.Group[];
  lowerLegs: THREE.Group[];
};

function createPersonTorso(
  material: THREE.Material,
  femininePresentation = false,
): THREE.Mesh {
  const torso = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.15, -0.36),
        new THREE.Vector2(0.18, -0.2),
        new THREE.Vector2(femininePresentation ? 0.17 : 0.19, -0.03),
        new THREE.Vector2(femininePresentation ? 0.2 : 0.22, 0.13),
        new THREE.Vector2(femininePresentation ? 0.22 : 0.25, 0.3),
        new THREE.Vector2(0.19, 0.37),
      ],
      16,
    ),
    material,
  );
  torso.position.y = 0.3;
  torso.scale.z = 0.84;
  return torso;
}

export function createRiderPerson(
  parent: THREE.Group,
  style: RiderPersonStyle,
  z: number,
  passenger = false,
  bodyScale = 0.6,
) {
  const palettes = {
    courier: {
      jacket: "#c66d32",
      pants: "#34383a",
      helmet: "#f17824",
      accent: "#f4ce61",
      badge: "#d9c18a",
    },
    motorcyclist: {
      jacket: "#48504e",
      pants: "#303638",
      helmet: "#242b2d",
      accent: "#9da8a2",
      badge: "#d9c18a",
    },
    police: {
      jacket: "#243849",
      pants: "#202e38",
      helmet: "#243849",
      accent: "#b9c9d2",
      badge: "#edc66f",
    },
  } as const;
  const palette = palettes[style];
  const group = new THREE.Group();
  group.position.set(0, 0.4, z);
  parent.add(group);

  const body = new THREE.Group();
  body.position.y = -0.25;
  body.scale.setScalar(bodyScale);
  body.rotation.y = Math.PI;
  group.add(body);

  const jacket = new THREE.MeshStandardMaterial({
    color: palette.jacket,
    roughness: 0.78,
  });
  const pants = new THREE.MeshStandardMaterial({
    color: palette.pants,
    roughness: 0.86,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: "#c99272",
    roughness: 0.82,
  });
  const helmetMaterial = new THREE.MeshStandardMaterial({
    color: palette.helmet,
    metalness: 0.12,
    roughness: 0.34,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: palette.accent,
    metalness: style === "police" ? 0.42 : 0.08,
    roughness: 0.42,
  });
  const bootMaterial = new THREE.MeshStandardMaterial({
    color: "#242829",
    roughness: 0.82,
  });

  const pelvis = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 12, 10),
    pants,
  );
  pelvis.scale.set(1, 0.86, 0.82);
  pelvis.position.y = 0.64;
  body.add(pelvis);
  const belt = new THREE.Mesh(
    roundedBoxGeometry(0.31, 0.055, 0.19, 0.018),
    style === "police" ? accent : bootMaterial,
  );
  belt.position.y = 0.69;
  body.add(belt);

  const upperBody = new THREE.Group();
  upperBody.position.y = 0.68;
  upperBody.rotation.x = passenger ? 0.08 : 0.2;
  body.add(upperBody);
  const torso = createPersonTorso(jacket);
  upperBody.add(torso);
  const shirt = new THREE.Mesh(
    roundedBoxGeometry(0.09, 0.3, 0.035, 0.012),
    new THREE.MeshStandardMaterial({
      color: style === "police" ? "#dce3e4" : "#e4e0d5",
      roughness: 0.72,
    }),
  );
  shirt.position.set(0, 0.31, 0.183);
  upperBody.add(shirt);

  if (style === "courier") {
    const reflectiveBand = new THREE.MeshStandardMaterial({
      color: "#edc75e",
      emissive: "#c58d1f",
      emissiveIntensity: 0.12,
      roughness: 0.45,
    });
    for (const y of [0.2, 0.43]) {
      const band = new THREE.Mesh(
        roundedBoxGeometry(0.37, 0.045, 0.025, 0.012),
        reflectiveBand,
      );
      band.position.set(0, y, 0.173);
      upperBody.add(band);
    }
    const strap = new THREE.Mesh(
      roundedBoxGeometry(0.055, 0.42, 0.035, 0.014),
      bootMaterial,
    );
    strap.position.set(0.13, 0.31, 0.17);
    strap.rotation.z = -0.35;
    upperBody.add(strap);
  } else {
    const badge = new THREE.Mesh(
      new THREE.CircleGeometry(0.055, 12),
      accent,
    );
    badge.position.set(0.12, 0.41, 0.197);
    upperBody.add(badge);
    for (const side of [-1, 1]) {
      const epaulet = new THREE.Mesh(
        roundedBoxGeometry(0.12, 0.055, 0.035, 0.015),
        style === "police" ? accent : jacket,
      );
      epaulet.position.set(side * 0.18, 0.5, 0.02);
      upperBody.add(epaulet);
    }
  }

  const head = new THREE.Group();
  head.position.y = 0.67;
  head.scale.set(0.9, 0.9, 0.92);
  upperBody.add(head);
  const headContent = new THREE.Group();
  headContent.position.y = 0.12;
  head.add(headContent);
  const neck = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.07, 0.1, 4, 8),
    skin,
  );
  neck.position.y = -0.1;
  headContent.add(neck);
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 14, 12),
    skin,
  );
  face.scale.set(0.93, 1, 0.9);
  headContent.add(face);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.19,
      16,
      10,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.58,
    ),
    helmetMaterial,
  );
  helmet.scale.set(1.05, 1.08, 1.08);
  helmet.position.y = 0.055;
  headContent.add(helmet);
  const visor = new THREE.Mesh(
    roundedBoxGeometry(0.25, 0.075, 0.035, 0.025),
    new THREE.MeshStandardMaterial({
      color: style === "courier" ? "#4c5d5e" : "#263238",
      metalness: 0.32,
      roughness: 0.22,
      transparent: true,
      opacity: 0.86,
    }),
  );
  visor.position.set(0, -0.02, 0.17);
  headContent.add(visor);
  const helmetTrim = new THREE.Mesh(
    new THREE.TorusGeometry(0.155, 0.012, 6, 18, Math.PI),
    accent,
  );
  helmetTrim.position.set(0, -0.04, 0.01);
  helmetTrim.rotation.z = Math.PI;
  headContent.add(helmetTrim);

  const arms: THREE.Group[] = [];
  const lowerArms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.26, 0.52, 0.015);
    arm.rotation.x = passenger ? 0.18 : 0.9;
    arm.rotation.z = side * -0.1;
    upperBody.add(arm);
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.088, 10, 8),
      jacket,
    );
    shoulder.scale.set(1, 1.1, 1);
    arm.add(shoulder);
    const upperArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.065, 0.22, 4, 8),
      jacket,
    );
    upperArm.position.y = -0.15;
    arm.add(upperArm);
    const elbow = new THREE.Group();
    elbow.position.set(-side * 0.025, -0.3, 0);
    elbow.rotation.x = passenger ? -0.45 : 0.25;
    arm.add(elbow);
    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.052, 0.2, 4, 8),
      jacket,
    );
    forearm.position.y = -0.12;
    elbow.add(forearm);
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.052, 0.055, 8),
      style === "police" ? accent : jacket,
    );
    cuff.position.y = -0.265;
    elbow.add(cuff);
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 10, 8),
      style === "motorcyclist" || style === "police" ? bootMaterial : skin,
    );
    hand.scale.set(0.82, 0.95, 0.7);
    hand.position.set(0, -0.31, 0.006);
    elbow.add(hand);
    for (let finger = 0; finger < 4; finger += 1) {
      const digit = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.012, 0.035, 3, 5),
        hand.material,
      );
      digit.position.set((finger - 1.5) * 0.021, -0.35, 0.014);
      elbow.add(digit);
    }
    const thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.014, 0.035, 3, 5),
      hand.material,
    );
    thumb.position.set(side * -0.045, -0.315, 0.005);
    thumb.rotation.z = side * 0.65;
    elbow.add(thumb);
    arms.push(arm);
    lowerArms.push(elbow);
  }

  const legs: THREE.Group[] = [];
  const lowerLegs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.11, 0.63, 0);
    leg.rotation.x = passenger ? -0.35 : -0.95;
    body.add(leg);
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.078, 0.24, 4, 8),
      pants,
    );
    thigh.position.y = -0.13;
    leg.add(thigh);
    const knee = new THREE.Mesh(
      new THREE.SphereGeometry(0.074, 10, 8),
      pants,
    );
    knee.position.y = -0.29;
    leg.add(knee);
    const shin = new THREE.Group();
    shin.position.y = -0.3;
    shin.rotation.x = passenger ? 0.75 : 1.05;
    leg.add(shin);
    const lowerLeg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.063, 0.24, 4, 8),
      pants,
    );
    lowerLeg.position.y = -0.13;
    shin.add(lowerLeg);
    const boot = new THREE.Mesh(
      roundedBoxGeometry(0.15, 0.12, 0.25, 0.04),
      bootMaterial,
    );
    boot.position.set(0, -0.29, 0.045);
    shin.add(boot);
    legs.push(leg);
    lowerLegs.push(shin);
  }

  const phone = new THREE.Mesh(
    roundedBoxGeometry(0.09, 0.15, 0.025, 0.014),
    new THREE.MeshStandardMaterial({
      color: "#22282b",
      emissive: "#162c32",
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.18,
    }),
  );
  phone.position.set(0.01, -0.3, 0.045);
  phone.rotation.x = 0.22;
  phone.visible = false;
  lowerArms[1].add(phone);

  return { group, upperBody, head, phone, arms, lowerArms, legs, lowerLegs };
}

export function updateRiderPersonAnimation(
  rider: RiderPersonRig,
  motion: RiderMotion,
  elapsed: number,
  delta: number,
): void {
  const pursuit = motion === "police-pursuit";
  const riding =
    motion === "cruise" ||
    motion === "steer" ||
    motion === "balance" ||
    motion === "brake" ||
    motion === "patrol" ||
    motion === "police-pursuit" ||
    motion === "passenger" ||
    motion === "escort";
  const scan = pursuit ? Math.sin(elapsed * 1.15 + rider.group.position.z) : 0;
  const checkingPhone = motion === "phone-check";
  const signaling = motion === "signal";
  rider.upperBody.rotation.x = THREE.MathUtils.damp(
    rider.upperBody.rotation.x,
    riding ? (motion === "passenger" ? 0.06 : 0.16) : 0,
    4.5,
    delta,
  );
  rider.head.rotation.x = THREE.MathUtils.damp(
    rider.head.rotation.x,
    pursuit ? 0.015 + Math.sin(elapsed * 2.4) * 0.025 : 0,
    4,
    delta,
  );
  rider.head.rotation.y = THREE.MathUtils.damp(
    rider.head.rotation.y,
    pursuit ? scan * 0.11 : Math.sin(elapsed * 0.55) * 0.018,
    pursuit ? 2.8 : 2,
    delta,
  );
  rider.head.rotation.z = THREE.MathUtils.damp(
    rider.head.rotation.z,
    pursuit ? scan * 0.035 : Math.sin(elapsed * 0.8) * 0.012,
    3,
    delta,
  );
  const armTarget = checkingPhone
    ? -0.5
    : signaling
      ? -0.18
      : riding
        ? motion === "passenger"
          ? -0.03
          : 0.18
        : -0.08;
  const elbowTarget = checkingPhone
    ? -1.2
    : signaling
      ? -0.8
      : riding
        ? motion === "passenger"
          ? -0.12
          : -0.45
        : -0.32;
  const legTarget = riding ? (motion === "passenger" ? -0.52 : -0.35) : 0.02;
  for (let index = 0; index < rider.arms.length; index += 1) {
    const side = index === 0 ? -1 : 1;
    const steering = riding && motion !== "passenger"
      ? Math.sin(elapsed * 3.2 + index * Math.PI) * 0.035
      : 0;
    rider.arms[index].rotation.x = THREE.MathUtils.damp(
      rider.arms[index].rotation.x,
      armTarget + steering,
      4.5,
      delta,
    );
    rider.arms[index].rotation.z = THREE.MathUtils.damp(
      rider.arms[index].rotation.z,
      side * (riding ? 0.1 : 0.04),
      4,
      delta,
    );
    rider.lowerArms[index].rotation.x = THREE.MathUtils.damp(
      rider.lowerArms[index].rotation.x,
      elbowTarget + steering * 0.4,
      5,
      delta,
    );
    rider.legs[index].rotation.x = THREE.MathUtils.damp(
      rider.legs[index].rotation.x,
      legTarget + (riding ? Math.sin(elapsed * 1.4 + index) * 0.018 : 0),
      4,
      delta,
    );
    rider.lowerLegs[index].rotation.x = THREE.MathUtils.damp(
      rider.lowerLegs[index].rotation.x,
      riding ? (motion === "passenger" ? 0.68 : 0.75) : 0,
      4,
      delta,
    );
  }
}

export function createActor(
  scene: THREE.Scene,
  member: OfficeMember,
  index: number,
): Actor {
  const username = member.username?.trim().toLowerCase();
  const femininePresentation = username === "anh0004";
  const executivePresentation = username === "dung0001";
  const cleaningPresentation = username === "cleaning_staff";
  const color = colorForMember(member.id);
  const group = new THREE.Group();
  const body = new THREE.Group();
  const upperBody = new THREE.Group();
  upperBody.position.y = 0.68;
  body.add(upperBody);
  const clothing = new THREE.MeshStandardMaterial({
    color: executivePresentation
      ? "#172c3d"
      : cleaningPresentation
        ? "#087665"
        : femininePresentation
        ? "#33534c"
        : "#315047",
    roughness: 0.72,
  });
  const trousers = new THREE.MeshStandardMaterial({
    color: cleaningPresentation ? "#075548" : "#273731",
    roughness: 0.78,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: "#d8a98b",
    roughness: 0.84,
  });
  const hair = new THREE.MeshStandardMaterial({
    color: femininePresentation ? "#382b2b" : index % 2 ? "#42352d" : "#51483e",
    roughness: 0.92,
  });
  const torso = createPersonTorso(clothing, femininePresentation);
  upperBody.add(torso);
  const shirt = new THREE.Mesh(
    roundedBoxGeometry(0.16, 0.32, 0.045, 0.02),
    new THREE.MeshStandardMaterial({ color: "#f0eee3", roughness: 0.62 }),
  );
  shirt.position.set(0, 0.34, 0.195);
  upperBody.add(shirt);
  if (femininePresentation) {
    const blouseFold = new THREE.MeshStandardMaterial({
      color: "#e7dfd0",
      roughness: 0.58,
    });
    for (const side of [-1, 1]) {
      const collar = new THREE.Mesh(
        roundedBoxGeometry(0.105, 0.15, 0.035, 0.025),
        blouseFold,
      );
      collar.position.set(side * 0.048, 0.48, 0.218);
      collar.rotation.z = side * -0.32;
      upperBody.add(collar);
    }
    const brooch = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 8),
      new THREE.MeshStandardMaterial({
        color: "#d4b16d",
        metalness: 0.72,
        roughness: 0.28,
      }),
    );
    brooch.scale.set(0.82, 1, 0.35);
    brooch.position.set(0.12, 0.42, 0.245);
    upperBody.add(brooch);
  } else if (!cleaningPresentation) {
    const tieColor = executivePresentation ? "#c6a463" : "#a8b7a5";
    const tie = new THREE.Mesh(
      roundedBoxGeometry(0.065, 0.25, 0.035, 0.015),
      new THREE.MeshStandardMaterial({
        color: tieColor,
        roughness: 0.48,
        metalness: executivePresentation ? 0.12 : 0,
      }),
    );
    tie.position.set(0, 0.32, 0.228);
    upperBody.add(tie);
  }
  if (cleaningPresentation) {
    const overallMaterial = new THREE.MeshStandardMaterial({
      color: "#087665",
      roughness: 0.76,
    });
    const bib = new THREE.Mesh(
      roundedBoxGeometry(0.31, 0.38, 0.055, 0.035),
      overallMaterial,
    );
    bib.position.set(0, 0.24, 0.205);
    upperBody.add(bib);
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(
        roundedBoxGeometry(0.055, 0.42, 0.045, 0.018),
        overallMaterial,
      );
      strap.position.set(side * 0.16, 0.39, 0.188);
      strap.rotation.z = side * -0.12;
      upperBody.add(strap);
      const buckle = new THREE.Mesh(
        roundedBoxGeometry(0.065, 0.07, 0.025, 0.012),
        new THREE.MeshStandardMaterial({
          color: "#e1c276",
          metalness: 0.62,
          roughness: 0.34,
        }),
      );
      buckle.position.set(side * 0.16, 0.48, 0.218);
      upperBody.add(buckle);
    }
    const uniformPatch = new THREE.Mesh(
      roundedBoxGeometry(0.17, 0.09, 0.025, 0.018),
      new THREE.MeshStandardMaterial({ color: "#d8c681", roughness: 0.58 }),
    );
    uniformPatch.position.set(-0.02, 0.24, 0.24);
    upperBody.add(uniformPatch);
  }
  for (const side of [-1, 1]) {
    const lapel = new THREE.Mesh(
      roundedBoxGeometry(0.075, 0.29, 0.035, 0.014),
      clothing,
    );
    lapel.position.set(side * 0.075, 0.45, 0.218);
    lapel.rotation.z = side * -0.2;
    upperBody.add(lapel);
  }
  if (executivePresentation) {
    const pocketSquare = new THREE.Mesh(
      roundedBoxGeometry(0.09, 0.055, 0.025, 0.01),
      new THREE.MeshStandardMaterial({ color: "#d4bd87", roughness: 0.5 }),
    );
    pocketSquare.position.set(0.14, 0.44, 0.22);
    upperBody.add(pocketSquare);
  }
  const neckPivot = new THREE.Group();
  neckPivot.position.y = 0.58;
  upperBody.add(neckPivot);
  const head = new THREE.Group();
  head.position.y = 0.09;
  head.scale.set(0.9, 0.9, 0.92);
  neckPivot.add(head);
  const headContent = new THREE.Group();
  headContent.position.y = 0.12;
  head.add(headContent);
  const neckMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.075, 0.1, 4, 8),
    skin,
  );
  neckMesh.position.y = -0.105;
  headContent.add(neckMesh);
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 16, 12),
    skin,
  );
  face.scale.set(0.92, 1, 0.9);
  headContent.add(face);
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.195, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
    hair,
  );
  hairCap.position.y = 0.06;
  headContent.add(hairCap);
  const cleaningCapMaterial = new THREE.MeshStandardMaterial({
    color: "#087665",
    roughness: 0.58,
  });
  if (cleaningPresentation) {
    hairCap.visible = false;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.205, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      cleaningCapMaterial,
    );
    cap.scale.set(1, 0.62, 1);
    cap.position.set(0, 0.13, -0.005);
    headContent.add(cap);
    const brim = new THREE.Mesh(
      roundedBoxGeometry(0.31, 0.035, 0.2, 0.045),
      cleaningCapMaterial,
    );
    brim.position.set(0, 0.105, 0.14);
    headContent.add(brim);
  }
  const eyeWhiteMaterial = new THREE.MeshStandardMaterial({
    color: "#f7f3e9",
    roughness: 0.58,
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: "#292a29",
    roughness: 0.48,
  });
  const eyes: THREE.Mesh[] = [];
  const eyeWhites: THREE.Mesh[] = [];
  const eyebrows: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 10, 8),
      skin,
    );
    ear.scale.set(0.72, 1, 0.58);
    ear.position.set(side * 0.176, -0.005, -0.005);
    headContent.add(ear);
    const eyeWhite = new THREE.Mesh(
      new THREE.SphereGeometry(0.019, 10, 8),
      eyeWhiteMaterial,
    );
    eyeWhite.scale.set(1.25, 0.8, 0.56);
    eyeWhite.position.set(side * 0.06, 0.012, 0.165);
    headContent.add(eyeWhite);
    eyeWhites.push(eyeWhite);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 8, 8),
      eyeMaterial,
    );
    eye.scale.set(1, 0.92, 0.58);
    eye.position.set(side * 0.06, 0.012, 0.177);
    headContent.add(eye);
    eyes.push(eye);
    const eyebrow = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.009, 0.055, 3, 6),
      hair,
    );
    eyebrow.position.set(side * 0.06, 0.072, 0.17);
    eyebrow.rotation.z = side * 0.08;
    headContent.add(eyebrow);
    eyebrows.push(eyebrow);
  }
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 10, 8),
    skin,
  );
  nose.scale.set(0.7, 0.74, 0.82);
  nose.position.set(0, -0.035, 0.172);
  headContent.add(nose);
  const mouthCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.062, -0.078, 0.16),
    new THREE.Vector3(-0.032, -0.095, 0.176),
    new THREE.Vector3(0, -0.1, 0.18),
    new THREE.Vector3(0.032, -0.095, 0.176),
    new THREE.Vector3(0.062, -0.078, 0.16),
  ]);
  const mouth = new THREE.Mesh(
    new THREE.TubeGeometry(mouthCurve, 12, 0.009, 5, false),
    new THREE.MeshStandardMaterial({
      color: "#8e5148",
      roughness: 0.58,
    }),
  );
  headContent.add(mouth);
  if (executivePresentation || username === "truong0003") {
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: executivePresentation ? "#34383a" : "#725941",
      metalness: 0.64,
      roughness: 0.28,
    });
    const lensMaterial = new THREE.MeshPhysicalMaterial({
      color: "#c5d8d8",
      transparent: true,
      opacity: 0.22,
      transmission: 0.58,
      thickness: 0.015,
      roughness: 0.12,
      metalness: 0.04,
      depthWrite: false,
    });
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.049, 20),
        lensMaterial,
      );
      lens.position.set(side * 0.064, 0.014, 0.19);
      headContent.add(lens);
      const frame = new THREE.Mesh(
        new THREE.TorusGeometry(0.053, 0.008, 6, 20),
        frameMaterial,
      );
      frame.position.set(side * 0.064, 0.014, 0.198);
      headContent.add(frame);

      const temple = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.19, 8),
        frameMaterial,
      );
      const templeStart = new THREE.Vector3(side * 0.115, 0.014, 0.194);
      const templeEnd = new THREE.Vector3(side * 0.205, 0.005, -0.01);
      const templeDirection = templeEnd.clone().sub(templeStart);
      temple.position.copy(templeStart).add(templeEnd).multiplyScalar(0.5);
      temple.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        templeDirection.normalize(),
      );
      headContent.add(temple);
    }
    const bridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.03, 8),
      frameMaterial,
    );
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.014, 0.198);
    headContent.add(bridge);
  }
  if (femininePresentation) {
    const backHair = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 24, 16),
      hair,
    );
    backHair.scale.set(1.14, 1.82, 0.82);
    backHair.position.set(0, -0.2, -0.12);
    headContent.add(backHair);
    const fringe = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 20, 12),
      hair,
    );
    fringe.scale.set(1.16, 0.4, 0.64);
    fringe.position.set(0.035, 0.105, 0.105);
    fringe.rotation.z = -0.16;
    headContent.add(fringe);
    const ponytail = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055, 0.2, 5, 10),
      hair,
    );
    ponytail.position.set(0.025, -0.08, -0.235);
    ponytail.rotation.x = -0.35;
    headContent.add(ponytail);
  }
  const pelvis = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 12, 10),
    trousers,
  );
  pelvis.scale.set(1, 0.86, 0.82);
  pelvis.position.y = 0.64;
  body.add(pelvis);
  const legs: THREE.Group[] = [];
  const lowerLegs: THREE.Group[] = [];
  const arms: THREE.Group[] = [];
  const lowerArms: THREE.Group[] = [];
  const wrists: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.27, 0.52, 0.015);
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 12, 10),
      clothing,
    );
    shoulder.scale.set(1, 1.15, 1);
    armPivot.add(shoulder);
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.065, 0.23, 3, 6),
      clothing,
    );
    arm.position.y = -0.15;
    arm.rotation.z = side * -0.15;
    armPivot.add(arm);
    const elbow = new THREE.Group();
    elbow.position.set(-side * 0.03, -0.31, 0.015);
    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.052, 0.19, 3, 6),
      clothing,
    );
    forearm.position.y = -0.115;
    elbow.add(forearm);
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.052, 0.045, 8),
      clothing,
    );
    cuff.position.y = -0.245;
    elbow.add(cuff);
    const wrist = new THREE.Group();
    wrist.position.set(0, -0.275, 0.008);
    elbow.add(wrist);
    const handMaterial = cleaningPresentation
      ? new THREE.MeshStandardMaterial({ color: "#eac34f", roughness: 0.72 })
      : skin;
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 10, 8),
      handMaterial,
    );
    hand.scale.set(0.78, 0.9, 0.7);
    hand.position.set(0, -0.025, 0);
    wrist.add(hand);
    for (let finger = 0; finger < 4; finger += 1) {
      const digit = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.012, 0.035, 3, 5),
        handMaterial,
      );
      digit.position.set((finger - 1.5) * 0.021, -0.07, 0.014);
      wrist.add(digit);
    }
    const thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.014, 0.035, 3, 5),
      handMaterial,
    );
    thumb.position.set(side * -0.045, -0.045, 0.005);
    thumb.rotation.z = side * 0.65;
    wrist.add(thumb);
    armPivot.add(elbow);
    upperBody.add(armPivot);
    arms.push(armPivot);
    lowerArms.push(elbow);
    wrists.push(wrist);
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.11, 0.68, 0);
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.075, 0.2, 4, 8),
      trousers,
    );
    leg.position.y = -0.12;
    legPivot.add(leg);
    const lowerLeg = new THREE.Group();
    lowerLeg.position.y = -0.3;
    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.065, 0.24, 4, 8),
      trousers,
    );
    shin.position.y = -0.14;
    lowerLeg.add(shin);
    const shoe = new THREE.Mesh(
      roundedBoxGeometry(0.15, 0.09, 0.24, 0.035),
      new THREE.MeshStandardMaterial({ color: "#37332f", roughness: 0.7 }),
    );
    shoe.position.set(0, -0.31, 0.035);
    lowerLeg.add(shoe);
    legPivot.add(lowerLeg);
    body.add(legPivot);
    legs.push(legPivot);
    lowerLegs.push(lowerLeg);
  }
  let cleaningTools: Actor["cleaningTools"];
  if (cleaningPresentation) {
    const hand = wrists[1];
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: "#79583c",
      roughness: 0.74,
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: "#b7c1bc",
      metalness: 0.52,
      roughness: 0.38,
    });
    const yellowMaterial = new THREE.MeshStandardMaterial({
      color: "#eac34f",
      roughness: 0.74,
    });
    const broom = new THREE.Group();
    const broomHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.83, 8),
      handleMaterial,
    );
    broomHandle.position.y = -0.36;
    broom.add(broomHandle);
    const broomHead = new THREE.Mesh(
      roundedBoxGeometry(0.27, 0.095, 0.12, 0.035),
      yellowMaterial,
    );
    broomHead.position.set(0, -0.79, 0);
    broom.add(broomHead);
    for (let bristle = 0; bristle < 7; bristle += 1) {
      const strand = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.012, 0.075, 2, 4),
        yellowMaterial,
      );
      strand.position.set(-0.105 + bristle * 0.035, -0.86, 0);
      broom.add(strand);
    }
    hand.add(broom);
    broom.visible = false;

    const cloth = new THREE.Group();
    const foldedCloth = new THREE.Mesh(
      roundedBoxGeometry(0.2, 0.035, 0.16, 0.025),
      new THREE.MeshStandardMaterial({ color: "#81b8bd", roughness: 0.92 }),
    );
    foldedCloth.position.set(0, -0.035, 0.015);
    foldedCloth.rotation.z = -0.18;
    cloth.add(foldedCloth);
    hand.add(cloth);
    cloth.visible = false;

    const wateringCan = new THREE.Group();
    const canBody = new THREE.Mesh(
      roundedBoxGeometry(0.19, 0.17, 0.15, 0.045),
      new THREE.MeshStandardMaterial({
        color: "#318b78",
        roughness: 0.5,
        metalness: 0.08,
      }),
    );
    canBody.position.set(0, -0.045, 0.035);
    wateringCan.add(canBody);
    const canHandle = new THREE.Mesh(
      new THREE.TorusGeometry(0.065, 0.012, 6, 12, Math.PI),
      metalMaterial,
    );
    canHandle.position.set(0, 0.035, -0.015);
    canHandle.rotation.z = Math.PI;
    wateringCan.add(canHandle);
    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.032, 0.22, 8),
      canBody.material,
    );
    spout.position.set(0, 0.015, 0.17);
    spout.rotation.x = Math.PI / 2.4;
    wateringCan.add(spout);
    const sprinklerHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 6),
      metalMaterial,
    );
    sprinklerHead.position.set(0, 0.065, 0.255);
    wateringCan.add(sprinklerHead);
    const waterMaterial = new THREE.MeshBasicMaterial({
      color: "#b7edf0",
      transparent: true,
      opacity: 0.82,
    });
    for (let drop = 0; drop < 3; drop += 1) {
      const droplet = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 6, 5),
        waterMaterial,
      );
      droplet.position.set(
        (drop - 1) * 0.045,
        0.035 - drop * 0.045,
        0.31 + drop * 0.09,
      );
      wateringCan.add(droplet);
    }
    hand.add(wateringCan);
    wateringCan.visible = false;

    const mop = new THREE.Group();
    const mopHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.02, 0.84, 8),
      metalMaterial,
    );
    mopHandle.position.y = -0.36;
    mop.add(mopHandle);
    const mopHead = new THREE.Mesh(
      roundedBoxGeometry(0.28, 0.055, 0.13, 0.03),
      new THREE.MeshStandardMaterial({ color: "#d8eee4", roughness: 0.96 }),
    );
    mopHead.position.set(0, -0.77, 0);
    mop.add(mopHead);
    hand.add(mop);
    mop.visible = false;
    cleaningTools = { broom, cloth, wateringCan, mop };
  }
  const phone = new THREE.Mesh(
    roundedBoxGeometry(0.075, 0.13, 0.018, 0.012),
    new THREE.MeshStandardMaterial({
      color: "#22282b",
      emissive: "#152b31",
      emissiveIntensity: 0.5,
      roughness: 0.28,
      metalness: 0.2,
    }),
  );
  phone.position.set(0, -0.3, 0.06);
  phone.rotation.x = 0.22;
  phone.visible = false;
  lowerArms[1].add(phone);
  group.add(body);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 20),
    new THREE.MeshBasicMaterial({
      color: "#34433c",
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  group.add(shadow);
  const sleepCanvas = document.createElement("canvas");
  sleepCanvas.width = 256;
  sleepCanvas.height = 112;
  const sleepContext = sleepCanvas.getContext("2d");
  if (sleepContext) {
    sleepContext.fillStyle = "rgba(255,255,255,0.94)";
    sleepContext.beginPath();
    sleepContext.roundRect(12, 12, 232, 88, 30);
    sleepContext.fill();
    sleepContext.fillStyle = "#49685f";
    sleepContext.font = "700 50px Segoe UI, sans-serif";
    sleepContext.textAlign = "center";
    sleepContext.textBaseline = "middle";
    sleepContext.fillText("Z z z", 128, 57);
  }
  const sleepTexture = new THREE.CanvasTexture(sleepCanvas);
  sleepTexture.colorSpace = THREE.SRGBColorSpace;
  const sleepIndicator = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sleepTexture,
      transparent: true,
      depthWrite: false,
    }),
  );
  sleepIndicator.position.set(0.35, 1.65, 0.12);
  sleepIndicator.scale.set(0.7, 0.32, 1);
  sleepIndicator.visible = false;
  group.add(sleepIndicator);
  const carriedPackage = new THREE.Mesh(
    roundedBoxGeometry(0.27, 0.25, 0.27, 0.035),
    new THREE.MeshStandardMaterial({
      color: "#bc966e",
      roughness: 0.9,
    }),
  );
  carriedPackage.position.set(0.34, 0.83, 0.28);
  carriedPackage.visible = false;
  group.add(carriedPackage);
  const meetingLaptop = new THREE.Group();
  meetingLaptop.position.set(0, 0.94, 0.34);
  meetingLaptop.scale.setScalar(0.72);
  meetingLaptop.visible = false;
  const laptopBodyMaterial = new THREE.MeshStandardMaterial({
    color: "#252d31",
    metalness: 0.58,
    roughness: 0.32,
  });
  const laptopKeyboardMaterial = new THREE.MeshStandardMaterial({
    color: "#68747a",
    metalness: 0.18,
    roughness: 0.62,
  });
  const laptopBase = new THREE.Mesh(
    roundedBoxGeometry(0.62, 0.035, 0.42, 0.025),
    laptopBodyMaterial,
  );
  laptopBase.position.y = 0.02;
  meetingLaptop.add(laptopBase);
  const keyGeometry = roundedBoxGeometry(0.038, 0.012, 0.027, 0.004);
  const keys = new THREE.InstancedMesh(
    keyGeometry,
    laptopKeyboardMaterial,
    50,
  );
  const keyTransform = new THREE.Object3D();
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      keyTransform.position.set(
        -0.22 + column * 0.048,
        0.044,
        0.115 - row * 0.047,
      );
      keyTransform.updateMatrix();
      keys.setMatrixAt(row * 10 + column, keyTransform.matrix);
    }
  }
  keys.instanceMatrix.needsUpdate = true;
  meetingLaptop.add(keys);
  const trackpad = new THREE.Mesh(
    roundedBoxGeometry(0.16, 0.008, 0.09, 0.01),
    laptopKeyboardMaterial,
  );
  trackpad.position.set(0, 0.044, -0.125);
  meetingLaptop.add(trackpad);
  const meetingLaptopLid = new THREE.Group();
  meetingLaptopLid.position.set(0, 0.04, -0.19);
  const laptopLid = new THREE.Mesh(
    roundedBoxGeometry(0.62, 0.025, 0.39, 0.025),
    laptopBodyMaterial,
  );
  laptopLid.position.z = 0.195;
  meetingLaptopLid.add(laptopLid);
  const laptopScreenCanvas = document.createElement("canvas");
  laptopScreenCanvas.width = 256;
  laptopScreenCanvas.height = 160;
  const laptopScreenContext = laptopScreenCanvas.getContext("2d");
  if (laptopScreenContext) {
    laptopScreenContext.fillStyle = "#10252c";
    laptopScreenContext.fillRect(0, 0, 256, 160);
    laptopScreenContext.fillStyle = "#27675e";
    laptopScreenContext.fillRect(0, 0, 256, 20);
    laptopScreenContext.fillStyle = "#d8eee4";
    laptopScreenContext.fillRect(14, 34, 96, 7);
    laptopScreenContext.fillStyle = "#77c9ad";
    laptopScreenContext.fillRect(14, 51, 72, 4);
    laptopScreenContext.fillRect(14, 64, 112, 4);
    laptopScreenContext.fillStyle = "#d4b979";
    laptopScreenContext.fillRect(14, 83, 54, 4);
    laptopScreenContext.fillStyle = "#31555a";
    laptopScreenContext.fillRect(146, 34, 96, 86);
    laptopScreenContext.fillStyle = "#64b99f";
    laptopScreenContext.fillRect(156, 100, 13, 20);
    laptopScreenContext.fillRect(176, 82, 13, 38);
    laptopScreenContext.fillRect(196, 64, 13, 56);
    laptopScreenContext.fillRect(216, 48, 13, 72);
  }
  const laptopScreenTexture = new THREE.CanvasTexture(laptopScreenCanvas);
  laptopScreenTexture.colorSpace = THREE.SRGBColorSpace;
  const meetingLaptopScreen = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: laptopScreenTexture,
    emissive: "#59b9d1",
    emissiveMap: laptopScreenTexture,
    emissiveIntensity: 0,
    roughness: 0.24,
    metalness: 0.12,
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.53, 0.31),
    meetingLaptopScreen,
  );
  screen.rotation.x = Math.PI / 2;
  screen.position.set(0, 0.014, 0.195);
  meetingLaptopLid.add(screen);
  meetingLaptop.add(meetingLaptopLid);
  group.add(meetingLaptop);
  const avatarLabel = addAvatarLabel(member, color);
  avatarLabel.userData.sceneLabelType = "actor";
  group.add(avatarLabel);
  scene.add(group);
  group.position.set(
    -1.3 + (index % 6) * 0.52,
    0,
    -2.3 + Math.floor(index / 6) * 0.55,
  );
  return {
    group,
    body,
    upperBody,
    neck: neckPivot,
    head,
    eyeWhites,
    eyes,
    eyebrows,
    mouth,
    cleaningTools,
    legs,
    lowerLegs,
    arms,
    lowerArms,
    wrists,
    sleepIndicator,
    phone,
    carriedPackage,
    meetingLaptop,
    meetingLaptopLid,
    meetingLaptopScreen,
    meetingLaptopOpen: 0,
    meetingLaptopReturning: false,
    meetingLaptopOnTable: false,
    meetingReturnPending: false,
    currentAction: null,
    actionTime: 0,
    deliveryTask: "none",
    username: member.username,
    path: [],
    pathIndex: 0,
    blockedTime: 0,
    hasTriedEscape: false,
    activity: "walking",
    activityTime: 0,
    goalSpotId: null,
    currentObstacleId: undefined,
    currentSeatPosition: undefined,
    isMeetingParticipant: false,
    isWatchingAquarium: false,
    manualControlAction: null,
    reportingToAdmin: false,
    targetRotation: 0,
    offset: Math.random() * Math.PI * 2,
    speed: (0.9 + Math.random() * 0.55) * movementSpeedMultiplier,
    greetingUntil: undefined,
    adminGreetingUntil: undefined,
  };
}

export function updateActorAnimation(actor: Actor, elapsed: number, delta: number): void {
  const sleeping = actor.activity === "sleeping";
  const greeting = (actor.greetingUntil ?? 0) > elapsed;
  const acknowledging = (actor.adminGreetingUntil ?? 0) > elapsed;
  const blinkCycle = (elapsed + actor.offset * 1.7) % 4.8;
  const blink = blinkCycle < 0.12
    ? 0.14 + (blinkCycle / 0.12) * 0.86
    : blinkCycle < 0.2
      ? 1
      : 1;
  for (const eye of actor.eyes) {
    eye.scale.y = THREE.MathUtils.damp(eye.scale.y, 0.92 * blink, 14, delta);
  }
  for (const eyeWhite of actor.eyeWhites) {
    eyeWhite.scale.y = THREE.MathUtils.damp(
      eyeWhite.scale.y,
      0.8 * blink,
      14,
      delta,
    );
  }
  actor.mouth.scale.x = THREE.MathUtils.damp(
    actor.mouth.scale.x,
    greeting || acknowledging || actor.activity === "chatting"
      ? 1.18
      : sleeping
        ? 0.82
        : 1,
    4,
    delta,
  );
  actor.mouth.scale.y = THREE.MathUtils.damp(
    actor.mouth.scale.y,
    greeting || acknowledging || actor.activity === "chatting"
      ? 1.12
      : sleeping
        ? 0.65
        : 1,
    4,
    delta,
  );
  for (const [index, eyebrow] of actor.eyebrows.entries()) {
    const side = index === 0 ? -1 : 1;
    const targetZ = greeting || acknowledging
      ? side * 0.18
      : sleeping
        ? side * -0.12
        : side * 0.08;
    eyebrow.rotation.z = THREE.MathUtils.damp(
      eyebrow.rotation.z,
      targetZ,
      4,
      delta,
    );
  }
  const subtleHeadTurn =
    Math.sin(elapsed * 0.46 + actor.offset) * (actor.activity === "walking" ? 0.065 : 0.045);
  actor.neck.rotation.y = THREE.MathUtils.damp(
    actor.neck.rotation.y,
    greeting || acknowledging
      ? Math.sin(elapsed * 7) * 0.08
      : subtleHeadTurn,
    greeting || acknowledging ? 7 : 2,
    delta,
  );
  actor.neck.rotation.z = THREE.MathUtils.damp(
    actor.neck.rotation.z,
    Math.sin(elapsed * 0.7 + actor.offset) * 0.025,
    2,
    delta,
  );
  actor.neck.rotation.x = THREE.MathUtils.damp(
    actor.neck.rotation.x,
    sleeping ? 0.018 : Math.sin(elapsed * 1.1 + actor.offset) * 0.018,
    2,
    delta,
  );
  if (actor.activity === "walking") {
    actor.head.rotation.x = THREE.MathUtils.damp(
      actor.head.rotation.x,
      0,
      4,
      delta,
    );
    actor.head.rotation.y = THREE.MathUtils.damp(
      actor.head.rotation.y,
      greeting ? 0.16 : 0,
      greeting ? 7 : 3,
      delta,
    );
    actor.head.rotation.z = THREE.MathUtils.damp(
      actor.head.rotation.z,
      0,
      3,
      delta,
    );
    actor.body.rotation.z = THREE.MathUtils.damp(
      actor.body.rotation.z,
      0,
      3,
      delta,
    );
    for (const wrist of actor.wrists) {
      wrist.rotation.z = THREE.MathUtils.damp(wrist.rotation.z, 0, 4, delta);
    }
    const gaitPhase = elapsed * (7.5 + actor.speed * 2.2) + actor.offset;
    for (const [index, arm] of actor.arms.entries()) {
      const side = index === 0 ? -1 : 1;
      arm.rotation.x = THREE.MathUtils.damp(
        arm.rotation.x,
        greeting && index === 1 ? -0.8 : Math.sin(gaitPhase + index * Math.PI) * 0.2,
        8,
        delta,
      );
      arm.rotation.z = THREE.MathUtils.damp(
        arm.rotation.z,
        greeting && index === 1 ? 0.24 : side * 0.04,
        7,
        delta,
      );
      actor.lowerArms[index].rotation.x = THREE.MathUtils.damp(
        actor.lowerArms[index].rotation.x,
        greeting && index === 1
          ? -0.38 + Math.sin(elapsed * 8) * 0.25
          : -0.1 - Math.max(0, -Math.sin(gaitPhase + index * Math.PI)) * 0.16,
        8,
        delta,
      );
    }
    actor.upperBody.rotation.x = THREE.MathUtils.damp(
      actor.upperBody.rotation.x,
      -0.035 + Math.sin(gaitPhase * 0.5) * 0.018,
      6,
      delta,
    );
    return;
  }
  if (actor.isWatchingAquarium) {
    const idleSway = Math.sin(elapsed * 1.4 + actor.offset);
    actor.body.position.y = THREE.MathUtils.damp(
      actor.body.position.y,
      idleSway * 0.006,
      3,
      delta,
    );
    actor.body.position.z = THREE.MathUtils.damp(
      actor.body.position.z,
      0,
      5,
      delta,
    );
    actor.upperBody.rotation.x = THREE.MathUtils.damp(
      actor.upperBody.rotation.x,
      -0.035,
      3,
      delta,
    );
    actor.upperBody.rotation.z = THREE.MathUtils.damp(
      actor.upperBody.rotation.z,
      idleSway * 0.012,
      3,
      delta,
    );
    actor.head.rotation.x = THREE.MathUtils.damp(
      actor.head.rotation.x,
      -0.08 + Math.sin(elapsed * 0.6 + actor.offset) * 0.025,
      2.5,
      delta,
    );
    actor.head.rotation.z = THREE.MathUtils.damp(
      actor.head.rotation.z,
      Math.sin(elapsed * 0.42 + actor.offset) * 0.018,
      2.5,
      delta,
    );
    actor.arms[0].rotation.x = THREE.MathUtils.damp(actor.arms[0].rotation.x, 0.06, 3, delta);
    actor.arms[1].rotation.x = THREE.MathUtils.damp(actor.arms[1].rotation.x, 0.06, 3, delta);
    actor.arms[0].rotation.z = THREE.MathUtils.damp(actor.arms[0].rotation.z, -0.1, 3, delta);
    actor.arms[1].rotation.z = THREE.MathUtils.damp(actor.arms[1].rotation.z, 0.1, 3, delta);
    actor.lowerArms[0].rotation.x = THREE.MathUtils.damp(actor.lowerArms[0].rotation.x, -0.08, 3, delta);
    actor.lowerArms[1].rotation.x = THREE.MathUtils.damp(actor.lowerArms[1].rotation.x, -0.08, 3, delta);
    for (const wrist of actor.wrists) {
      wrist.rotation.z = THREE.MathUtils.damp(wrist.rotation.z, 0, 3, delta);
    }
    for (const [index, leg] of actor.legs.entries()) {
      leg.rotation.x = THREE.MathUtils.damp(
        leg.rotation.x,
        Math.sin(elapsed * 0.8 + actor.offset + index) * 0.012,
        3,
        delta,
      );
    }
    for (const lowerLeg of actor.lowerLegs) {
      lowerLeg.rotation.x = THREE.MathUtils.damp(lowerLeg.rotation.x, 0, 3, delta);
    }
    if (greeting) {
      actor.arms[1].rotation.x = THREE.MathUtils.damp(
        actor.arms[1].rotation.x,
        -0.72,
        6,
        delta,
      );
      actor.arms[1].rotation.z = THREE.MathUtils.damp(
        actor.arms[1].rotation.z,
        0.22,
        6,
        delta,
      );
      actor.lowerArms[1].rotation.x = THREE.MathUtils.damp(
        actor.lowerArms[1].rotation.x,
        -0.38 + Math.sin(elapsed * 8) * 0.24,
        7,
        delta,
      );
    }
    return;
  }
  const actionActivity = actor.activity;
  if (
    !actor.currentAction ||
    actor.currentAction.activity !== actionActivity ||
    actor.actionTime <= 0
  ) {
    actor.currentAction = chooseActorAction(
      actionActivity,
      actor.currentAction?.id ?? null,
    );
    actor.actionTime = 3.5 + Math.random() * 5;
  } else {
    actor.actionTime -= delta;
  }
  const currentAction = actor.currentAction;
  if (!currentAction) return;
  const actionPose = getActorActionPose(
    currentAction,
    elapsed + actor.offset,
  );
  const gesturePhase = elapsed * 2.8 + actor.offset;
  const carryingPackage = actor.deliveryTask === "pickup";
  actor.body.position.y = THREE.MathUtils.damp(
    actor.body.position.y,
    -0.2 + (sleeping ? 0 : Math.sin(gesturePhase * 2) * 0.008),
    5,
    delta,
  );
  const callingPose = actor.deliveryTask === "calling"
    ? {
        ...actionPose,
        leftArmX: -0.12,
        rightArmX: -0.35,
        rightForearmX: -1.35,
        headX: 0.06,
      }
    : actionPose;
  const sleepingPose = sleeping
    ? {
        ...callingPose,
        leftArmX: -0.72,
        rightArmX: -0.88,
        leftArmZ: -0.16,
        rightArmZ: 0.16,
        leftForearmX: -1.05,
        rightForearmX: -0.88,
        headX: 0.42,
        headZ: 0,
      }
    : callingPose;
  actor.head.rotation.x = THREE.MathUtils.damp(
    actor.head.rotation.x,
    carryingPackage ? 0.08 : sleepingPose.headX,
    4,
    delta,
  );
  actor.head.rotation.y = THREE.MathUtils.damp(
    actor.head.rotation.y,
    sleepingPose.headY,
    3.5,
    delta,
  );
  actor.head.rotation.z = THREE.MathUtils.damp(
    actor.head.rotation.z,
    carryingPackage ? 0 : sleepingPose.headZ,
    4,
    delta,
  );
  actor.arms[0].rotation.x = THREE.MathUtils.damp(
    actor.arms[0].rotation.x,
    carryingPackage ? -0.68 : sleepingPose.leftArmX,
    5,
    delta,
  );
  actor.arms[1].rotation.x = THREE.MathUtils.damp(
    actor.arms[1].rotation.x,
    carryingPackage ? -0.68 : sleepingPose.rightArmX,
    5,
    delta,
  );
  actor.arms[0].rotation.z = THREE.MathUtils.damp(
    actor.arms[0].rotation.z,
    carryingPackage ? -0.12 : sleepingPose.leftArmZ,
    5,
    delta,
  );
  actor.arms[1].rotation.z = THREE.MathUtils.damp(
    actor.arms[1].rotation.z,
    carryingPackage ? 0.12 : sleepingPose.rightArmZ,
    5,
    delta,
  );
  actor.lowerArms[0].rotation.x = THREE.MathUtils.damp(
    actor.lowerArms[0].rotation.x,
    carryingPackage ? -0.72 : sleepingPose.leftForearmX,
    6,
    delta,
  );
  actor.lowerArms[1].rotation.x = THREE.MathUtils.damp(
    actor.lowerArms[1].rotation.x,
    carryingPackage ? -0.72 : sleepingPose.rightForearmX,
    6,
    delta,
  );
  for (const [index, wrist] of actor.wrists.entries()) {
    const targetWristZ =
      index === 0 ? sleepingPose.leftWristZ : sleepingPose.rightWristZ;
    wrist.rotation.z = THREE.MathUtils.damp(
      wrist.rotation.z,
      targetWristZ,
      6,
      delta,
    );
  }
  actor.body.rotation.z = THREE.MathUtils.damp(
    actor.body.rotation.z,
    sleepingPose.bodyZ,
    3,
    delta,
  );
  actor.upperBody.rotation.x = THREE.MathUtils.damp(
    actor.upperBody.rotation.x,
    sleepingPose.bodyX,
    3.5,
    delta,
  );
  const seated =
    actor.deliveryTask !== "waiting" &&
    actor.deliveryTask !== "pickup" &&
    (actor.activity === "working" ||
      actor.activity === "chatting" ||
      actor.activity === "eating" ||
      actor.activity === "sleeping");
  actor.body.position.z = THREE.MathUtils.damp(
    actor.body.position.z,
    seated ? 0.08 : 0,
    7,
    delta,
  );
  actor.legs[0].rotation.x = THREE.MathUtils.damp(
    actor.legs[0].rotation.x,
    seated ? -1.2 : 0.15,
    5,
    delta,
  );
  actor.legs[1].rotation.x = THREE.MathUtils.damp(
    actor.legs[1].rotation.x,
    seated ? -1.2 : 0.15,
    5,
    delta,
  );
  actor.lowerLegs[0].rotation.x = THREE.MathUtils.damp(
    actor.lowerLegs[0].rotation.x,
    seated ? 1.2 + (sleeping ? 0 : Math.sin(gesturePhase) * 0.025) : 0,
    5,
    delta,
  );
  actor.lowerLegs[1].rotation.x = THREE.MathUtils.damp(
    actor.lowerLegs[1].rotation.x,
    seated ? 1.2 + (sleeping ? 0 : Math.sin(gesturePhase + 1.4) * 0.025) : 0,
    5,
    delta,
  );
  if (greeting || acknowledging) {
    actor.head.rotation.x = THREE.MathUtils.damp(
      actor.head.rotation.x,
      acknowledging
        ? 0.1 + Math.sin(elapsed * 5) * 0.08
        : 0.015,
      6,
      delta,
    );
    actor.head.rotation.y = THREE.MathUtils.damp(
      actor.head.rotation.y,
      0.16,
      6,
      delta,
    );
    actor.arms[1].rotation.x = THREE.MathUtils.damp(
      actor.arms[1].rotation.x,
      -0.72,
      6,
      delta,
    );
    actor.arms[1].rotation.z = THREE.MathUtils.damp(
      actor.arms[1].rotation.z,
      0.22,
      6,
      delta,
    );
    actor.lowerArms[1].rotation.x = THREE.MathUtils.damp(
      actor.lowerArms[1].rotation.x,
      -0.38 + Math.sin(elapsed * 8) * 0.24,
      7,
      delta,
    );
  }
}
