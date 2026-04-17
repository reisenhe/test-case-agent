# NestJS 后端服务

基于 [NestJS](https://nestjs.com/) 框架构建的后端服务，提供 RESTful API 接口。

## 技术栈

- [NestJS](https://nestjs.com/) - 渐进式 Node.js 框架
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的 JavaScript 超集
- [Express](https://expressjs.com/) - Web 应用框架
- [RxJS](https://rxjs.dev/) - 响应式编程库
- [Jest](https://jestjs.io/) - JavaScript 测试框架
- [ESLint](https://eslint.org/) + [Prettier](https://prettier.io/) - 代码规范与格式化

## 项目结构

```
src/
├── app.controller.ts    # 根控制器
├── app.controller.spec.ts # 控制器测试
├── app.module.ts        # 根模块
├── app.service.ts       # 根服务
└── main.ts              # 应用入口文件
```

## 安装依赖

```bash
pnpm install
```

## 启动开发服务器

```bash
# 开发模式（带热重载）
pnpm dev

# 或
pnpm start:dev
```

服务默认运行在 http://localhost:3000

## 其他启动方式

```bash
# 普通启动
pnpm start

# 调试模式
pnpm start:debug

# 生产模式
pnpm start:prod
```

## 构建

```bash
pnpm build
```

构建输出位于 `dist/` 目录。

## 代码规范

```bash
# 运行 ESLint 检查并自动修复
pnpm lint

# 使用 Prettier 格式化代码
pnpm format
```

## 测试

```bash
# 单元测试
pnpm test

# 单元测试（监听模式）
pnpm test:watch

# 测试覆盖率
pnpm test:cov

# 端到端测试
pnpm test:e2e

# 调试测试
pnpm test:debug
```

## API 接口

启动服务后，可以通过以下地址访问：

- 根接口: `GET http://localhost:3000`
- 健康检查: `GET http://localhost:3000/health`

## 配置说明

- `nest-cli.json` - NestJS CLI 配置文件
- `tsconfig.json` - TypeScript 配置
- `tsconfig.build.json` - 构建专用 TypeScript 配置
- `eslint.config.mjs` - ESLint 配置
- `.prettierrc` - Prettier 代码格式化配置

## 参考资料

- [NestJS 官方文档](https://docs.nestjs.com/)
- [NestJS 中文文档](https://docs.nestjs.cn/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)
