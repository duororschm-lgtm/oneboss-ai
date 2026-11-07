# Windows 本地凭据填写

项目已经完成依赖安装。打开项目根目录 `.env.local`，保留已填好的公开地址、模型名和完整 CA 证书，只补空值。不要将文件上传到 GitHub，也不要把值粘贴到聊天。

## 1. 数据库连接和密码

打开自己的 Supabase 项目，在顶部点 **Connect**，选择 **Session pooler**，复制 PostgreSQL URI，放到 `DATABASE_URL`。通常端口是 5432，数据库是 postgres，用户名含项目编号。使用控制台实际给出的地址，不照抄其他项目的主机名。

```dotenv
DATABASE_URL="粘贴控制台的 Session pooler URI"
DATABASE_PASSWORD="创建该项目时保存的原始数据库密码"
```

使用单独的 `DATABASE_PASSWORD` 时，URI 中的 `[YOUR-PASSWORD]` 可以保留，程序会覆盖它。数据库密码与 API Key 是两种不同凭据。如果忘记密码，先检查自己已有的安全保存记录；不要直接重置，重置后还需同步更新 Render。

连接方式参考 [Supabase 官方连接文档](https://supabase.com/docs/guides/database/connecting-to-postgres)。现有项目已建表，不重新运行初始化 SQL、不删表。

## 2. Supabase API Keys

在项目 **Settings → API Keys** 复制现有密钥：

```dotenv
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="以 sb_publishable_ 开头的公钥"
SUPABASE_SERVICE_ROLE_KEY="以 sb_secret_ 开头的服务端密钥"
```

如果项目只有旧密钥，也可分别使用 legacy `anon` 和 `service_role`。服务端密钥只能填在 `SUPABASE_SERVICE_ROLE_KEY`，不得填到任何 `NEXT_PUBLIC_` 变量。优先使用现有密钥，无需为了本地启动新建或轮换。

密钥类型参考 [Supabase 官方 API Keys 文档](https://supabase.com/docs/guides/getting-started/api-keys)。

## 3. MiMo

将原来在 MiMo 平台创建并保存的 Key 放到下面这一项。模型和官方地址已预填。

```dotenv
MIMO_API_KEY="自己的实际 MiMo Key"
```

## 4. 保存并检查

每个普通值单独占一行；使用英文引号。CA 是现有的多行值，不拆开、不删除。值本身含英文双引号时，可改用英文单引号包裹整个值。

```powershell
npm run check:config
```

命令只显示缺失变量名称和格式问题，不显示值、不连接远端。`configurationReady=true` 表示格式和必需项通过，实际连接、权限及模型调用还需后续验收。

本地开发分别运行 `npm run dev`、`npm run worker`；生产构建后可用 `npm run start:service` 同时运行 HTTP 和 worker。修改 `.env.local` 后需重启进程。仅本地网页可用不代表已接入 B 组或完成公网交付。

## 5. 本机代理与 B 渲染器

Node 不自动读取 Windows 系统代理。如果本机已启用 HTTP 代理且 Node 请求出现 ECONNRESET，可在当前 PowerShell 设置实际的本地地址。本机已验证的示例是：

```powershell
$env:HTTPS_PROXY = 'http://127.0.0.1:10808'
$env:HTTP_PROXY = 'http://127.0.0.1:10808'
$env:NO_PROXY = 'localhost,127.0.0.1,::1'
```

仅当本机确实运行该代理时使用；不关闭 TLS，不把本机代理地址填到 Render。

内置的实际 B 网站/海报渲染器使用 `CREATIVE_ADAPTER_MODULE="builtin:b"`。它复用 B 的 React/SVG 引擎并消费 A 的批准资料，B 原目录中的演示付款与本地 Agent 日志仍是演示。

`npm run acceptance:b` 在 `acceptance:a` 的同一空本地库保护下，进一步调用真实 MiMo 生成设计和 Production，执行真实 B QA、批准和私有浏览器预览。会产生实际模型调用费用，临时账号由脚本清理；不自动执行公网发布。Windows 浏览器检查使用已安装的 Edge，其他系统需安装 Playwright Chromium。
