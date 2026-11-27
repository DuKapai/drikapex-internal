import { describe, expect, it } from "vitest";
import {
  assignMeetingSeats,
  canEnterAdministrativeRoom,
  canEnterOfficeZone,
  excludeCurrentOfficeSpot,
  getOfficeSceneMembers,
  getPreferredOfficeZone,
} from "../lib/office-actor-rules";

describe("getOfficeSceneMembers", () => {
  it("only offers camera targets that are actually rendered in the scene", () => {
    const members = [
      { username: "staff0001" },
      { username: "dung0001" },
      { username: "staff0002" },
      { username: "staff0003" },
    ];

    expect(getOfficeSceneMembers(members, 2)).toEqual([
      members[1],
      members[0],
    ]);
  });
});

describe("canEnterAdministrativeRoom", () => {
  it("allows dung0001 regardless of username casing or surrounding spaces", () => {
    expect(canEnterAdministrativeRoom("dung0001")).toBe(true);
    expect(canEnterAdministrativeRoom(" DUNG0001 ")).toBe(true);
  });

  describe("restricted office zones", () => {
    it("reserves the executive room for its two managers", () => {
      expect(canEnterOfficeZone("phong0002", "executive")).toBe(true);
      expect(canEnterOfficeZone("truong0003", "executive")).toBe(true);
      expect(canEnterOfficeZone("dung0001", "executive")).toBe(false);
    });

    it("reserves the document center for anh0004", () => {
      expect(canEnterOfficeZone("anh0004", "documents")).toBe(true);
      expect(canEnterOfficeZone("phong0002", "documents")).toBe(false);
    });

    it("keeps public circulation areas open to every actor", () => {
      expect(canEnterOfficeZone("staff0005", "cafe")).toBe(true);
      expect(canEnterOfficeZone(null, "meeting")).toBe(true);
    });
  });

  describe("role-based office routines", () => {
    it("keeps dung0001 assigned to the administration office", () => {
      expect(getPreferredOfficeZone("dung0001", 0.79)).toBe("administration");
      expect(getPreferredOfficeZone("dung0001", 0.8)).toBe("administration");
      expect(getPreferredOfficeZone("dung0001", 0.95)).toBe("administration");
      expect(getPreferredOfficeZone(" DUNG0001 ", 0.999)).toBe("administration");
    });

    it("does not send an actor straight back to the seat they are leaving", () => {
      const spots = [
        { resourceId: "desk-1", id: "work" },
        { resourceId: "desk-1", id: "sleep" },
        { resourceId: "lounge-1", id: "lounge" },
      ];

      expect(excludeCurrentOfficeSpot(spots, "desk-1")).toEqual([
        { resourceId: "lounge-1", id: "lounge" },
      ]);
      expect(excludeCurrentOfficeSpot(spots, null)).toEqual(spots);
    });

    it("prioritizes dedicated manager and document desks", () => {
      expect(getPreferredOfficeZone("phong0002", 0.89)).toBe("executive");
      expect(getPreferredOfficeZone("truong0003", 0.9)).toBe("cafe");
      expect(getPreferredOfficeZone("anh0004", 0.89)).toBe("documents");
    });

    it("distributes other actors across public areas instead of one central zone", () => {
      expect(getPreferredOfficeZone("staff0005", 0.05)).toBe("communication");
      expect(getPreferredOfficeZone("staff0005", 0.25)).toBe("personnel");
      expect(getPreferredOfficeZone("staff0005", 0.45)).toBe("cafe");
      expect(getPreferredOfficeZone("staff0005", 0.65)).toBe("reception");
      expect(getPreferredOfficeZone("staff0005", 0.85)).toBe("lounge");
    });
  });

  describe("assignMeetingSeats", () => {
    it("reserves the head seat for dung0001 and distributes only attendee seats to others", () => {
      const actors = [
        { username: "staff0005" },
        { username: " DUNG0001 " },
        { username: "staff0006" },
      ];

      expect(assignMeetingSeats(actors, "head-seat", ["side-a", "side-b"])).toEqual([
        { actor: actors[1], seat: "head-seat" },
        { actor: actors[0], seat: "side-a" },
        { actor: actors[2], seat: "side-b" },
      ]);
    });

    it("does not start a hosted meeting without dung0001", () => {
      expect(
        assignMeetingSeats([{ username: "staff0005" }], "head-seat", ["side-a"]),
      ).toEqual([]);
    });
  });

  it("denies every other username and missing identity", () => {
    expect(canEnterAdministrativeRoom("anh0004")).toBe(false);
    expect(canEnterAdministrativeRoom("dung00010")).toBe(false);
    expect(canEnterAdministrativeRoom(null)).toBe(false);
  });
});
