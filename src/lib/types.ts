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
