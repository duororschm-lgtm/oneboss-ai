# 制作失败排查与修复

2026-11-08（Asia/Shanghai）。基线是仓库合并后的main `7cad654`，保留其设计模型契约修复与前端更新，不重建已删除旧分支、不创建PR、不修改付款或审批状态。

## 线上证据

对所有者指定项目 `7ea77e49-768d-4ebe-9153-3b6f6a248ade` 只读核查：事实版本3，已付订单、1个商品、请求4张海报（portrait/square各两张），尚无artifact版本或发布记录。设计和资料分析已成功。

- 旧generate `7d9d5d9d...`：3次尝试后MIMO_INVALID_JSON，旧代码未保存finish_reason和失败usage，不能断言这一条一定截断。
- 新generate `24f0c766...`：检查初期仍RUNNING，随后3次尝试后INVALID_TEXT_REF；此时JSON已能解析，但poster.textRefs不属于允许的已确认事实或copy包ID。不是公网发布失败，也不是已交付作品丢失。
- 原先项目状态仍GENERATION_FAILED而新run正在执行，容易与旧失败混淆。
- 初始诊断阶段仅只读查询，未新增重跑任务或修改项目；后续上线后的受控恢复单列在下文。未扣权益或确认收款，也未启动并行的第二个生产 Worker。

## 本地真实复现

独立本地数据库中的既有design任务，真实MiMo返回finish_reason=length、completion_tokens=12000、total_tokens=16239、正文16612字符，明确发生截断。诊断未保存正文/思维链/密钥。修复预算后同一本地任务已成功，记录总9915 tokens、其中输出5676；保留历史失败，不覆盖为假成功。

这证明系统确有长度/参数兼容风险，不把本地复现等同于旧生产响应的精确成因。当前使用模型mimo-v2.6-pro。

## 修改

1. 按官方Chat Completions契约改用max_completion_tokens；完整制作、修改和创意方向的预算32768，其余12000。大型结构化响应有界等待360秒，其他原有长任务180秒、短任务90秒；Worker租约仍通过心跳续期。
2. 在解析前识别length、repetition_truncation、content_filter，分别给出MIMO_OUTPUT_TRUNCATED、MIMO_REPETITION_TRUNCATED、MIMO_CONTENT_FILTERED。绝不补括号、截取任意正文或伪造部分JSON为成功；只允许单个完整JSON代码围栏/BOM归一，仍过原Zod契约。
3. AppError保留安全的停止原因、请求ID、字符数和数字usage；runner失败时写入usage.providerFailure。没有记录模型正文、用户资料或凭据。
4. 重试从task_events读取上一失败代码作为生成反馈，而不是因RUNNING清空当前error_class后丢掉反馈。新尝试的当前错误仍清空，历史不删除。
5. 明确poster.textRefs只能引用已确认fact UUID或当前copy[].id；copyPackRef必须准确匹配对应copy[].id。请求显式传verifiedFactIds/authorizedAssetIds及引用语义；保留INVALID_TEXT_REF等全部校验，不通过删引用放行。
6. 有效generate重试开始时清除项目旧GENERATION_FAILED状态，前端继续以真实run状态显示执行中。认证错误/过滤错误不做无意义重复调用。

没有数据库迁移，没有改B的进度UI或放宽租户、审批、支付、发布和文件校验。

## 验证和上线边界

类型检查和生产构建通过；223项单元测试、44项真实PostgreSQL集成回归通过。新增覆盖完成预算参数、截断/过滤/重复终止、完整围栏、部分JSON拒绝、安全诊断落库、重试反馈和无效文字引用拒绝。

本地真实设计、制作、4张海报、公开网站、ZIP交付均跑通，另见[本地真实交付报告](LOCAL_REAL_DELIVERY_20261108.md)。

## DevBox 已部署与原项目恢复结果

- 所有者提供 SSH 入口后，核实旧运行版本为 `7cad654`，无活动任务再进行切换。SSH 私钥在仓库外私有目录保管，未写入报告或 Git。
- 修复提交 `c136328da940e1f949d25588e3d962e7c4d1bb87` 已直接推送 main；GitHub CI [42447501431](https://github.com/duororschm-lgtm/oneboss-ai/actions/runs/42447501431) 全部成功，包括真实浏览器回归。
- DevBox 拉取 GitHub 失败，改以 SSH 传输同提交 Git bundle 并核对提交。独立 release 目录 `/home/devbox/oneboss-releases/c136328` 构建通过后，正常停止旧服务，启动同版 Web/Worker；保留原 `.env.local` 及未跟踪 `public/showcase`。无数据库迁移。
- 运行 Node v22.23.4；Web 与 Worker 的实际进程 cwd 均为该 release。Worker 注册 version=`c136328`；旧 Worker 已正常记录 stopped_at。公网 `/api/health` 返回 200，数据库/Auth/MiMo/creative 均已配置。
- 经核实已授权 owner 管理员身份，使用仅针对该项目和指定失败任务的维护脚本恢复：事务锁、稳定幂等键、权益有效、事实版本3、设计和资料已批准、无活动任务、无 artifact 和未超预算都必须满足。重跑同时追加 `maintenance.retry_generation` 管理审计；保留旧失败事件，不修改付款、权益和审批。
- 新任务 `84e7291c-fb43-4e98-a0d1-b12a044584d1` **SUCCEEDED，attempt=1**；项目 **QA_REVIEW**；作品 **revision=1 / DRAFT / fact_version=3**。没有自动批准或发布真实客户作品，接下来由客户查看预览并批准。

### 维护位置与回退边界

当前服务日志 `/home/devbox/service-c136328.log`；构建日志 `/home/devbox/build-c136328.log`；服务父进程 PID 文件 `/home/devbox/service-c136328.pid`。环境配置继续引用原仓库的私有文件。默认仓库也同步修复源代码并准备构建，当前实际运行目录以以上 release 为准；本次未修改 DevBox 控制台的开机入口。

回退应先停止新增任务、确认 Worker 空闲，再切换到旧版本的独立构建并正常启动单一 Web/Worker，不能同时启动两个服务或在运行目录覆盖 `.next`。本次无数据库结构变更，回退代码不需要回滚迁移；保留已生成数据与审计记录。

参考：[MiMo官方API](https://mimo.mi.com/docs/en-US/api/chat)、[思考模式与总输出预算](https://mimo.mi.com/docs/en-US/quick-start/usage-guide/other/deep-thinking)。max_completion_tokens覆盖思考与最终输出，finish_reason=length表示达到长度限制。
