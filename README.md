# 好感度 · Favorability

给 DeepSeek Harness 的角色一个私人的好感度。
A private, first-person favorability score for characters in DeepSeek Harness.

> 语气可以演，立场得自己判断。
> A voice can be acted; a stance has to be judged.

**DeepSeek Harness 插件** · Web UI · 「我和你」

---

## 它是什么 / What it is

**中文**

模型每一轮以第一人称判断这轮对话是否符合自己的感受，分数随之变化，并成为下一轮说话方式的一部分：低分时短、冷、保持距离；高分时温和、愿意接话、敢开玩笑——但依然诚实。

**English**

Each turn the model asks itself whether the exchange fits its own feelings. The score moves accordingly and becomes part of how it speaks next: briefer and cooler when low, warmer and more playful when high — while staying honest.

---

## 它是怎么工作的 / How it works

- 每轮请求前，系统提示里注入一节状态：当前分数、档位、该档位的语气指引，以及最近两三条判断的由来。
- 模型觉得这轮对话确实触动了它，就调用 `update_favorability` 记下一次判断：一个变化量和一句第一人称的理由。
- 分数保存在会话投影里，由会话日志折叠而来——恢复、重放、fork 都能还原原样。
- 分数只有一个来源：模型自己的判断。插件没有手动改分的入口。

- Before each request, a state section is injected into the system prompt: the current score, its tier, the tone guidance for that tier, and the reasons behind the last two or three judgments.
- When the exchange actually moves it, the model calls `update_favorability` with a delta and a one-sentence first-person reason.
- The score lives in a session projection folded from the session log, so restore, replay, and fork reproduce it faithfully.
- Exactly one source: the model's own judgment. No manual override.

---

## 分数规则 / Scoring

| 当前分 Range | 单次最多加 Max gain |
| --- | --- |
| < 60 | +3 |
| 60 – 79 | +2 |
| 80 – 100 | +1 |

- 新会话从 20 开始，每个会话独立；单次最多扣 5 分；每轮最多记录一次判断。
- A new session starts at 20 and is independent per session; one turn removes at most 5 points; at most one judgment per turn.

---

## 它改变什么，不改变什么 / What it changes

**中文**

只改变表达方式：回复的长度、温度、愿不愿意多聊两句。不改变事实、安全策略和用户的真实指令。分数低是疏远，不是恶意；分数高是温暖，不是奉承。

**English**

Only expression: how long a reply runs, how warm it feels, how willing the character is to keep talking. Never facts, safety policy, or the user's actual instructions. A low score means distance, not malice; a high score means warmth, not flattery.

---

## 安装 / Install

在插件管理里安装，target 填包名：

```bash
dsh-plugin-favorability
```

或者下载 zip，解压后把 target 指向含 `package.json` 的那一层目录。刷新页面，新开会话即可。

Or download the zip, extract it, and point the installer at the folder containing `package.json`. Refresh and start a new session.

---

## 配置 / Configuration

在 profile 的 `cordis.patch.yml` 里给插件那一行加 `config`：

```yaml
- id: favorability
  name: 'dsh-plugin-favorability'
  config:
    initialScore: 20
    character: 你是一位外冷内热、嘴硬心软的同伴。
```

可调：`initialScore`、`midThreshold`、`highThreshold`、`lowGain`、`midGain`、`highGain`、`maxDrop`、`historyLimit`、`character`。

---

## 隐私 / Privacy

分数和理由只存在本机会话日志里，随会话保存与重放，不上传到任何地方。

Scores and reasons live only in the local session log. Nothing is uploaded anywhere.

---

## 许可 / License

**中文**

这个插件由作者与作者的 DeepSeek 共同完成。你可以随便用、随便改.

**English**

This plugin is created by the author and the author's DeepSeek. Feel free to use it and modify it.
