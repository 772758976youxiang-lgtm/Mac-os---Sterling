# Agent Note: 重建应用图标与品牌标识

Status: implemented

[English](2026-08-20-brand-mark-rebuild.md) | 中文

## 问题

应用的视觉标识仍是 DeepSeek 时代的遗留:`apps/web/public/sterling-icon.png` 与浏览器 favicon 使用鲸鱼/鱼形图案,`FishLogo` React 组件用 `currentColor` 渲染鱼形。产品已演进到 Sterling Harness 身份,并选定新的设计稿(白色圆角方形底板 + 黑色女性侧影)作为应用图标。1454px 的 PNG 需要按新设计重新生成,favicon 与 GUI 内的品牌标识需要同步,陈旧的 `FishLogo` 组件(已导出但未被任何 UI 使用)也必须停止呈现旧图形。

## 决策

从剪影素材（透明背景 PNG，仅含黑色剪影） 重建全部品牌资产:

- **矢量化。** 用 marching squares 在二值掩码上提取黑色剪影(case 表由角点值机械生成),对最大轮廓环做 Douglas–Peucker 简化,将所得路径归一化到 `512×512` 图标坐标系,剪影约占高度 68%,略低于中心(上下对称居中)。
- **图标设计。** 圆角方形底板(`rx` 115/512 ≈ 22.5%)填充 `#FFFFFF`,剪影填充 `#101010`;底板保留 4px 安全边距。
- **静态资产。** `apps/web/public/sterling-icon.png` 替换为新图标的 1454px 渲染(PWA manifest 保持 `1454x1454`)。`apps/web/public/favicon.svg` 与 `website/public/favicon.svg` 变为内联矢量品牌标识(此前 web favicon 是引用 PNG 的 `<image>` 别名)。
- **组件。** `FishLogo.tsx` 更名为 `BrandMark.tsx`,改为以内联 SVG 渲染品牌标识(1:1 方形,默认 24px);`ui-primitives` 以 `BrandMark` 重新导出。GUI 中实际使用的品牌标识(`SterlingMark`,渲染 `/sterling-icon.png`)自动获得新 PNG。
- **测试。** `icons.client.spec.tsx` 中的 `FishLogo` 单元测试替换为 `BrandMark` 测试,断言底板 rect、单条剪影 path、`512` viewBox 与品牌填充色。`pwa-manifest.e2e.ts` 改为断言 favicon 是内联矢量(`viewBox`、`#FFFFFF`),不再别名引用 PNG。

文档站点的 DeepSeek wordmark(`website/public/wordmark.svg`)有意保持不变:它属于 DeepSeek 文档品牌,与 Sterling 应用身份分离。

## 曾考虑的替代方案

**只提供 PNG,favicon 继续作为 `<image>` 别名。** 不予采用:内联矢量让 favicon 在任意尺寸下保持清晰,并消除 favicon 对 PNG 文件的运行时依赖。

**保留 `FishLogo` 组件名并换用新图形。** 不予采用:名称描述的是旧图形;pre-release 阶段仓库更倾向正确命名而非兼容垫片;该组件没有 UI 消费者,更名成本低。

**原样黄色底板、贴底构图。** 不予采用:用户选定的素材是白底居中剪影;上一版黄色方案经评审后弃用。剪影居中(而非照搬任何裁边构图)可让图标在系统图标遮罩下保持安全。

## 后果

favicon 从 PNG 别名变为自包含矢量,陈旧的或缺失的 `sterling-icon.png` 不再影响标签页图标。GUI 品牌标识(`SterlingMark` → `/sterling-icon.png`)在已有出现位置(侧边栏轨道、空态英雄区)自动显示新图标,无需组件改动。英雄区"游动"悬停动画与 `fish`/`railFish` CSS 类名原样保留:它们是内部样式名,轻微旋转对方形标识同样自然。`website` favicon 现在显示 Sterling 标识而非 DeepSeek 鲸鱼,而站点导航 wordmark 保持 DeepSeek 身份。
