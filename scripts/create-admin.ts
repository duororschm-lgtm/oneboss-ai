/**
 * 创建一个平台管理员账号（Supabase Auth 用户 + platform_admins 授权）。
 *
 * 这是运维脚本，不是业务接口：不新增 HTTP 路由，不绕过服务端权限模型。
 * 设计上沿用仓库其它运维脚本的两道锁：
 *   1. 必须显式设置 RUN_CREATE_ADMIN=true 才会执行；
 *   2. 必须提供 SERVICE_ROLE_KEY 与 DATABASE_URL，缺一即拒绝。
 *
 * 用法：
 *   ADMIN_EMAIL=you@example.com RUN_CREATE_ADMIN=true npm run admin:create
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... RUN_CREATE_ADMIN=true npm run admin:create
 *
 * 不传 ADMIN_PASSWORD 时脚本会生成一个强密码并只打印一次。
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { database } from '../src/lib/core/db';
import { outboundFetch } from '../src/lib/security/http';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const explicitPassword = process.env.ADMIN_PASSWORD;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (process.env.RUN_CREATE_ADMIN !== 'true')
  fail('缺少 RUN_CREATE_ADMIN=true：这是防止误操作生产库的显式确认。');
if (!url) fail('缺少 NEXT_PUBLIC_SUPABASE_URL。');
if (!serviceKey) fail('缺少 SUPABASE_SERVICE_ROLE_KEY（只在本地 .env.local 使用，不要提交）。');
if (!process.env.DATABASE_URL) fail('缺少 DATABASE_URL（用于写入 platform_admins）。');
if (!email) fail('缺少 ADMIN_EMAIL。');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`ADMIN_EMAIL 不是合法邮箱：${email}`);

/** 生成 24 位密码：大小写、数字、符号各至少一个，去掉容易混淆的字符。 */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const symbols = '!@#%^&*-_=+';
  const pick = (source: string, count: number) =>
    Array.from({ length: count }, () => source[randomBytes(1)[0] % source.length]).join('');
  const core = pick(alphabet, 19);
  const pass = `${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 1)}${core}${pick(symbols, 2)}${pick('23456789', 2)}`;
  return pass;
}

const password = explicitPassword?.trim() || generatePassword();
if (password.length < 10) fail('ADMIN_PASSWORD 至少 10 位（与注册接口一致）。');

const auth = createClient(url, serviceKey, {
  global: { fetch: outboundFetch },
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`目标项目：${url}`);
console.log(`管理员邮箱：${email}`);

const created = await auth.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { account_kind: 'platform_admin' },
});

let userId: string;
if (created.error) {
  const code = created.error.code ?? '';
  const message = created.error.message ?? '';
  if (['email_exists', 'user_already_exists'].includes(code) || /already been registered/i.test(message)) {
    // 已存在则复用该用户，只补授权 —— 避免重复创建导致两个不同 uuid。
    const { data, error } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) fail(`查询已有用户失败：${error.message}`);
    const existing = data.users.find((user) => user.email?.toLowerCase() === email);
    if (!existing) fail('该邮箱已注册但无法在当前分页中找到，请在 Supabase 控制台手动确认 UID。');
    userId = existing.id;
    console.log('该邮箱已存在，复用现有用户，仅补充 platform_admins 授权。');
    if (explicitPassword) {
      const updated = await auth.auth.admin.updateUserById(userId, { password });
      if (updated.error) fail(`重置密码失败：${updated.error.message}`);
      console.log('已按 ADMIN_PASSWORD 重置密码。');
    } else {
      console.log('未传 ADMIN_PASSWORD，保留原密码（如需重置请带该变量重跑）。');
    }
  } else {
    fail(`创建用户失败：[${code}] ${message}`);
  }
} else {
  if (!created.data.user) fail('创建用户未返回用户对象。');
  userId = created.data.user.id;
  console.log('已创建 Supabase Auth 用户。');
}

const db = database();
const [existingAdmin] = await db`select user_id from platform_admins where user_id=${userId}`;
if (existingAdmin) {
  console.log('该用户已经是 platform_admins 成员，未重复写入。');
} else {
  await db`insert into platform_admins(user_id) values(${userId})`;
  console.log('已写入 platform_admins。');
}

console.log('');
console.log('════════════════════════════════════════');
console.log(' 管理员账号已就绪');
console.log(` 邮箱：${email}`);
if (!explicitPassword) console.log(` 密码：${password}   ← 只显示这一次，请立即保存`);
console.log(` UID ：${userId}`);
console.log('════════════════════════════════════════');
console.log('');
console.log('下一步：');
console.log('  1. 在 .env.local 补 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY（publishable/anon key）');
console.log('  2. npm start 后访问 /admin/login 用上面的邮箱密码登录');
console.log('  3. 登录成功即代表服务端 platformAdmin() 校验通过');

process.exit(0);
