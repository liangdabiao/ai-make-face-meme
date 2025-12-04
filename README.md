## ai-make-face-meme

一个令人惊艳的定格动画生成器，基于单张图片创建

- 使用 Gemini nano banana Pro 生成分离的姿势序列
- 基于每个姿势使用 Gemini Nano Banana 生成动画帧
- 使用 Framer Motion 将帧拼接成动画,可以下载为gif
- Next.js 提供Web界面和API服务

### 安装使用说明

```bash
npm install -g pnpm
pnpm install 
pnpm dev          # Start development server with Turbopack
pnpm build        # Build for production with Turbopack
pnpm start        # Start production server
pnpm lint         # Run ESLint
```

重命名：  - 副本.env 为 .env ，修改为自己的key 
测试gif生成功能： /test

### 核心架构逻辑说明

#### 1. 前端页面 (`/src/app/page.tsx`)
**核心功能**：用户界面和动画播放控制
- **文件上传与预览**：支持拖放上传，显示上传图片预览
- **动画生成控制**：调用后端API生成动画帧，提供实时进度反馈
- **动画播放器**：支持帧间导航、播放/暂停、帧率调节(1-30 FPS)
- **GIF导出功能**：多种导出方案(gifencoder → ZIP → 单帧回退)
- **帧管理**：支持帧的添加、删除、移动和预览

#### 2. 后端API (`/src/app/api/stop-motion/route.ts`)  
**核心功能**：AI动画生成服务
- **图像分析**：接收用户上传图片，调用AI生成12个姿势序列
- **流式响应**：实时返回生成进度，支持长时任务(800秒超时)
- **逐帧生成**：基于姿势描述，调用Gemini Nano Banana生成图片帧
- **错误处理**：单帧错误不中断整体生成，提供详细错误信息
- **数据返回**：通过流式API向前端传输base64图片数据

## 效果图

![NanoMotion App Screenshot](./ScreenShot_2025-12-03_162958_679.png)

### 生成gif

![NanoMotion App Screenshot](./nanomotion-animation-1764830380765.gif)

![NanoMotion App Screenshot](./nanomotion-animation-1764830817471.gif)


## github继承

基础思路和代码继承：https://github.com/madhurjain/nanomotion ，感谢作者