# 侧边栏当前项目点击切换文件视图设计

**日期**: 2026-04-27  
**作者**: Codex  
**状态**: 已确认

## 概述

在左侧 `项目` 工作台中，点击项目列表里的“当前已选中项目”时，用户希望直接切到左侧 `文件` tab 查看该项目文件内容。  
如果点击的不是当前项目，则保持现有行为，不切换到 `文件` tab。

## 目标

1. 当前项目点击时，切换左侧工作台到 `files`。
2. 非当前项目点击时，不切换工作台。
3. 尽量复用现有 `Sidebar` 与 `SidebarProjectItem` 结构，避免引入新的全局状态。

## 非目标

1. 不改变右侧编辑器 tab 的打开逻辑。
2. 不把“点击项目”改造成“重新选中项目”。
3. 不调整非当前项目的展开/折叠行为。

## 交互规则

1. 点击当前已选中项目：
   切换左侧工作台到 `files`。
2. 点击非当前项目：
   保持现有项目项点击行为，不切换工作台。
3. 其它入口：
   `新建会话`、会话点击、更多操作菜单不受影响。

## 方案

采用最小改动方案：

1. 在 `Sidebar` 中提供一个切换到 `files` 工作台的回调。
2. 通过 `SidebarProjectList` 透传到 `SidebarProjectItem`。
3. 在项目项点击处理里判断当前项目是否为 `selectedProject`：
   - 是：调用切换到 `files` 的回调。
   - 否：继续执行现有 `toggleProject`。

## 影响范围

1. `src/components/sidebar/view/Sidebar.tsx`
2. `src/components/sidebar/view/subcomponents/SidebarProjectList.tsx`
3. `src/components/sidebar/view/subcomponents/SidebarProjectItem.tsx`
4. `src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`

## 测试

1. 断言 `Sidebar.tsx` 提供切换到 `files` 的项目点击回调。
2. 断言 `SidebarProjectList.tsx` 将该回调透传给项目项。
3. 断言 `SidebarProjectItem.tsx` 仅在当前项目点击时调用该回调，非当前项目仍走 `toggleProject`。
