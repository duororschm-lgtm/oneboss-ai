import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { designPresets } from '../data/design-presets';
import { plans, findPlan } from '../data/plans';
import { defaultProjectId, projectSeeds } from '../data/projects';
import type {
  ChangeRequest,
  DesignSystem,
  Order,
  Palette,
  PosterCopyBundle,
  PosterSpec,
  Product,
  ProjectSeed,
  SiteSpec,
  StyleId,
} from '../types/contracts';
import { projectSeedSchema } from '../types/contracts';
import { confirmSandboxPayment, createOrder as apiCreateOrder, requestManualConfirmation, type CreateOrderInput } from './api/demo-api';
import { parseChangeRequest, BLACK_GOLD } from './creative/change-request';
import { applyDesignOverride, buildCopies, buildPoster, buildSiteSpec, resolveProducts } from './creative/composer';
import { generateProjectFromBrief, type BriefInput, type GeneratedProject } from './creative/project-generator';
import type { QrDecision, QrRequested } from './creative/poster-renderer/geometry';

export interface IntakeState {
  answered: string[];
  skipped: string[];
  note: string;
  briefApproved: boolean;
}

export interface PublishedState {
  siteRevision: number;
  styleId: StyleId;
  paletteOverride: Partial<Palette> | null;
  nameOverride: string | null;
  factOverrides: Record<string, string>;
  factVersion: number;
  at: string;
}

export interface ProjectState {
  styleId: StyleId;
  revision: number;
  siteRevision: number;
  posterRevision: number;
  copyRevision: number;
  sitePaletteOverride: Partial<Palette> | null;
  siteNameOverride: string | null;
  posterQrRequested: QrRequested;
  headlineOverride: string | null;
  factOverrides: Record<string, string>;
  factVersion: number;
  published: PublishedState | null;
  acceptedAt: string | null;
  changeRequests: ChangeRequest[];
  intake: IntakeState;
  designApproved: boolean;
}

export interface AppState {
  orders: Order[];
  projects: Record<string, ProjectState>;
  /** 由客户描述生成的 seed，和固定 fixture 一起参与渲染与路由 */
  customSeeds: Record<string, ProjectSeed>;
}

export interface ProjectBundle {
  seed: ProjectSeed;
  state: ProjectState;
  designBase: DesignSystem;
  designSite: DesignSystem;
  products: Product[];
  siteSpec: SiteSpec;
  posters: PosterSpec[];
  posterDecisions: Record<number, QrDecision>;
  copies: PosterCopyBundle[];
  warnings: string[];
  qrUrl: string;
  qrSource: 'fixture-preview' | 'published-site';
  publishedUrl: string;
  origin: string;
  factVersion: number;
}

const STORAGE_KEY = 'oneboss.demo.state.v3';
const fallbackOrigin = 'http://localhost:4173';

const initialIntake = (seed: ProjectSeed): IntakeState => ({
  answered: [],
  skipped: [],
  note: '',
  briefApproved: false,
});

const initialProjectState = (seed: ProjectSeed): ProjectState => ({
  styleId: seed.designStyles[0],
  revision: 1,
  siteRevision: 1,
  posterRevision: 1,
  copyRevision: 1,
  sitePaletteOverride: null,
  siteNameOverride: null,
  posterQrRequested: 'auto',
  headlineOverride: null,
  factOverrides: {},
  factVersion: seed.factVersion,
  // 首屏演示项目带一个“已发布”的演示版本，方便直接展示交付中心与公开站点；
  // 发生只改网站的修改后会回到未发布状态，需要重新发布。
  published:
    seed.id === defaultProjectId
      ? {
          siteRevision: 1,
          styleId: seed.designStyles[0],
          paletteOverride: null,
          nameOverride: null,
          factOverrides: {},
          factVersion: seed.factVersion,
          at: '2026-11-06T02:40:00.000Z',
        }
      : null,
  acceptedAt: null,
  changeRequests: [],
  intake: seed.id === defaultProjectId ? { ...initialIntake(seed), briefApproved: true } : initialIntake(seed),
  designApproved: seed.id === defaultProjectId,
});

function seedOrders(): Order[] {
  const growth = findPlan('growth');
  const starter = findPlan('starter');
  if (!growth || !starter) throw new Error('套餐 fixture 缺失');
  return [
    {
      id: 'order-demo-001',
      orderNo: 'OB-20261106-001',
      planCode: growth.code,
      planName: growth.name,
      amountMinor: growth.priceMinor,
      currency: 'CNY',
      payState: 'DEMO_PAID',
      workState: 'CLIENT_REVIEW',
      isDemo: true,
      paymentMode: 'SANDBOX',
      projectId: 'demo-chair-001',
      projectSlug: 'demo-chair-001',
      customerName: '演示客户 · 木作工作室',
      createdAt: '2026-11-06T02:20:00.000Z',
    },
    {
      id: 'order-demo-002',
      orderNo: 'OB-20261106-002',
      planCode: starter.code,
      planName: starter.name,
      amountMinor: starter.priceMinor,
      currency: 'CNY',
      payState: 'UNPAID',
      workState: 'WAITING_INPUT',
      isDemo: true,
      paymentMode: 'SANDBOX',
      projectId: 'demo-noimg-003',
      projectSlug: 'demo-noimg-003',
      customerName: '演示客户 · 晨雾咖啡',
      createdAt: '2026-11-06T03:05:00.000Z',
    },
  ];
}

function createInitialState(): AppState {
  return {
    orders: seedOrders(),
    projects: Object.fromEntries(projectSeeds.map((seed) => [seed.id, initialProjectState(seed)])),
    customSeeds: {},
  };
}

const staticSeedMap = new Map(projectSeeds.map((seed) => [seed.id, seed]));

function loadState(): AppState {
  const base = createInitialState();
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const customSeeds: Record<string, ProjectSeed> = {};
    for (const [id, candidate] of Object.entries(parsed.customSeeds ?? {})) {
      const result = projectSeedSchema.safeParse(candidate);
      if (result.success && !staticSeedMap.has(id)) customSeeds[id] = result.data;
    }
    const projects: Record<string, ProjectState> = {};
    for (const seed of [...projectSeeds, ...Object.values(customSeeds)]) {
      const fallback = initialProjectState(seed);
      const stored = parsed.projects?.[seed.id];
      projects[seed.id] = stored
        ? { ...fallback, ...stored, intake: { ...fallback.intake, ...(stored.intake ?? {}) } }
        : fallback;
    }
    return {
      orders: Array.isArray(parsed.orders) ? (parsed.orders as Order[]) : base.orders,
      projects,
      customSeeds,
    };
  } catch {
    return base;
  }
}

function saveState(state: AppState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时仅保留内存状态 */
  }
}

function bundleFor(seed: ProjectSeed, state: ProjectState, origin: string): ProjectBundle {
  const designBase = designPresets[state.styleId];
  const designSite = applyDesignOverride(designBase, state.sitePaletteOverride, state.siteNameOverride ?? undefined);
  const published = state.published !== null;
  const publishedUrl = `${origin}/p/${seed.publishedSlug}`;
  const qrUrl = published ? publishedUrl : `${publishedUrl}?preview=1`;
  const qrSource = published ? 'published-site' : 'fixture-preview';
  const baseInput = {
    seed,
    design: designBase,
    siteRevision: state.siteRevision,
    posterRevision: state.posterRevision,
    copyRevision: state.copyRevision,
    factOverrides: state.factOverrides,
    factVersion: state.factVersion,
    qrUrl,
    qrSource: qrSource as 'fixture-preview' | 'published-site',
    qrRequested: state.posterQrRequested,
    headlineOverride: state.headlineOverride,
  };
  const siteSpec = buildSiteSpec({ ...baseInput, design: designSite });
  const portrait = buildPoster(baseInput, 1350);
  const square = buildPoster(baseInput, 1080);
  const copies = [buildCopies(baseInput, 1350), buildCopies(baseInput, 1080)];
  return {
    seed,
    state,
    designBase,
    designSite,
    products: resolveProducts(seed, state.factOverrides),
    siteSpec,
    posters: [portrait.spec, square.spec],
    posterDecisions: { 1350: portrait.decision, 1080: square.decision },
    copies,
    warnings: [...new Set([...siteSpec.warnings, ...portrait.warnings, ...square.warnings])],
    qrUrl,
    qrSource: qrSource as 'fixture-preview' | 'published-site',
    publishedUrl,
    origin,
    factVersion: state.factVersion,
  };
}

export function buildPublishedSite(seed: ProjectSeed, snapshot: PublishedState): SiteSpec {
  const design = applyDesignOverride(designPresets[snapshot.styleId], snapshot.paletteOverride, snapshot.nameOverride ?? undefined);
  return buildSiteSpec({
    seed,
    design,
    siteRevision: snapshot.siteRevision,
    posterRevision: 1,
    copyRevision: 1,
    factOverrides: snapshot.factOverrides,
    factVersion: snapshot.factVersion,
    qrUrl: '',
    qrSource: 'fixture-preview',
  });
}

interface StoreValue {
  state: AppState;
  plans: typeof plans;
  allSeeds: ProjectSeed[];
  getSeed: (projectId: string) => ProjectSeed;
  getSeedBySlug: (slug: string) => ProjectSeed | undefined;
  createProject: (input: BriefInput) => GeneratedProject;
  getProjectState: (projectId: string) => ProjectState;
  getBundle: (projectId: string) => ProjectBundle;
  selectStyle: (projectId: string, styleId: StyleId) => void;
  approveDesign: (projectId: string) => void;
  setQrRequested: (projectId: string, requested: QrRequested) => void;
  updateIntake: (projectId: string, patch: Partial<IntakeState>) => void;
  submitChange: (projectId: string, instruction: string) => ChangeRequest;
  applyChange: (projectId: string, requestId: string) => void;
  approveChange: (projectId: string, requestId: string) => void;
  rejectChange: (projectId: string, requestId: string) => void;
  approveFactChange: (projectId: string, requestId: string) => void;
  publish: (projectId: string) => Promise<{ url: string; revision: number }>;
  acceptDelivery: (projectId: string) => void;
  createOrder: (input: CreateOrderInput) => Promise<Order>;
  payDemo: (order: Order | string) => Promise<void>;
  requestManual: (order: Order | string) => Promise<void>;
  resetDemo: () => void;
}

const StudioContext = createContext<StoreValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const updateProject = useCallback((projectId: string, updater: (project: ProjectState) => ProjectState) => {
    setState((current) => {
      const project = current.projects[projectId];
      if (!project) return current;
      const next = updater(project);
      if (next === project) return current;
      return { ...current, projects: { ...current.projects, [projectId]: next } };
    });
  }, []);

  const getProjectState = useCallback(
    (projectId: string): ProjectState => {
      const project = state.projects[projectId];
      if (!project) throw new Error(`项目不存在：${projectId}`);
      return project;
    },
    [state.projects],
  );

  const origin = typeof window !== 'undefined' ? window.location.origin : fallbackOrigin;

  const allSeeds = useMemo(
    () => [...projectSeeds, ...Object.values(state.customSeeds)],
    [state.customSeeds],
  );

  const getSeed = useCallback(
    (projectId: string): ProjectSeed => {
      const seed = state.customSeeds[projectId] ?? staticSeedMap.get(projectId);
      if (!seed) throw new Error(`项目不存在：${projectId}`);
      return seed;
    },
    [state.customSeeds],
  );

  const getSeedBySlug = useCallback(
    (slug: string): ProjectSeed | undefined => allSeeds.find((seed) => seed.publishedSlug === slug || seed.slug === slug),
    [allSeeds],
  );

  const createProject = useCallback(
    (input: BriefInput): GeneratedProject => {
      const generated = generateProjectFromBrief(input, {
        existingSlugs: allSeeds.map((seed) => seed.publishedSlug),
      });
      setState((current) => ({
        ...current,
        customSeeds: { ...current.customSeeds, [generated.seed.id]: generated.seed },
        projects: { ...current.projects, [generated.seed.id]: initialProjectState(generated.seed) },
      }));
      return generated;
    },
    [allSeeds],
  );

  const getBundle = useCallback(
    (projectId: string): ProjectBundle => bundleFor(getSeed(projectId), getProjectState(projectId), origin),
    [getSeed, getProjectState, origin],
  );

  const selectStyle = useCallback(
    (projectId: string, styleId: StyleId) => {
      updateProject(projectId, (project) =>
        project.styleId === styleId
          ? project
          : {
              ...project,
              styleId,
              siteRevision: project.siteRevision + 1,
              posterRevision: project.posterRevision + 1,
              copyRevision: project.copyRevision + 1,
              revision: project.revision + 1,
              published: null,
              acceptedAt: null,
            },
      );
    },
    [updateProject],
  );

  const approveDesign = useCallback(
    (projectId: string) => updateProject(projectId, (project) => ({ ...project, designApproved: true })),
    [updateProject],
  );

  const setQrRequested = useCallback(
    (projectId: string, requested: QrRequested) => {
      updateProject(projectId, (project) =>
        project.posterQrRequested === requested
          ? project
          : { ...project, posterQrRequested: requested, posterRevision: project.posterRevision + 1, revision: project.revision + 1, acceptedAt: null },
      );
    },
    [updateProject],
  );

  const updateIntake = useCallback(
    (projectId: string, patch: Partial<IntakeState>) => {
      updateProject(projectId, (project) => ({ ...project, intake: { ...project.intake, ...patch } }));
    },
    [updateProject],
  );

  const submitChange = useCallback(
    (projectId: string, instruction: string): ChangeRequest => {
      const seed = getSeed(projectId);
      const project = state.projects[projectId];
      const products = resolveProducts(seed, project.factOverrides);
      const request = parseChangeRequest(instruction, {
        projectId,
        baseRevision: project.revision,
        currentPrice: products[0].price,
        productId: products[0].id,
      });
      updateProject(projectId, (current) => ({
        ...current,
        changeRequests: [request, ...current.changeRequests].slice(0, 24),
      }));
      return request;
    },
    [getSeed, state.projects, updateProject],
  );

  const applyChange = useCallback(
    (projectId: string, requestId: string) => {
      updateProject(projectId, (project) => {
        const request = project.changeRequests.find((item) => item.id === requestId);
        if (!request || request.approvalState !== 'draft') return project;
        let sitePaletteOverride = project.sitePaletteOverride;
        let siteNameOverride = project.siteNameOverride;
        let posterQrRequested = project.posterQrRequested;
        let headlineOverride = project.headlineOverride;

        for (const op of request.parsedOperations) {
          if (op.kind === 'sitePalette') {
            sitePaletteOverride = { ...BLACK_GOLD };
            siteNameOverride = '黑金';
          }
          if (op.kind === 'posterQrPlacement') {
            posterQrRequested = op.to === 'bottom-left' ? 'bottom-left' : 'bottom-right';
          }
          if (op.kind === 'copyHeadline' && op.to && !op.to.startsWith('（')) {
            headlineOverride = op.to;
          }
        }

        const nextSite = request.targetArtifacts.includes('site') ? project.siteRevision + 1 : project.siteRevision;
        const nextPoster = request.targetArtifacts.includes('poster') ? project.posterRevision + 1 : project.posterRevision;
        const nextCopy = request.targetArtifacts.includes('copy') ? project.copyRevision + 1 : project.copyRevision;

        return {
          ...project,
          sitePaletteOverride,
          siteNameOverride,
          posterQrRequested,
          headlineOverride,
          siteRevision: nextSite,
          posterRevision: nextPoster,
          copyRevision: nextCopy,
          revision: project.revision + 1,
          published: request.targetArtifacts.includes('site') ? null : project.published,
          acceptedAt: null,
          changeRequests: project.changeRequests.map((item) =>
            item.id === requestId ? { ...item, approvalState: 'preview', previewRevision: project.revision + 1 } : item,
          ),
        };
      });
    },
    [updateProject],
  );

  const approveChange = useCallback(
    (projectId: string, requestId: string) => {
      updateProject(projectId, (project) => ({
        ...project,
        changeRequests: project.changeRequests.map((item) =>
          item.id === requestId && item.approvalState === 'preview' ? { ...item, approvalState: 'approved' } : item,
        ),
      }));
    },
    [updateProject],
  );

  const rejectChange = useCallback(
    (projectId: string, requestId: string) => {
      updateProject(projectId, (project) => ({
        ...project,
        changeRequests: project.changeRequests.map((item) =>
          item.id === requestId ? { ...item, approvalState: 'rejected' } : item,
        ),
      }));
    },
    [updateProject],
  );

  const approveFactChange = useCallback(
    (projectId: string, requestId: string) => {
      updateProject(projectId, (project) => {
        const request = project.changeRequests.find((item) => item.id === requestId);
        if (!request || request.approvalState !== 'pending-fact-approval') return project;
        const factOps = request.parsedOperations.filter((op) => op.kind === 'productFact');
        if (factOps.length === 0) return project;
        const factOverrides = { ...project.factOverrides };
        for (const op of factOps) {
          factOverrides[op.path] = op.to;
        }
        return {
          ...project,
          factOverrides,
          factVersion: project.factVersion + 1,
          siteRevision: project.siteRevision + 1,
          posterRevision: project.posterRevision + 1,
          copyRevision: project.copyRevision + 1,
          revision: project.revision + 1,
          published: null,
          acceptedAt: null,
          changeRequests: project.changeRequests.map((item) =>
            item.id === requestId ? { ...item, approvalState: 'approved', previewRevision: project.revision + 1 } : item,
          ),
        };
      });
    },
    [updateProject],
  );

  const publish = useCallback(
    async (projectId: string) => {
      const project = state.projects[projectId];
      const seed = getSeed(projectId);
      const url = `${origin}/p/${seed.publishedSlug}`;
      const revision = project.siteRevision;
      await new Promise((resolve) => setTimeout(resolve, 420));
      updateProject(projectId, (current) => ({
        ...current,
        published: {
          siteRevision: current.siteRevision,
          styleId: current.styleId,
          paletteOverride: current.sitePaletteOverride,
          nameOverride: current.siteNameOverride,
          factOverrides: current.factOverrides,
          factVersion: current.factVersion,
          at: new Date().toISOString(),
        },
        changeRequests: current.changeRequests.map((request) =>
          request.approvalState === 'preview' ? { ...request, approvalState: 'approved' } : request,
        ),
      }));
      setState((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          order.projectId === projectId && order.payState === 'DEMO_PAID' ? { ...order, workState: 'CLIENT_REVIEW' } : order,
        ),
      }));
      return { url, revision };
    },
    [getSeed, origin, state.projects, updateProject],
  );

  const acceptDelivery = useCallback(
    (projectId: string) => {
      updateProject(projectId, (project) => ({ ...project, acceptedAt: new Date().toISOString() }));
      setState((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          order.projectId === projectId && (order.payState === 'DEMO_PAID' || order.payState === 'PAID')
            ? { ...order, workState: 'ACCEPTED' }
            : order,
        ),
      }));
    },
    [updateProject],
  );

  const createOrder = useCallback(async (input: CreateOrderInput) => {
    const order = await apiCreateOrder(input);
    setState((current) => ({ ...current, orders: [order, ...current.orders] }));
    return order;
  }, []);

  const payDemo = useCallback(
    async (orderOrId: Order | string) => {
      const order = typeof orderOrId === 'string' ? state.orders.find((item) => item.id === orderOrId) : orderOrId;
      if (!order) throw new Error('订单不存在');
      const next = await confirmSandboxPayment(order);
      setState((current) => ({ ...current, orders: current.orders.map((item) => (item.id === next.id ? next : item)) }));
    },
    [state.orders],
  );

  const requestManual = useCallback(
    async (orderOrId: Order | string) => {
      const order = typeof orderOrId === 'string' ? state.orders.find((item) => item.id === orderOrId) : orderOrId;
      if (!order) throw new Error('订单不存在');
      const next = await requestManualConfirmation(order);
      setState((current) => ({ ...current, orders: current.orders.map((item) => (item.id === next.id ? next : item)) }));
    },
    [state.orders],
  );

  const resetDemo = useCallback(() => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    setState(createInitialState());
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      plans,
      allSeeds,
      getSeed,
      getSeedBySlug,
      createProject,
      getProjectState,
      getBundle,
      selectStyle,
      approveDesign,
      setQrRequested,
      updateIntake,
      submitChange,
      applyChange,
      approveChange,
      rejectChange,
      approveFactChange,
      publish,
      acceptDelivery,
      createOrder,
      payDemo,
      requestManual,
      resetDemo,
    }),
    [
      state,
      allSeeds,
      getSeed,
      getSeedBySlug,
      createProject,
      getProjectState,
      getBundle,
      selectStyle,
      approveDesign,
      setQrRequested,
      updateIntake,
      submitChange,
      applyChange,
      approveChange,
      rejectChange,
      approveFactChange,
      publish,
      acceptDelivery,
      createOrder,
      payDemo,
      requestManual,
      resetDemo,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StoreValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error('useStudio 必须在 StudioProvider 内使用');
  return value;
}

export { defaultProjectId };

export function useProjectBundle(projectId: string): ProjectBundle {
  const { getBundle } = useStudio();
  return useMemo(() => getBundle(projectId), [getBundle, projectId]);
}


