export type RestrictedOfficeZone =
  | "administration"
  | "executive"
  | "documents";

export type PreferredOfficeZone =
  | RestrictedOfficeZone
  | "cafe"
  | "communication"
  | "personnel"
  | "reception"
  | "lounge"
  | null;

const zoneAccess: Record<RestrictedOfficeZone, readonly string[]> = {
  administration: ["dung0001", "cleaning_staff"],
  executive: ["phong0002", "truong0003"],
  documents: ["anh0004"],
};

const priorityOfficeActors = new Set([
  "dung0001",
  "phong0002",
  "truong0003",
  "anh0004",
]);

export function getOfficeSceneMembers<
  TMember extends { username: string | null },
>(members: readonly TMember[], limit = 16): TMember[] {
  const priorityMembers = members.filter((member) =>
    priorityOfficeActors.has(member.username?.trim().toLowerCase() ?? ""),
  );
  const otherMembers = members.filter(
    (member) =>
      !priorityOfficeActors.has(member.username?.trim().toLowerCase() ?? ""),
  );
  return [...priorityMembers, ...otherMembers].slice(0, limit);
}

export function canEnterOfficeZone(
  username: string | null,
  zone: string,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(zoneAccess, zone)) return true;
  const normalizedUsername = username?.trim().toLowerCase();
  return normalizedUsername
    ? zoneAccess[zone as RestrictedOfficeZone].includes(normalizedUsername)
    : false;
}

export function canEnterAdministrativeRoom(username: string | null): boolean {
  return canEnterOfficeZone(username, "administration");
}

export function getPreferredOfficeZone(
  username: string | null,
  selection: number,
): PreferredOfficeZone {
  const normalizedUsername = username?.trim().toLowerCase();
  if (normalizedUsername === "dung0001") {
    return "administration";
  }
  if (normalizedUsername === "phong0002" || normalizedUsername === "truong0003") {
    return selection < 0.9 ? "executive" : "cafe";
  }
  if (normalizedUsername === "anh0004") {
    return selection < 0.9 ? "documents" : "cafe";
  }
  const publicZones = [
    "communication",
    "personnel",
    "cafe",
    "reception",
    "lounge",
  ] as const;
  return publicZones[
    Math.min(publicZones.length - 1, Math.floor(selection * publicZones.length))
  ];
}

export function excludeCurrentOfficeSpot<
  TSpot extends { resourceId: string },
>(
  spots: readonly TSpot[],
  currentResourceId: string | null,
): TSpot[] {
  return currentResourceId === null
    ? [...spots]
    : spots.filter((spot) => spot.resourceId !== currentResourceId);
}

export function assignMeetingSeats<
  TActor extends { username: string | null },
  TSeat,
>(
  actors: readonly TActor[],
  chairpersonSeat: TSeat,
  attendeeSeats: readonly TSeat[],
): { actor: TActor; seat: TSeat }[] {
  const chairperson = actors.find(
    (actor) => actor.username?.trim().toLowerCase() === "dung0001",
  );
  if (!chairperson) return [];

  const assignments = [{ actor: chairperson, seat: chairpersonSeat }];
  const attendees = actors.filter((actor) => actor !== chairperson);
  for (const [index, actor] of attendees.entries()) {
    const seat = attendeeSeats[index];
    if (!seat) break;
    assignments.push({ actor, seat });
  }
  return assignments;
}
