import type { Plan } from '../types/contracts';

/**
 * A 组负责的服务端套餐目录（演示快照）。
 * B 组只能用 GET /api/core/plans 的返回值渲染，不在前端锁价或改价。
 * 价格为 A 组试运营报价，单位为分。
 */
export const plans: Plan[] = [
  {
    code: 'starter',
    name: '基础制作',
    priceMinor: 19900,
    currency: 'CNY',
    description: '单品宣传网站 + 2 张海报 + 小红书文案，适合第一次做线上宣传的单品。',
    entitlements: ['1 个产品', '1080×1350 与 1080×1080 海报各 1 张', '1 轮定向修改', '托管 30 天'],
    productLimit: 1,
    posterCount: 2,
    revisionRounds: 1,
    hostingDays: 30,
  },
  {
    code: 'growth',
    name: '品牌增长',
    priceMinor: 49900,
    currency: 'CNY',
    description: '多产品宣传网站 + 5 张海报 + 完整文案包，适合有系列产品的品牌。',
    entitlements: ['3 个产品', '5 张海报', '2 轮定向修改', '托管 90 天', '创意方向三选一'],
    productLimit: 3,
    posterCount: 5,
    revisionRounds: 2,
    hostingDays: 90,
    featured: true,
  },
  {
    code: 'custom',
    name: '定制发布',
    priceMinor: 99900,
    currency: 'CNY',
    description: '品牌站 + 10 张海报 + 创意策略沟通；超过基础额度需人工核价。',
    entitlements: ['10 个产品', '10 张海报', '3 轮定向修改', '托管 180 天', '人工核价与排期'],
    productLimit: 10,
    posterCount: 10,
    revisionRounds: 3,
    hostingDays: 180,
  },
];

export const findPlan = (code: string): Plan | undefined => plans.find((plan) => plan.code === code);

export const formatCny = (minor: number): string =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(minor / 100);
