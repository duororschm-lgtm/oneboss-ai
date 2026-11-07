import { findPlan, plans } from '../../data/plans';
import type { Order, Plan } from '../../types/contracts';

/**
 * A 组接口的本地演示适配层。
 * 真实实现由 A 组提供；这里只做三件事：延迟模拟、服务端式报价、状态机约束。
 * 关键点：金额永远由套餐目录计算，客户端传入的价格会被忽略。
 */

export const API_MODE = 'DEMO' as const;

const latency = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Quote {
  quoteId: string;
  planCode: string;
  amountMinor: number;
  currency: 'CNY';
  planSnapshot: Plan;
  createdAt: string;
}

export async function fetchPlans(): Promise<Plan[]> {
  await latency(120);
  return plans.map((plan) => ({ ...plan }));
}

export async function createQuote(planCode: string): Promise<Quote> {
  await latency(120);
  const plan = findPlan(planCode);
  if (!plan) throw new Error(`套餐不存在：${planCode}`);
  return {
    quoteId: `quote-${Date.now().toString(36)}`,
    planCode: plan.code,
    amountMinor: plan.priceMinor,
    currency: 'CNY',
    planSnapshot: { ...plan },
    createdAt: new Date().toISOString(),
  };
}

export interface CreateOrderInput {
  planCode: string;
  projectId: string;
  projectSlug: string;
  customerName: string;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  await latency(220);
  const plan = findPlan(input.planCode);
  if (!plan) throw new Error(`套餐不存在：${input.planCode}`);
  if (!input.customerName.trim()) throw new Error('请填写客户名称');
  const orderNo = `OB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;
  return {
    id: `order-${Date.now().toString(36)}`,
    orderNo,
    planCode: plan.code,
    planName: plan.name,
    amountMinor: plan.priceMinor,
    currency: 'CNY',
    payState: 'UNPAID',
    workState: 'WAITING_INPUT',
    isDemo: true,
    paymentMode: 'SANDBOX',
    projectId: input.projectId,
    projectSlug: input.projectSlug,
    customerName: input.customerName.trim(),
    createdAt: new Date().toISOString(),
  };
}

/** 演示支付：状态与正式支付严格区分，订单始终保留 isDemo=true */
export async function confirmSandboxPayment(order: Order): Promise<Order> {
  await latency(420);
  if (order.payState !== 'UNPAID' && order.payState !== 'PENDING_CONFIRMATION') {
    throw new Error('当前订单状态不能重复确认支付');
  }
  return { ...order, payState: 'DEMO_PAID', workState: 'DESIGN_APPROVAL' };
}

/** 人工核验模式：客户提交付款凭证后等待 A 组管理员查账，不由页面直接置为已付 */
export async function requestManualConfirmation(order: Order): Promise<Order> {
  await latency(320);
  return { ...order, payState: 'PENDING_CONFIRMATION', paymentMode: 'MANUAL_VERIFIED' };
}

export async function publishSiteRevision(projectId: string, revision: number): Promise<{ publicPath: string; revision: number }> {
  await latency(360);
  if (!projectId) throw new Error('缺少项目 ID');
  return { publicPath: `/p/${projectId}`, revision };
}
