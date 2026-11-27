import { describe, expect, it } from "vitest";
import {
  interpolateOfficeAngle,
  parseOfficeLiveSnapshot,
} from "../lib/office-live";

describe("parseOfficeLiveSnapshot", () => {
  it("accepts a complete scene snapshot", () => {
    expect(
      parseOfficeLiveSnapshot({
        capturedAt: 123,
        actors: [
          {
            username: "anh0004",
            x: 1,
            y: 0,
            z: 2,
            rotation: 0.5,
            activity: "walking",
            deliveryTask: "none",
            zone: "aquarium",
            isWatchingAquarium: true,
            phoneVisible: false,
            packageVisible: false,
          },
        ],
        objects: [
          {
            id: "courier",
            x: 3,
            y: 0,
            z: 4,
            rotation: 0,
            visible: true,
            opacity: 0.8,
          },
        ],
        courier: {
          phase: "idle",
          recipientUsername: null,
          phoneVisible: false,
          packageVisible: false,
          kickstandVisible: false,
          riderHeight: 0.62,
        },
      }),
    ).toMatchObject({
      actors: [{ isWatchingAquarium: true, zone: "aquarium" }],
    });
  });

  it("rejects malformed or duplicate actor data", () => {
    expect(
      parseOfficeLiveSnapshot({
        capturedAt: 123,
        actors: [
          {
            username: "anh0004",
            x: Number.NaN,
            y: 0,
            z: 0,
            rotation: 0,
            activity: "walking",
            deliveryTask: "none",
            phoneVisible: false,
            packageVisible: false,
          },
        ],
        objects: [],
        courier: {
          phase: "idle",
          recipientUsername: null,
          phoneVisible: false,
          packageVisible: false,
          kickstandVisible: false,
          riderHeight: 0.62,
        },
      }),
    ).toBeNull();
  });

  it("rejects actor snapshots with an unknown office zone", () => {
    expect(
      parseOfficeLiveSnapshot({
        capturedAt: 123,
        actors: [
          {
            username: "anh0004",
            x: 1,
            y: 0,
            z: 2,
            rotation: 0.5,
            activity: "walking",
            deliveryTask: "none",
            zone: "unknown",
            phoneVisible: false,
            packageVisible: false,
          },
        ],
        objects: [],
        courier: {
          phase: "idle",
          recipientUsername: null,
          phoneVisible: false,
          packageVisible: false,
          kickstandVisible: false,
          riderHeight: 0.62,
        },
      }),
    ).toBeNull();
  });
});

describe("interpolateOfficeAngle", () => {
  it("takes the shortest turn across the angle wraparound", () => {
    expect(interpolateOfficeAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(
      Math.PI,
    );
  });
});
