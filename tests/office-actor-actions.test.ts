import { describe, expect, it } from "vitest";
import {
  actorActions,
  chooseActorAction,
  getActorActionPose,
  riderActionSets,
} from "../lib/office-actor-actions";

describe("office actor actions", () => {
  it("provides more than 100 distinct action variations across office activities", () => {
    expect(actorActions.length).toBeGreaterThan(100);
    expect(new Set(actorActions.map((action) => action.id)).size).toBe(
      actorActions.length,
    );
    for (const activity of ["working", "chatting", "eating", "sleeping"] as const) {
      expect(actorActions.filter((action) => action.activity === activity).length)
        .toBeGreaterThan(0);
    }
  });

  it("selects an action for the current activity without repeating immediately", () => {
    const first = chooseActorAction("working", null, () => 0);
    const next = chooseActorAction("working", first.id, () => 0);

    expect(first.activity).toBe("working");
    expect(next.activity).toBe("working");
    expect(next.id).not.toBe(first.id);
  });

  it("keeps all generated joint poses finite", () => {
    for (const action of actorActions) {
      const pose = getActorActionPose(action, 1.7);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
    }
  });

  it("keeps separate action sets for courier, motorcyclist, and police roles", () => {
    expect(riderActionSets.courier).toContain("handoff");
    expect(riderActionSets.motorcyclist).toContain("steer");
    expect(riderActionSets.police).toContain("police-pursuit");
    expect(new Set(riderActionSets.courier).size).toBeGreaterThan(1);
    expect(new Set(riderActionSets.motorcyclist).size).toBeGreaterThan(1);
    expect(new Set(riderActionSets.police).size).toBeGreaterThan(1);
  });
});
