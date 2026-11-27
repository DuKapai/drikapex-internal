export function toggleMonthlyTaskAssignee(
  currentIds: string[],
  selectedId: string,
  checked: boolean,
  actorId: string,
  owner: boolean,
): { userIds: string[]; selfRequired: boolean } {
  if (!owner && !checked && selectedId === actorId) {
    return { userIds: currentIds, selfRequired: true };
  }
  const next = new Set(currentIds);
  if (checked) next.add(selectedId);
  else next.delete(selectedId);

  if (!owner && checked && selectedId !== actorId) next.add(actorId);
  return { userIds: [...next], selfRequired: false };
}

export function canSaveMonthlyTaskAssignees(
  userIds: string[],
  actorId: string,
  owner: boolean,
): boolean {
  return userIds.length > 0 && (owner || userIds.includes(actorId));
}
