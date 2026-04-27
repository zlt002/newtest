# Sidebar Folder Drop Project Design

**目标**

支持用户将本地文件夹拖入侧边栏项目列表区域，在侧边栏内看到明显的拖拽高亮和轻量确认卡片；确认后直接将该文件夹创建为项目。

**范围**

仅处理“拖入本地文件夹创建 existing workspace 项目”。
不处理单文件拖入。
不替代现有新建项目向导。

**交互设计**

侧边栏项目列表区域在检测到可接受拖拽时进入高亮态。
用户把文件夹拖入并松手后，不直接创建项目，而是在侧边栏内显示确认卡片。
确认卡片展示：

- 文件夹名称
- 完整路径
- `创建项目`
- `取消`

点击 `创建项目` 后调用现有 `createWorkspaceRequest`，参数为：

- `workspaceType: existing`
- `path: <拖入文件夹绝对路径>`

创建成功后：

- 关闭确认卡片
- 刷新项目列表
- 自动选中新创建项目（若现有回调链路支持）

创建失败后：

- 保持确认卡片关闭或关闭后提示错误
- 使用现有错误提示机制展示失败原因

**技术方案**

在 `SidebarContent.tsx` 增加拖拽事件处理与本地确认态：

- `isDragOverProjectDropzone`
- `pendingDroppedFolder`
- `isCreatingDroppedProject`

新增一个轻量工具函数，负责从 `DataTransferItemList` 中解析首个文件夹条目，并提取：

- `name`
- `path`

复用项目中已有的 WebKit 拖拽目录入口检测方式，即 `webkitGetAsEntry()`。
创建逻辑复用 `project-creation-wizard/data/workspaceApi.ts` 中现有的 `createWorkspaceRequest`。

`SidebarContent` 需要新增回调 props：

- 成功创建后通知父层刷新/选中
- 失败时触发现有 toast 或错误提示

**错误处理**

如果拖入内容中没有目录，则忽略并退出拖拽态。
如果浏览器不提供目录路径信息，则不给用户错误承诺，直接提示“不支持从当前拖拽源创建项目”。
如果目标目录已存在同名项目或后端拒绝创建，则展示后端返回错误。

**测试**

至少覆盖：

- 目录拖拽解析成功
- 非目录拖拽被忽略
- 确认创建时调用正确的 `createWorkspaceRequest` 参数
- 创建成功后关闭确认态
- 创建失败后展示错误
