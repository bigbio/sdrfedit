# SDRF Editor 用户指南

本指南面向日常使用 [SDRF Editor](https://github.com/bigbio/sdrfedit) 的科研人员与数据管理员，介绍如何创建、导入、编辑、校验与导出 SDRF（Sample and Data Relationship Format）文件。

SDRF Editor 在浏览器中运行，无需后端；适合为蛋白质组学实验整理样本与数据关系元数据，并准备提交至 PRIDE / ProteomeXchange 等仓库。

---

## 1. 快速开始

### 本地运行

```bash
npm install
ng serve
```

浏览器打开：`http://localhost:4200`

### 直接使用（嵌入 / CDN）

也可通过 jsDelivr 加载已构建的前端包（详见 [README.md](README.md) 的 Embedding 小节）。

### 通过 URL 参数打开文件

- `?url=<SDRF文件URL>`：自动从指定地址加载 TSV
- `?content=<base64编码的TSV>`：直接加载编码后的内容（例如由模板构建器跳转时使用）

---

## 2. 首页：四种进入方式

打开应用后，若当前没有已加载的表格，会看到欢迎页，可选择：

| 操作 | 说明 |
|------|------|
| **Create New SDRF** | 启动引导向导，从零创建 SDRF |
| **Import SDRF File** | 从本机导入 `.tsv` / `.txt` / `.sdrf` 文件 |
| **Load URL** | 输入可公开访问的 SDRF 文件 URL 后加载 |
| **Load Example** | 加载官方示例数据集，便于熟悉界面 |

若浏览器中曾有未保存的编辑缓存，启动时可能弹出 **Recover Your Work**，可选择恢复或丢弃。

---

## 3. 用向导创建新 SDRF

点击 **Create New SDRF** 后，按步骤填写实验信息。进度条可返回已完成步骤；未完成步骤需按顺序推进。

### 步骤概览

1. **Experiment Setup**  
   选择样本 / 技术模板（如 Human、Cell Lines、Vertebrates、MS Proteomics、DIA Acquisition 等）。

2. **Sample Characteristics**  
   定义生物体、疾病、组织等样本特征列。

3. **Sample Values**  
   为每个样本填写名称、生物重复、多候选特征值，并声明研究因子（按什么分组）。

4. **Runs & Files**  
   配置 MS runs、通道 packing，以及原始数据文件映射。

5. **Instrument & Protocol**  
   填写仪器、酶切、修饰等信息。

6. **Review & Create**  
   预览结果并生成表格，进入主编辑器继续修改。

完成后，表格会出现在主编辑界面，可继续编辑、校验与导出。

### AI 助手面板

如果[已部署助手后端](#102-向导-ai-助手需要后端)，向导右侧会出现 **SDRF Assistant** 聊天面板（可用标题栏的 `Ask AI` 重新打开）。它能覆盖三种情况：

1. **你有 PXD 编号**：直接输入 `PXD012345`。助手会抓取 PRIDE 元数据与 RAW 文件列表，找到关联文献并读取方法学部分，然后给出模板层、样本特征、仪器、酶、修饰、plex 试剂盒与文件映射的填写建议。文章未公开时，它会先尝试下载免费 PDF 并用 MinerU 解析；拿不到就提示你上传 PDF。

2. **你想问规范问题**：例如「`comment[modification parameters]` 该怎么写？」。助手基于 [SDRF 规范](https://sdrf.quantms.org/specification.html)的向量索引作答，并给出可点击的章节引用。这种情况不会改动向导。

3. **你有自己的文章**：点 **Attach PDF** 上传（由 MinerU 解析），或把方法学段落直接粘贴进聊天框。之后的建议流程与第 1 种相同。

每条建议会渲染成一张卡片，包含：

| 元素 | 含义 |
|------|------|
| 标题与置信度 | 建议内容，以及 high / medium / low 置信度 |
| `当前值 → 建议值` | 应用后会发生什么改变 |
| 依据 | 该值来自 PRIDE、文章还是规范 |
| 步骤链接 | 跳到对应向导步骤（仅限已到达的步骤） |
| Apply / Dismiss | 采纳或忽略；**不点 Apply 就不会改动向导** |

多条建议可用 **Apply all** 一次采纳。所有本体取值都在后端经 EBI OLS 校验，模型无法臆造登录号；参数不合法的建议会在应用时被拦下并显示原因。

---

## 4. 主编辑器界面

### 工具栏

| 按钮 / 区域 | 作用 |
|-------------|------|
| **Export TSV** | 将当前表格导出为 TSV 并下载 |
| **Validate** | 打开校验面板 |
| **+ Row** | 在表末新增一行 |
| **+ Column** | 按 SDRF 命名规范新增列 |
| **Filter** | 按列条件过滤行 |
| **Stats** | 打开列统计侧栏 |

工具栏右侧会显示列数、样本数，以及列类型图例：

- **Sample Accession**：样本标识相关列  
- **Sample Properties**：`characteristics[...]`  
- **Data Properties**：`comment[...]`  
- **Factor Values**：`factor value[...]`  

未保存修改时，工具栏可能显示变更计数（本地缓存提示）。

### 列颜色与必填标记

- 表头按列类型着色，便于区分样本属性、数据属性与因子  
- 必填列名旁有 `*` 标记  
- 点击表头可排序；表头上的编辑按钮可打开该列的批量编辑面板  

### 浏览大表

编辑器使用虚拟滚动，可处理较大行数。底部提供 **Go to row**，输入行号后跳转。

---

## 5. 编辑单元格

1. **单击** 选中单元格  
2. **双击** 打开单元格编辑器  

编辑器会按列类型提供不同输入方式，例如：

- **本体（Ontology）**：通过 EBI OLS 检索并选择标准术语（如 organism、tissue、disease、instrument 等）  
- **年龄（Age）**：结构化年龄输入  
- **修饰（Modification）**：蛋白质修饰相关输入  
- **酶切（Cleavage）**：酶切剂相关输入  
- **下拉选择**：如 pooled sample、labeling 等预定义选项  

### 保留值（Reserved values）

部分字段可使用规范保留值，含义如下：

| 值 | 含义 |
|----|------|
| `not available` | 未采集或无法确定 |
| `not applicable` | 对该样本类型不适用 |
| `anonymized` | 因隐私等原因脱敏 |
| `pooled` | 样本为混合池 |

表格中会对这些保留值做视觉区分。

### 右键菜单

在单元格上右键可进行常见操作，例如：

- 选中同值所有单元格 / 整列  
- 编辑或清空选中单元格  
- 在上方 / 下方插入行、删除选中行  
- 新增或删除列  

### 批量操作

- 勾选行左侧复选框（或表头全选可见行），使用 **Bulk Toolbar** 对选中样本批量改列  
- 使用列统计面板按取值筛选样本，再批量修改  
- 列标题旁的编辑入口可对该列做批量赋值  

---

## 6. 过滤与统计

### Filter

点击 **Filter** 后可添加条件，支持：

- equals / contains / starts_with / ends_with  
- is_empty / is_not_empty  

过滤只影响当前可见行，便于在大表中定位问题样本。

### Stats

**Stats** 侧栏展示各列取值分布，可：

- 按某个取值选中对应样本  
- 从统计结果发起批量编辑  

适合检查缺失值、拼写不一致或异常分布。

---

## 7. 校验（Validate）

点击 **Validate** 打开校验面板。可选两种后端：

| 模式 | 说明 |
|------|------|
| **PRIDE API**（默认） | 将当前 SDRF 发送到 PRIDE 已部署的校验服务 |
| **Local browser** | 在浏览器内通过 Pyodide 运行 `sdrf-pipelines`，文件不离开本机 |

### 推荐流程

1. 选择 Backend（API 或 Local）  
2. 勾选需要校验的 **Templates**（与实验类型对应的模板集合）  
3. 点击 **Validate via API** 或 **Validate Locally**  
4. 查看 errors / warnings 汇总  

校验结果会按相同错误信息聚合显示：

- 可点击受影响行号跳转到对应单元格  
- 若有建议文案，会显示在错误卡片中  

首次启用 **Local browser** 时，需要下载本地校验环境，请等待状态变为 Ready 后再校验。

> **隐私提示**：若数据敏感、不便上传，请使用 **Local browser** 模式。

---

## 8. 导出

在工具栏使用 **Export TSV** 下载当前编辑结果。导出文件可直接用于后续质控、仓库提交或与其他工具衔接。

（代码侧亦支持 Excel 导出能力；界面以 TSV 导出为主。）

---

## 9. 本地缓存与恢复

编辑过程中，应用会将进度缓存在浏览器本地。

- 关闭标签页后再次打开，若检测到未完成工作，会提示 **Recover Your Work**  
- 选择 **Recover** 可恢复样本数、列数与修改次数对应的缓存版本  
- 若不需要，可丢弃缓存后重新导入或新建  

建议在重要阶段仍主动 **Export TSV**，作为正式备份。

---

## 10. AI 辅助（可选）

项目有两套互相独立的 AI 能力，都是可选的。

### 10.1 编辑器推荐（纯浏览器）

用于对已打开的表格做元数据质量改进与校验问题修复建议。可配置的提供方包括：

- OpenAI  
- Anthropic  
- Google Gemini  
- 本地 Ollama  

API Key 仅在浏览器端使用；可选择会话级保存或加密持久化（以设置对话框中的说明为准）。

### 10.2 向导 AI 助手（需要后端）

向导里的助手需要一个本地 FastAPI 服务，因为它要下载 PDF、调用 MinerU、并保管 LLM 与 embedding 密钥——这些都不适合放在浏览器里。密钥只存在服务端，浏览器永远看不到。

```bash
cd backend
uv venv .venv && uv pip install -r requirements.txt   # 或 python3 -m venv + pip
cp .env.example .env                                  # 填入 LLM_API_KEY
python -m app.rag.build_index                         # 构建规范知识库索引
uvicorn app.main:app --port 8000
```

`backend/.env` 中的关键配置：

| 变量 | 作用 |
|------|------|
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 任意兼容 OpenAI 且**支持 tool calling** 的接口（OpenAI、DeepSeek、通义千问兼容模式、OpenRouter、vLLM、Ollama） |
| `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` | 规范知识库的向量化。不配也能用，检索会退化为词法匹配；补上密钥后重新执行 `build_index` |
| `MINERU_MODE` / `MINERU_FLAVOR` / `MINERU_API_KEY` | PDF 解析。`api`+`official` 走 mineru.net 在线接口，`api`+`simple` 走自建服务，`local` 走本机 `mineru` 命令行 |
| `CORS_ORIGINS` | 允许访问的前端源，例如 `http://localhost:4200` |

用 `curl http://localhost:8000/api/health` 可以查看哪些能力已就绪。前端在打开向导时会探测这个接口，只有后端可达且已配置 LLM 时才显示助手面板。

后端地址来自 `src/environments/environment.ts` 的 `assistantBaseUrl`；通过 CDN 嵌入、无法重新构建时，可以在运行时设置 `window.__SDRF_ASSISTANT_URL__`，或在 `localStorage` 里写 `sdrf_assistant_url`（面板在连不上后端时也会直接提供一个填地址的输入框）。

MinerU 没配也不影响使用：助手会改为请你把方法学段落粘贴进聊天框。

更详细的部署、向量库替换与解析后端替换说明见 [`backend/README.md`](backend/README.md)。

---

## 11. 常见工作流示例

### A. 从零提交新实验

1. Create New SDRF → 完成向导  
2. 在表格中核对文件名、通道、因子取值  
3. Validate（建议先选对应模板）  
4. 根据错误跳转修正  
5. Export TSV，用于仓库提交  

### A'. 从已发表数据集反向标注（需要助手后端）

1. Create New SDRF，在右侧助手面板输入 PXD 编号  
2. 等助手抓完 PRIDE 元数据与文献；文章未公开时按提示上传 PDF  
3. 逐条查看建议卡片的 `当前值 → 建议值`，Apply 采纳、Dismiss 忽略  
4. 回到向导补齐助手没有依据的字段（样本数、per-sample 取值等）  
5. Review & Create → Validate → Export TSV  

### B. 修订已有 SDRF

1. Import SDRF File（或 Load URL）  
2. 用 Filter / Stats 定位问题列  
3. 双击或批量编辑修正  
4. Validate → Export TSV  

### C. 学习规范写法

1. Load Example  
2. 观察列命名与保留值用法  
3. 对照 [SDRF Specification](https://sdrf.quantms.org/specification.html)  

---

## 12. 使用提示

- 列名请遵循 SDRF 约定：`characteristics[name]`、`comment[name]`、`factor value[name]`  
- 生物学术语尽量通过 Ontology 搜索选择，避免自由文本拼写差异  
- 校验前确认所选 Templates 与实验类型匹配，否则可能出现无关报错  
- 大文件编辑时优先用 Filter、跳转行号与批量编辑，减少逐格操作  
- 正式提交前至少完成一次校验，并保留导出的 TSV 备份  

---

## 13. 相关资源

- [SDRF 项目主页](https://sdrf.quantms.org/)  
- [SDRF 规范说明](https://sdrf.quantms.org/specification.html)  
- [proteomics-metadata-standard](https://github.com/bigbio/proteomics-metadata-standard)  
- [sdrf-pipelines](https://github.com/bigbio/sdrf-pipelines)  
- [sdrf-annotated-datasets](https://github.com/bigbio/sdrf-annotated-datasets)  

开发者安装、构建、嵌入与贡献方式请参阅 [README.md](README.md)。

---

## 许可

Apache License 2.0
