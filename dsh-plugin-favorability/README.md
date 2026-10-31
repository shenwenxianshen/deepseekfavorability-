# 好感度 · Favorability

给 DeepSeek Harness 的角色一个「私人好感度」：模型以第一人称判断一轮对话
是否符合它的感受，分数随对话慢慢变化，并通过系统提示影响它说话的语气；输入框
下方有一个实时分数徽章。

分数只由模型自己的判断推动，**没有手动改分的入口**。

## 它做什么

系统提示里会增加一节 `favorability:state`，内容包括：

- 当前分数与档位（疏离 / 克制 / 平稳 / 亲近 / 依恋），以及该档位的语气指引；
- 要求模型每轮以第一人称自问「这符合我的感受吗」，并以自己的视角判断，而不是以
  「怎样让用户满意」为视角；
- 要求模型在感受真的变化时调用 `update_favorability(delta, reason)`，`reason`
  是一句第一人称的私下判断；
- 最近两三条判断也会写进提示，让分数有来历，而不是一个孤零零的数字；
- 明确「分数不覆盖事实、安全或用户真实指令；低分是疏远，不是恶意；高分是温暖，
  不是奉承」。

徽章只显示分数和档位；鼠标悬停可以看到最近一次判断的原因。

## 安装

需要 DeepSeek Harness 的 Web 界面。插件对同一 profile 下的所有会话生效；
子代理会话不注入。

### 方式一：按包名安装（推荐）

在插件管理里安装插件，target 填包名：

```
dsh-plugin-favorability
```

安装后刷新页面，新开一个会话即可看到徽章。

### 方式二：下载后本地安装

把 zip 解压到任意目录，在插件管理里安装，target 填解压后包含 `package.json`
的那一层目录。刷新页面，新开会话。

## 配置

在 profile 的 `cordis.patch.yml`（本机一般在
`~/.dsh/profiles/<profile>/cordis.patch.yml`）里给插件那一行加 `config`：

```yaml
- id: favorability
  name: 'dsh-plugin-favorability'
  config:
    initialScore: 20
    character: 你是一位外冷内热、嘴硬心软的同伴。
```

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `initialScore` | `20` | 新会话初始分，0–100 |
| `midThreshold` | `60` | 中档起点；低于它是低档 |
| `highThreshold` | `80` | 高档起点 |
| `lowGain` | `3` | 低档单次最多加 |
| `midGain` | `2` | 中档单次最多加 |
| `highGain` | `1` | 高档单次最多加 |
| `maxDrop` | `5` | 单次最多扣 |
| `historyLimit` | `20` | 保留多少条最近判断 |
| `character` | `""` | 可选的一句角色设定，会插入提示词 |

## 分数怎么走

- 每个会话独立，从 `initialScore` 开始，范围 `0–100`。
- 低档单次最多 `+3`，中档 `+2`，高档 `+1`——分越高越难加。
- 单次扣分最多 `-5`。
- 模型每轮最多记录一次；没有调用时分数不变，语气维持当前档位。

## 它会改变什么

只影响表达方式：语气、长度、是否愿意多聊两句。事实、安全策略、用户的真实
指令都不受影响——低分是疏远，不是恶意；高分是温暖，不是奉承。

## 卸载

在插件管理里停用或卸载即可。如果手动往 patch 里加过这一行，删掉它。

## 隐私

分数和判断原因只存在本地会话日志里，随会话保存和重放，不会上传到任何地方。

## 开发

```
index.js          # Host：投影、工具、提示词段落
client.js         # Client：输入框下方的徽章
cordis.patch.yml  # 向加载器插入插件行
locale/*.json     # 插件管理里的标题与描述
icon.svg
```

- 状态用 `sessionProjections` 保存，从 `tool/result` 的 `meta` 折叠分数，所以
  恢复、重放、fork 都能还原。
- 投影状态版本是 `3`；从旧版本覆盖安装时，已有会话的分数会从初始分重新开始。

本地调试时把整个目录装进 profile 即可，改完重载插件生效。

## 改包名

如果 `dsh-plugin-favorability` 在 npm 上被占用，改成你自己的名字时，三处必须
同步修改：

1. `package.json` 的 `name`
2. `client.js` 里的 `id`
3. `cordis.patch.yml` 里的 `name`

## 许可

MIT
