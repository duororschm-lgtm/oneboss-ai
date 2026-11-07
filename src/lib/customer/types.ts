import type { z } from 'zod';
import type {
  Brief,
  DesignSystem,
  Fact,
  Production,
  IntakeResult,
  DesignChoices,
} from '../../contracts';
export type Row = Record<string, any>;
export type Plan = {
  code: string;
  name: string;
  price_minor: number;
  currency: string;
  product_limit: number;
  poster_count: number;
  revision_rounds: number;
  hosting_days: number;
};
export type Account = { isAdmin:boolean;organizations: Row[]; orders: Row[]; projects: Row[] };
export type Run = {
  id: string;
  role: string;
  factVersion?: number;
  status: string;
  attempt: number;
  error_class?: string;
  usage: Row;
  output: z.infer<typeof IntakeResult> | z.infer<typeof DesignChoices> | Row;
  created_at: string;
  completed_at?: string;
};
export type Workspace = {
  project: Row;
  order: Row;
  entitlement: Row;
  products: { id: string; name: string; description: string }[];
  facts: z.infer<typeof Fact>[];
  assets: { id: string; width: number; height: number; license_status: string }[];
  briefs: { revision: number; body: z.infer<typeof Brief>; approved_at?: string }[];
  designs: { revision: number; body: z.infer<typeof DesignSystem> }[];
  versions: {
    revision: number;
    fact_version: number;
    status: string;
    body: z.infer<typeof Production>;
    created_at: string;
  }[];
  runs: Run[];
};
