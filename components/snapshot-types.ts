export interface SnapshotListItem {
  id: string;
  name: string;
  state: string;
  isActive?: boolean;
  createdOn?: string | Date;
  updatedAt?: string | Date;
}

export const normalizeSnapshotStateLabel = (state: string) => {
  if (state === "wip") return "WIP";
  if (state === "for_approval") return "For Approval";
  if (state === "ready") return "Ready";
  return state;
};
