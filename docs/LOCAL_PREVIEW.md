# 本地隔离预览

本机地址：http://127.0.0.1:3000。当前使用独立本地PostgreSQL数据库，不启动连接生产队列的Worker；AI生成、公网发布及实际收款未启用。

## 认证配置

本地页面使用既有Auth项目的公开URL和公钥，服务端同样需要连接Auth验证Bearer；浏览器能登录不等于Node服务端网络畅通。本机若需要代理，在被Git忽略的.env.local中配置HTTPS_PROXY、HTTP_PROXY，并将localhost、127.0.0.1加入NO_PROXY。不要提交密钥、代理凭据或生产业务数据。修改代理后重启本地服务，让认证HTTP连接重新初始化。

独立本地数据库不自带平台管理员。仅恢复已获所有者授权、且能从现有可信平台管理员记录核实的同一Auth用户和原角色；不因访问localhost而自动授予管理员。角色恢复只作用本地数据库，留下本地审计，不修改生产授权。

## 错误含义

- 401 UNAUTHENTICATED：没有有效会话；后台会尝试刷新，失败后返回登录页。
- 403 PLATFORM_ADMIN_REQUIRED / ADMIN_CAPABILITY_REQUIRED：当前数据库中无对应授权，不能通过关闭权限检查解决。
- 503 AUTH_SERVICE_UNAVAILABLE：认证网络或上游服务失败；应检查代理/服务连接，不能误当成用户密码错误。
- 本地数据库为空时，经营总览和订单列表没有线上数据属于预期。

开发模式CSP允许Next/React所需的unsafe-eval；生产模式保持禁止，由回归测试验证。

2026-11-08本地修复验收：认证settings真实请求200、本地管理员workspace查询通过、类型检查与208项单元测试通过；所有者刷新后确认已进入经营总览。未复制生产Service Role/MiMo私钥到本地预览配置，也未新增生产管理员或启动生产Worker。
