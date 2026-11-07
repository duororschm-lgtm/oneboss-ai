# 原邮箱账户的邮件找回配置

普通客户使用账号和密码直接注册，不需要邮箱或 SMTP，详见 [账号注册说明](ACCOUNT_SETUP.md)。原有邮箱账户继续登录；邮件找回密码仍未开放，由用户明确暂缓配置。

2026-11-07 实查：Supabase 自定义 SMTP 未启用。已保存 Site URL `https://oneboss-ai.onrender.com` 与允许回跳 `https://oneboss-ai.onrender.com/login`。

如以后需要启用旧邮箱账户的邮件找回，由所有者准备允许发送事务邮件的 SMTP 账户，并在 Supabase Authentication → Emails → SMTP Settings 私下填写发件邮箱、名称 BlackCode、host/port/user/password。客服邮箱本身不等于已获发信授权；密码或授权码不应提交到聊天或代码仓库。

完成服务商要求的发信授权/域名验证，保留真实邮箱的确认设置；实际验证重置邮件可达、链接返回 /login 后，再设置 CUSTOMER_EMAIL_READY=true。该标记只开放邮件找回入口，不影响普通账号注册，也不能替代真实邮箱验证。

账号模式使用独立的非投递标识，不向该标识发邮件，也不把它显示成客户邮箱。账号用户遗忘密码暂需联系 BlackCode，微信18001132767。

[Supabase 官方 SMTP 说明](https://supabase.com/docs/guides/auth/auth-smtp)介绍默认邮件的测试限制以及自定义事务发信配置。
