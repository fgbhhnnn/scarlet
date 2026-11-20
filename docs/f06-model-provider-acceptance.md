# F06 模型配置与任务恢复验收包

## 代码交付

- 基础实现提交为 `80d73df3a745f8af4899b20bf1aa787ed6a819d1`
- 当前分支在该提交上补充本验收文档
- 涉及 shared API、项目 provider 覆盖、设置路由、任务记录和恢复逻辑

## Provider 配置

通过 `PATCH /api/settings` 保存 OpenAI-compatible provider。请求示例

```json
{
  "modelProviders": [
    {
      "id": "local-qwen",
      "name": "Local Qwen",
      "baseUrl": "http://127.0.0.1:9000/v1",
      "model": "qwen2.5-7b-instruct",
      "apiKey": "provider-secret"
    }
  ]
}
```

`id` 只允许字母、数字、点、下划线和短横线。`baseUrl` 必须是 URL，末尾斜杠会被规范化。provider id 必须唯一，最多保存 32 个 provider。

`GET /api/settings` 和 `GET /api/settings/model-providers` 只返回 id、name、baseUrl、model。`apiKey` 永远不会出现在响应中。后续 PATCH 只更新名称、地址或模型时，服务端会按相同 id 保留原 key。

## 连接测试

使用已保存 provider 时调用 `POST /api/settings/model-providers/test`

```json
{ "providerId": "local-qwen" }
```

也可以提交一次性配置，字段为 `id`、`name`、`baseUrl`、`model`、`apiKey`。服务端向 `${baseUrl}/chat/completions` 发最小请求

```json
{
  "model": "qwen2.5-7b-instruct",
  "messages": [{ "role": "user", "content": "ping" }],
  "max_tokens": 1
}
```

连接成功返回 HTTP 200 和 `{ "ok": true, "providerId": "local-qwen", "model": "qwen2.5-7b-instruct" }`。缺少 baseUrl、model 或 key 返回 400。401 返回 502 和 `authentication failed`。超时返回 502 和 `connection timed out`。其他 HTTP 错误只返回状态码概况。响应和日志都不带 key。

测试使用 mock fetch 验证了成功、401、key 脱敏和请求头 `Authorization: Bearer provider-secret`。

## 项目覆盖

使用 `PATCH /api/projects/:projectId`

```json
{ "providerId": "local-qwen" }
```

不存在的 provider 返回 400，错误码为 `unknown_provider`。创建任务时省略 `providerId` 会继承项目覆盖。任务自身显式给出的 provider 优先级更高。`Task.providerId` 和 `Task.model` 随任务保存，并在 usage 记录中按实际 model 归档。

## 失败阶段重试

任务失败时，host 可在 `POST /api/tasks/:taskId/complete` 发送

```json
{
  "state": "failed",
  "failedStage": "render",
  "error": "provider request timed out"
}
```

服务端把 `failedStage` 保存到任务 context。原有任务恢复链仍创建 successor，并保留 `retryTaskId`、`resumeRootId`、已保存 change 和工作区进度。

编辑器可用 `POST /api/tasks/:taskId/retry` 定向重试

```json
{
  "providerId": "local-qwen",
  "stage": "render"
}
```

新 attempt 会清掉已处理的 `failedStage`，在 instruction 中加入 `Retry only failed stage: render.`，继续使用已保存结果。未指定 `stage` 时沿用原有全任务 resume/retry 逻辑。

## 验证命令与结果

```bash
pnpm --filter @scarlet/shared build
pnpm --filter @scarlet/timeline build
pnpm --filter @scarlet/server typecheck
pnpm --filter @scarlet/server exec vitest run \
  src/routes/settings.test.ts \
  src/routes/projects.test.ts \
  src/services/tasks.test.ts \
  src/cleanup.test.ts \
  src/repo/settings.test.ts
```

结果为 5 个测试文件、66 个测试全部通过。覆盖 provider schema、配置读写、key 脱敏、连接测试、项目覆盖、任务 provider/model 记录、失败阶段保存和定向恢复。现有 cleanup 测试继续验证 OpenAI 401、超时和密钥不进日志。
