# Syllabus Terminator

[English](./README.md) | [简体中文](./README.zh-CN.md)

把课程 syllabus PDF 转成可检查、可编辑、可导出到日历的截止日期事件。

Syllabus Terminator 会从课程大纲 PDF 中提取作业、quiz、期中考试、期末考试等重要事件，允许用户在导出前手动检查和修改结果，并最终导出为可导入 Google Calendar 或其他日历应用的 `.ics` 文件。

这个仓库目前是项目的本地 MVP 版本。长期目标是把它做成一个托管的网页版，让用户不需要安装本地模型也能直接使用。

## 当前状态

- 当前里程碑：`v0.1.0`
- 本地 MVP 已经可以运行
- PDF 文本提取在浏览器端完成
- 事件抽取目前使用本地 Node 后端加 Ollama
- 导出前支持手动编辑结果
- `.ics` 日历导出已经可用

## 它能做什么

- 上传课程 syllabus PDF
- 使用 `pdfjs-dist` 提取原始文本
- 用规则解析和 LLM 混合流程抽取 deadline 和 assessment
- 手动检查并编辑事件名称、日期和时间
- 在导出前新增或删除事件
- 将最终结果导出为 `.ics` 日历文件

## 为什么要做这个项目

课程大纲里通常藏着很多重要截止日期，但这些日期往往散落在评分表、每周课程安排或者很长的 PDF 文档里。这个项目的目标就是减少这种信息整理成本，把非结构化 syllabus 文本转成学生可以真正放进日历里使用的内容。

## 技术栈

- React
- Vite
- Tailwind CSS
- `pdfjs-dist`
- `ics`
- Node.js 后端
- Ollama 本地模型推理

## 工作流程

1. 用户在浏览器中上传 PDF。
2. 前端使用 `pdfjs-dist` 从 PDF 中提取原始文本。
3. 前端把提取后的文本发送给后端。
4. 后端将规则解析与通过 Ollama 调用的本地 LLM 结合起来处理文本。
5. 应用返回结构化事件结果。
6. 用户对提取出的事件进行检查和编辑。
7. 最终确认后的事件会导出为 `.ics` 文件。

## 本地运行方式

### 1. 安装依赖

```bash
npm install
```

### 2. 安装并启动 Ollama

从这里安装 Ollama：

https://ollama.com/download

然后拉取一个模型。

默认轻量模型：

```bash
ollama pull deepseek-r1:1.5b
```

推荐的更强本地模型：

```bash
ollama pull qwen2.5:14b
```

### 3. 启动后端

默认模型：

```bash
npm run server
```

使用更强模型：

```bash
OLLAMA_MODEL=qwen2.5:14b npm run server
```

Windows PowerShell 示例：

```powershell
$env:OLLAMA_MODEL='qwen2.5:14b'
npm.cmd run server
```

### 4. 启动前端

开发模式：

```bash
npm run dev
```

或者构建后预览：

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

## 项目结构

```text
src/
  components/       UI 组件
  pages/            页面级 React 视图
  utils/            PDF 提取、API 客户端、ICS 导出辅助函数

server/
  index.mjs         本地抽取后端与解析逻辑

scripts/
  debug_extract_pdf.mjs   用于调试 PDF 抽取效果的脚本
```

## 目前已经做得比较好的部分

- 导出前可编辑的审核流程
- 对评分表和 weekly schedule 模式有更好的处理
- 当 syllabus 提供足够结构时，可以展开每周重复的 quiz 和 assignment
- 在真实课程 PDF 上进行过实测和调优

## 当前限制

- 这个版本仍然主要面向本地运行
- 用户目前需要安装 Ollama 和本地模型
- 抽取准确率仍然会受到 syllabus 排版质量影响
- 扫描版 PDF 可能仍需要 OCR 才能获得更好的结果
- 托管网页版还没有完成

## 路线图

- 部署托管网页版，让最终用户不需要本地模型
- 为扫描版 syllabus 提供更好的 OCR 支持
- 增强多模型后端支持
- 支持拖拽排序事件
- 在导出前增加更好的校验和冲突检测
- 做更完整的 public landing page 和 demo 体验

## 适合的使用场景

- 想把 syllabus 快速导入日历的学生
- 课程项目演示
- 展示 PDF parsing + AI-assisted structuring 的作品集项目
- 学术工作流效率工具的原型验证

## 贡献

欢迎提 issue、想法和反馈。

如果你想参与贡献，比较好的切入点包括：

- 提升对更多 syllabus 格式的抽取准确率
- 完善托管部署架构
- 优化手动编辑体验
- 增加测试和校验

## 许可证

目前仓库还没有添加 license。

如果你希望这个仓库真正作为开源项目被复用或接受贡献，下一步应该尽快补上许可证。
