# 微信商户私下配置

提供方：BlackCode。当前实现普通商户 APIv3 Native 扫码支付，适用于在电脑展示付款码、客户用手机微信扫一扫；同手机直接调起付款需要另开 H5/JSAPI，不能把 Native 二维码当作 H5。

正式收款默认关闭。创建 OneBoss 订单不会扣费。未配置完整密钥时，不会显示可用的微信支付按钮。没有读取个人微信收款码代替商户结果的逻辑。

## 先准备商户资料

在微信支付商户平台自行登录并完成身份验证，检查 Native 支付已开通、AppID 已与商户号关联。申请/下载证书、公钥和设置密钥由账户所有者完成；不要把文件或密钥发到聊天中。

| `.env.local` 字段 | 来自哪里 |
|---|---|
| `WECHAT_MCH_ID` | 微信支付商户号，不是微信号或手机号 |
| `WECHAT_APP_ID` | 已关联的公众账号/应用 AppID，以 wx 开头 |
| `WECHAT_CERT_SERIAL` | 商户 API 证书序列号 |
| `WECHAT_PRIVATE_KEY_PATH` | 商户 API 证书下载包中的 apiclient_key.pem；本地默认 .secrets/wechat/apiclient_key.pem |
| `WECHAT_PUBLIC_KEY_ID` | 微信支付公钥 ID，以 PUB_KEY_ID_ 开头；不是商户证书序列号 |
| `WECHAT_PUBLIC_KEY_PATH` | 商户平台下载的微信支付公钥，本地默认 .secrets/wechat/wechatpay_public_key.pem |
| `WECHAT_API_V3_KEY` | 自行设置的 32 字节 APIv3 密钥，不是数据库密码 |

`.secrets/` 已从 Git 和 Docker 构建排除。不要将商户私钥放在 public/、源码或 Git 中。Render 使用 Secret File 或多行 `WECHAT_PRIVATE_KEY` / `WECHAT_PUBLIC_KEY`；本机 Windows 文件路径不能直接复制到 Render。

准备好后先运行 `npm run check:wechat`。它只做本地格式与密钥解析，不输出值、不请求付款。`WECHAT_PAY_ENABLED=false` 时会正确显示未启用；全部准备好后才改为 true 并再次检查。格式通过不等于真实支付验收。

回调地址为 `https://oneboss-ai.onrender.com/api/commerce/payments/webhook/wechat`。平台通知必须先通过原始报文 RSA 签名和时间戳验证，再用 APIv3 密钥解密；商户号、AppID、金额、币种、订单号全部匹配后才能授予制作权益。前端“我已付款”只触发签名验证的商户查单，不直接改付款状态。重复通知不会重复授权或恢复已退款权益。

真实付款与退款验收必须由所有者在核对商户和金额后亲自完成。当前 Native 支付适配不代表已经收到款项。退款申请先进入审核，不代表到账；可信退款通道和管理界面仍在整合。

## 官方参考

- [Native 下单](https://pay.wechatpay.cn/doc/v3/merchant/4012791877)
- [商户订单号查询](https://pay.wechatpay.cn/doc/v3/merchant/4012791880)
- [支付成功回调](https://pay.wechatpay.cn/doc/v3/merchant/4012791882)
- [微信支付公钥验签](https://pay.wechatpay.cn/doc/v3/merchant/4013053249)
- [回调 AES-GCM 解密](https://pay.wechatpay.cn/doc/v3/merchant/4012071382)

按 2026-11-07 官方文档核对；没有复制第三方 SDK 源码。
