export type OfficeLiveActorActivity =
  | "walking"
  | "working"
  | "chatting"
  | "eating"
  | "sleeping";

export type OfficeLiveDeliveryTask =
  | "none"
  | "calling"
  | "communication_wait"
  | "outbound"
  | "waiting"
  | "pickup"
  | "returning";

export type OfficeLiveCourierPhase =
  | "idle"
  | "actor_call"
  | "communication_wait"
  | "approaching"
  | "calling"
  | "waiting_actor"
  | "pickup"
  | "mounting"
  | "departing";

export type OfficeLiveActorSnapshot = {
  username: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  activity: OfficeLiveActorActivity;
  deliveryTask: OfficeLiveDeliveryTask;
  zone: string | null;
  isWatchingAquarium?: boolean;
  phoneVisible: boolean;
  packageVisible: boolean;
};

export type OfficeLiveObjectSnapshot = {
  id: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  visible: boolean;
  opacity: number;
};

export type OfficeLiveSnapshot = {
  capturedAt: number;
  actors: OfficeLiveActorSnapshot[];
  objects: OfficeLiveObjectSnapshot[];
  courier: {
    phase: OfficeLiveCourierPhase;
    recipientUsername: string | null;
    phoneVisible: boolean;
    packageVisible: boolean;
    kickstandVisible: boolean;
    riderHeight: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOfficeLiveActorActivity(
  value: unknown,
): value is OfficeLiveActorActivity {
  return (
    value === "walking" ||
    value === "working" ||
    value === "chatting" ||
    value === "eating" ||
    value === "sleeping"
  );
}

function isOfficeLiveDeliveryTask(value: unknown): value is OfficeLiveDeliveryTask {
  return (
    value === "none" ||
    value === "calling" ||
    value === "communication_wait" ||
    value === "outbound" ||
    value === "waiting" ||
    value === "pickup" ||
    value === "returning"
  );
}

function isOfficeLiveCourierPhase(value: unknown): value is OfficeLiveCourierPhase {
  return (
    value === "idle" ||
    value === "actor_call" ||
    value === "communication_wait" ||
    value === "approaching" ||
    value === "calling" ||
    value === "waiting_actor" ||
    value === "pickup" ||
    value === "mounting" ||
    value === "departing"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseOfficeLiveSnapshot(
  value: unknown,
): OfficeLiveSnapshot | null {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.capturedAt) ||
    !Array.isArray(value.actors) ||
    !Array.isArray(value.objects) ||
    !isRecord(value.courier) ||
    !isOfficeLiveCourierPhase(value.courier.phase) ||
    (value.courier.recipientUsername !== null &&
      typeof value.courier.recipientUsername !== "string") ||
    typeof value.courier.phoneVisible !== "boolean" ||
    typeof value.courier.packageVisible !== "boolean" ||
    typeof value.courier.kickstandVisible !== "boolean" ||
    !isFiniteNumber(value.courier.riderHeight) ||
    value.actors.length > 32 ||
    value.objects.length > 128
  ) {
    return null;
  }
  const actors: OfficeLiveActorSnapshot[] = [];
  const usernames = new Set<string>();
  for (const actor of value.actors) {
    if (
      !isRecord(actor) ||
      typeof actor.username !== "string" ||
      !actor.username.trim() ||
      usernames.has(actor.username.toLowerCase()) ||
      !isFiniteNumber(actor.x) ||
      !isFiniteNumber(actor.y) ||
      !isFiniteNumber(actor.z) ||
      !isFiniteNumber(actor.rotation) ||
      !isOfficeLiveActorActivity(actor.activity) ||
      !isOfficeLiveDeliveryTask(actor.deliveryTask) ||
      (actor.zone !== undefined &&
        actor.zone !== null &&
        (typeof actor.zone !== "string" ||
          ![
            "administration",
            "executive",
            "documents",
            "aquarium",
            "meeting",
            "cafe",
            "restroom",
            "communication",
            "personnel",
            "reception",
            "lounge",
          ].includes(actor.zone))) ||
      typeof actor.phoneVisible !== "boolean" ||
      typeof actor.packageVisible !== "boolean" ||
      (actor.isWatchingAquarium !== undefined &&
        typeof actor.isWatchingAquarium !== "boolean")
    ) {
      return null;
    }
    usernames.add(actor.username.toLowerCase());
    actors.push({
      username: actor.username,
      x: actor.x,
      y: actor.y,
      z: actor.z,
      rotation: actor.rotation,
      activity: actor.activity,
      deliveryTask: actor.deliveryTask,
      zone: typeof actor.zone === "string" ? actor.zone : null,
      isWatchingAquarium: actor.isWatchingAquarium === true,
      phoneVisible: actor.phoneVisible,
      packageVisible: actor.packageVisible,
    });
  }
  const objects: OfficeLiveObjectSnapshot[] = [];
  const objectIds = new Set<string>();
  for (const object of value.objects) {
    if (
      !isRecord(object) ||
      typeof object.id !== "string" ||
      !object.id ||
      objectIds.has(object.id) ||
      !isFiniteNumber(object.x) ||
      !isFiniteNumber(object.y) ||
      !isFiniteNumber(object.z) ||
      !isFiniteNumber(object.rotation) ||
      typeof object.visible !== "boolean" ||
      !isFiniteNumber(object.opacity) ||
      object.opacity < 0 ||
      object.opacity > 1
    ) {
      return null;
    }
    objectIds.add(object.id);
    objects.push({
      id: object.id,
      x: object.x,
      y: object.y,
      z: object.z,
      rotation: object.rotation,
      visible: object.visible,
      opacity: object.opacity,
    });
  }
  return {
    capturedAt: value.capturedAt,
    actors,
    objects,
    courier: {
      phase: value.courier.phase,
      recipientUsername: value.courier.recipientUsername,
      phoneVisible: value.courier.phoneVisible,
      packageVisible: value.courier.packageVisible,
      kickstandVisible: value.courier.kickstandVisible,
      riderHeight: value.courier.riderHeight,
    },
  };
}

export function interpolateOfficeAngle(
  current: number,
  target: number,
  amount: number,
): number {
  const clampedAmount = Math.max(0, Math.min(1, amount));
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + difference * clampedAmount;
}
