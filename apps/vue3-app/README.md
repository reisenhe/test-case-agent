# Vue3 前端应用

基于 [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/) 构建的现代化前端应用。

## 技术栈

- [Vue 3](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的 JavaScript 超集
- [markdown-it](https://github.com/markdown-it/markdown-it) - Markdown 解析器
- [@microsoft/fetch-event-source](https://github.com/Azure/fetch-event-source) - SSE (Server-Sent Events) 支持

## 项目结构

```
src/
├── assets/              # 静态资源
│   └── vue.svg
├── components/          # Vue 组件
│   ├── ChatInterface.vue   # 聊天界面组件
│   ├── HelloWorld.vue      # 示例组件
│   └── Message.vue         # 消息组件
├── controllers/         # 控制器
│   └── sse.controller.ts   # SSE 控制器
├── enums/               # 枚举定义
│   └── message.enum.ts     # 消息类型枚举
├── utils/               # 工具函数
│   └── markdown.util.ts    # Markdown 工具
├── App.vue              # 根组件
├── main.js              # 应用入口
├── style.css            # 全局样式
└── vite-env.d.ts        # Vite 类型声明
```

## 安装依赖

```bash
pnpm install
```

## 启动开发服务器

```bash
pnpm dev
```

开发服务器默认运行在 http://localhost:5173

## 构建

```bash
# 生产构建
pnpm build

# 构建并预览
pnpm build
pnpm preview
```

构建输出位于 `dist/` 目录。

## 代码规范

```bash
pnpm lint
```

## 主要功能

### 组件

- **ChatInterface.vue** - 聊天界面，支持 SSE 实时消息
- **HelloWorld.vue** - 示例组件
- **Message.vue** - 消息展示组件

### SSE 支持

应用已集成 Server-Sent Events 支持，可通过 `sse.controller.ts` 与后端建立实时连接。

## 配置说明

- `vite.config.ts` - Vite 配置文件
- `tsconfig.json` - TypeScript 配置
- `tsconfig.node.json` - Node 环境 TypeScript 配置
- `index.html` - 入口 HTML 文件

## 参考资料

- [Vue 3 官方文档](https://vuejs.org/guide/introduction.html)
- [Vue 3 中文文档](https://cn.vuejs.org/)
- [Vite 官方文档](https://vitejs.dev/guide/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)
