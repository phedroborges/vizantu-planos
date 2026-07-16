export type Plan = {
  slug: string;
  title: string;
  originalName: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  htmlUrl?: string;
  metadataUrl?: string;
};

export type PlanWithHtml = {
  plan: Plan;
  html: string;
};

export type ApprovalStatus = "pending" | "approved" | "changes_requested";

export type ApprovalItem = {
  id: string;
  title: string;
  status: ApprovalStatus;
  comment: string;
  updatedAt?: string;
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
};

export type PlanApprovals = {
  planSlug: string;
  items: ApprovalItem[];
  history: ApprovalEvent[];
  updatedAt?: string;
};

export type ApprovalSummary = {
  total: number;
  approved: number;
  changesRequested: number;
  pending: number;
  status: "not_started" | "pending" | "in_review" | "approved" | "changes_requested";
  updatedAt?: string;
};
