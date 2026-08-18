# Agent Note: 本地化权限模式标签

Status: implemented

[English](2026-08-18-localize-permission-labels.md) | 中文

## 问题

权限模式选择器——composer 的 Access 芯片与 `/permission` 弹窗,以及通用设置里的新会话默认行——把三个内置模式渲染为硬编码英文标签(「Read Only」「Workspace Write」「Full access」),与当前语言环境无关,而周围控件都已本地化。

## 决策

三个内置模式(`read-only`、`workspace-write`、`danger-full-access`)现在在两个界面中都通过语言词典解析:`ui-conversation` 的 `PermissionSelect`,以及 `ui-permission-presets` 的弹窗与设置行。按键值查找(中文为「只读」「工作区写入」「完全访问」,英文保持原标签)只替换内置模式的机器名转 Title Case 变换;未知的宿主自定义名称继续使用 kebab 转 Title Case 变换,因为它们没有翻译。`ui-permission-presets` 的设置 store 保持语言无关(其标签属于数据);本地化发生在渲染层。完全访问的风险确认文案也改用本地化名称。

## 曾考虑的替代方案

**只在展示辅助函数里按机器名翻译。** 设置行不予采用:其标签来自宿主描述并经无语言环境的 store 传递,因此渲染时按键值查找是两个界面唯一能保持一致的地方。

**确认文案保留英文产品名。** 不予采用:确认弹窗指明它要启用的模式,必须与选择器使用相同的本地化标签。

## 后果

中文会话现在在权限选择器与确认弹窗中看到「只读」「工作区写入」「完全访问」,英文保持不变。按键值查找意味着未来新增内置模式时,只需在每个词典中加一对键,而不需要变换特例。
