# 制作失败排查与修复

2026-11-08（Asia/Shanghai）。基线是仓库合并后的main `7cad654`，保留其设计模型契约修复与前端更新，不重建已删除旧分支、不创建PR、不修改付款或审批状态。

## 线上证据

对所有者指定项目 `7ea77e49-768d-4ebe-9153-3b6f6a248ade` 只读核查：事实版本3，已付订单、1个商品、请求4张海报（portrait/square各两张），尚无artifact版本或发布记录。设计和资料分析已成功。

- 旧generate `7d9d5d9d...`：3次尝试后MIMO_INVALID_JSON，旧代码未保存finish_reason和失败usage，不能断言这一条一定截断。
- 新generate `24f0c766...`：检查初期仍RUNNING，随后3次尝试后INVALID_TEXT_REF；此时JSON已能解析，但poster.textRefs不属于允许的已确认事实或copy包ID。不是公网发布失败，也不是已交付作品丢失。
- 原先项目状态仍GENERATION_FAILED而新run正在执行，容易与旧失败混淆。
- 本轮未修改该生产项目、未新增重跑任务、未扣权益、未确认收款或启动第二个生产Worker。

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

类型检查通过；223项单元测试、44项真实PostgreSQL集成回归通过。新增覆盖完成预算参数、截断/过滤/重复终止、完整围栏、部分JSON拒绝、安全诊断落库、重试反馈和无效文字引用拒绝。

本地真实设计已跑通；独立BlackCode DEMO继续验证4张海报的完整生成与交付。生产需要同版Web/Worker更新后再验证；当前会话没有DevBox终端/SSH连接，推送GitHub不等于上线。应先核实实际运行SHA/活动任务，当前任务已终态后再切换；保留已批准的事实和设计，不重做产品分析或修改真实到账。

参考：[MiMo官方API](https://mimo.mi.com/docs/en-US/api/chat)、[思考模式与总输出预算](https://mimo.mi.com/docs/en-US/quick-start/usage-guide/other/deep-thinking)。max_completion_tokens覆盖思考与最终输出，finish_reason=length表示达到长度限制。
