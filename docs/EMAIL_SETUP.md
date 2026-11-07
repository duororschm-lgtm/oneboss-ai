# 注册与找回密码的邮件发送

2026-11-07 实查：Supabase 自定义 SMTP 未启用。默认邮件仅面向项目团队成员，不能视作外部客户注册已就绪。没有关闭邮箱确认来绕过发信。

已保存 Site URL `https://oneboss-ai.onrender.com` 与允许回跳 `https://oneboss-ai.onrender.com/login`。

需要所有者准备一个允许发送事务邮件的 SMTP 账户。收件邮箱不等于 SMTP 发送授权；提供的客服邮箱不会自动获得发信权限。不要把邮箱密码或授权码发到聊天中。

在 Supabase 项目 Authentication → Emails → SMTP Settings 中，由所有者私下填写：发件邮箱、发件人名称 BlackCode、SMTP host/port/user/password。根据发信服务商要求完成域名验证或开启发信授权；保留邮箱确认开启。保存后由所有者在网站测试注册确认邮件与重置密码邮件是否可达、链接是否返回 /login。

确认真实发信后，部署设置 `CUSTOMER_EMAIL_READY=true`，网站才开放外部邮箱注册与找回密码入口。标记不替代 Supabase 的邮箱验证。已有已确认账户登录与制作不依赖新发邮件。

[Supabase 官方 SMTP 说明](https://supabase.com/docs/guides/auth/auth-smtp)说明默认邮件仅用于测试，外部收件人需要自定义发信服务。此前真实浏览器验收使用临时服务端创建的已确认测试用户，不是邮箱投递验收，也没有发真实邮件给他人。
