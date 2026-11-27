import { describe, expect, it } from "vitest";
import { canSaveMonthlyTaskAssignees, toggleMonthlyTaskAssignee } from "../lib/monthly-task-assignees";

describe("monthly task assignees", () => {
  it("adds the current employee when assigning a colleague and requires them to stay", () => {
    const added = toggleMonthlyTaskAssignee(["self"], "colleague", true, "self", false);
    expect(added).toEqual({ userIds: ["self", "colleague"], selfRequired: false });

    const removed = toggleMonthlyTaskAssignee(added.userIds, "self", false, "self", false);
    expect(removed).toEqual({ userIds: ["self", "colleague"], selfRequired: true });
    expect(canSaveMonthlyTaskAssignees(removed.userIds, "self", false)).toBe(true);
  });

  it("lets the Owner assign other people without self, but not an empty team", () => {
    const added = toggleMonthlyTaskAssignee([], "colleague", true, "owner", true);
    expect(added.userIds).toEqual(["colleague"]);
    expect(canSaveMonthlyTaskAssignees(added.userIds, "owner", true)).toBe(true);
    expect(canSaveMonthlyTaskAssignees([], "owner", true)).toBe(false);
  });
});
