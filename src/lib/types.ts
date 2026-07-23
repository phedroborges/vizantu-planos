export type PlanKind = "approval" | "presentation";

export type Plan = {
  slug: string;
  title: string;
  originalName: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  kind?: PlanKind;
  approvalDeadline?: string;
  approvalPeriodDays?: number;
  reviewVersion?: number;
  versionUpdatedAt?: string;
  htmlUrl?: string;
  metadataUrl?: string;
};

export type PlanWithHtml = {
  plan: Plan;
  html: string;
};

export type ApprovalStatus = "pending" | "approved" | "changes_requested";

export type ApprovalResponse = {
  reviewerId: string;
  approverName: string;
  status: ApprovalStatus;
  comment: string;
  updatedAt: string;
  reviewVersion?: number;
};

export type ApprovalItem = {
  id: string;
  title: string;
  status: ApprovalStatus;
  comment: string;
  updatedAt?: string;
  approverName?: string;
  responses?: ApprovalResponse[];
};

export type ApprovalEvent = {
  id: string;
  itemId: string;
  itemTitle: string;
  action: "approved" | "changes_requested" | "commented" | "reopened";
  status: ApprovalStatus;
  previousStatus: ApprovalStatus;
  comment: string;
  createdAt: string;
  approverName?: string;
  reviewerId?: string;
  reviewVersion?: number;
};

export type PlanApprovals = {
  planSlug: string;
  items: ApprovalItem[];
  history: ApprovalEvent[];
  updatedAt?: string;
  eventIds?: string[];
  autoApproved?: boolean;
  deadlineAt?: string;
  reviewVersion?: number;
};

export type ApprovalSummary = {
  total: number;
  approved: number;
  changesRequested: number;
  pending: number;
  status: "not_started" | "pending" | "in_review" | "approved" | "changes_requested";
  updatedAt?: string;
  autoApproved?: boolean;
  deadlineAt?: string;
  roundComplete?: boolean;
  reviewVersion?: number;
};
