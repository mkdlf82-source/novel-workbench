#!/usr/bin/env python3
"""
每日全网热点抓取 & 小说梗转化脚本
=====================================
运行环境：GitHub Actions（不依赖 WorkBuddy）
每天自动抓取微博/知乎/头条热点，并转化为小说创作素材。

输出：
  - hotspots_export.json  → 导入工作台的 JSON
  - hotspots_daily_YYYYMMDD.md → 可读日报
"""

import json
import os
import re
import sys
import time
import hashlib
import random
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# ========== 配置 ==========
OUTPUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_HOTSPOTS = 50

# 写作赛道
TRACKS = [
    "婚内打脸", "婆媳家庭", "真假千金", "重生纠错",
    "校园恩怨", "职场逆袭", "原生家庭", "微悬疑吃瓜",
    "都市猎奇", "古风短虐"
]

# 情绪标签库
EMOTION_TAGS = [
    "愤怒", "不忿", "打脸", "爽感", "心酸", "讽刺",
    "反转", "憋屈", "共鸣", "心疼", "大快人心", "细思极恐"
]

# 屏蔽关键词（时政/敏感/纯娱乐/广告）
BLOCK_KEYWORDS = [
    "习近平", "李克强", "政治局", "国务院", "中央", "两会",
    "台湾", "香港", "新疆", "西藏", "南海", "钓鱼岛",
    "明星", "综艺", "演唱会", "新歌", "专辑", "出道",
    "直播带货", "优惠券", "抢购", "促销", "限时",
    "官员", "纪委", "反腐", "外交", "军事", "阅兵"
]

# 优先关键词（民生/情感/家庭/职场）
PRIORITY_KEYWORDS = [
    "婚姻", "离婚", "出轨", "婆婆", "儿媳", "夫妻", "彩礼",
    "遗产", "房产", "扶弟", "扶哥", "啃老", "养老",
    "职场", "辞职", "加班", "裁员", "工资",
    "教育", "考试", "校园", "同学", "老师",
    "法律", "判决", "纠纷", "赔偿", "维权"
]

# 标题模板
TITLE_TEMPLATES = {
    "婚内打脸": {
        "知乎": ["{topic}后，我拿出了一份{z证据}", "如何看待{事件}中的{角色}？"],
        "番茄": ["{topic}，我让TA{z结果}", "{角色}以为{wrong}，没想到{right}"],
        "小程序": ["{brief_title}之后，TA{z结果}", "{情绪词}！{brief_title}"]
    },
    "婆媳家庭": {
        "知乎": ["婆婆{action}，我{response}，全家沉默了"],
        "番茄": ["婆婆{action}，我一招让她{z结果}"],
        "小程序": ["婆婆{action}，结局太解气了"]
    },
    "职场逆袭": {
        "知乎": ["被{action}后，我{response}"],
        "番茄": ["{action}那天，全公司都傻了"],
        "小程序": ["被{action}后，我{z结果}"]
    },
    "原生家庭": {
        "知乎": ["父母{action}，我{response}，他们后悔了"],
        "番茄": ["父母把{thing}给了{someone}，我笑了"],
        "小程序": ["{brief_title}，结局让人泪目"]
    },
    "微悬疑吃瓜": {
        "知乎": ["{topic}背后，隐藏着什么秘密？"],
        "番茄": ["{brief_title}，真相让人后背发凉"],
        "小程序": ["{brief_title}，监控拍下惊人一幕"]
    },
    "default": {
        "知乎": ["如何看待「{topic}」？"],
        "番茄": ["{brief_title}，结局出乎所有人意料"],
        "小程序": ["{emotion}！{brief_title}"]
    }
}

TZ = timezone(timedelta(hours=8))


def today_str():
    return datetime.now(TZ).strftime("%Y-%m-%d")


def today_compact():
    return datetime.now(TZ).strftime("%Y%m%d")


def fetch_json(url, headers=None):
    """获取 JSON 数据"""
    if headers is None:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": url.rsplit("/", 1)[0] + "/"
        }
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=15) as resp:
            data = resp.read().decode("utf-8")
            return json.loads(data)
    except (URLError, HTTPError, json.JSONDecodeError) as e:
        print(f"  [WARN] 获取 {url} 失败: {e}", file=sys.stderr)
        return None


def fetch_weibo():
    """抓取微博热搜"""
    print("[微博] 正在抓取热搜...")
    results = []
    api_url = "https://weibo.com/ajax/side/hotSearch"
    data = fetch_json(api_url)
    if not data or "data" not in data:
        print("  [WARN] 微博 API 返回异常")
        return results

    for item in data.get("data", {}).get("realtime", [])[:30]:
        title = item.get("word", "").strip()
        if not title or len(title) < 3:
            continue
        url_scheme = item.get("word_scheme", "")
        link = f"https://s.weibo.com/weibo?q={title}" if not url_scheme else f"https://s.weibo.com/{url_scheme}"
        results.append({
            "platform": "微博",
            "title": title,
            "link": link,
            "rank": item.get("rank", 0),
            "raw_hot": item.get("raw_hot", 0)
        })
    print(f"  [微博] 获取 {len(results)} 条热搜")
    return results


def fetch_zhihu():
    """抓取知乎热榜"""
    print("[知乎] 正在抓取热榜...")
    results = []
    api_url = "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
    }
    data = fetch_json(api_url, headers)
    if not data or "data" not in data:
        print("  [WARN] 知乎 API 返回异常")
        return results

    for item in data.get("data", [])[:30]:
        target = item.get("target", {})
        title = target.get("title", "").strip()
        if not title:
            continue
        qid = target.get("id", "")
        link = f"https://www.zhihu.com/question/{qid}" if qid else ""
        results.append({
            "platform": "知乎",
            "title": title,
            "link": link,
            "excerpt": target.get("excerpt", "")[:200],
            "raw_hot": item.get("detail_text", "")
        })
    print(f"  [知乎] 获取 {len(results)} 条热榜")
    return results


def fetch_toutiao():
    """抓取头条热榜（通过备用接口）"""
    print("[头条] 正在抓取热榜...")
    results = []
    # 尝试多个 API 端点
    urls = [
        "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
        "https://www.toutiao.com/api/pc/list/feed"
    ]
    for url in urls:
        data = fetch_json(url)
        if data and "data" in data:
            items = data.get("data", [])
            if isinstance(items, list):
                for item in items[:30]:
                    title = ""
                    link = ""
                    if isinstance(item, dict):
                        title = item.get("Title") or item.get("title") or ""
                        if not title and "content" in item:
                            title = item.get("content", "")
                        link = item.get("Url") or item.get("url") or f"https://www.toutiao.com/trending/{item.get('ClusterId', '')}"
                    if title:
                        results.append({
                            "platform": "头条",
                            "title": title.strip(),
                            "link": link,
                            "raw_hot": item.get("HotValue", 0) if isinstance(item, dict) else 0
                        })
                if results:
                    break

    print(f"  [头条] 获取 {len(results)} 条热榜")
    return results


# ========== 内容过滤 ==========

def is_blocked(title):
    """检查是否需要屏蔽"""
    title_lower = title.lower()
    for kw in BLOCK_KEYWORDS:
        if kw.lower() in title_lower:
            return True
    return False


def is_priority(title):
    """检查是否为优先内容（民生/情感/家庭/职场）"""
    for kw in PRIORITY_KEYWORDS:
        if kw in title:
            return True
    return False


def classify_track(title):
    """根据标题关键词判断适配赛道"""
    track_keywords = {
        "婚内打脸": ["婚姻", "离婚", "出轨", "小三", "渣男", "渣女", "老公", "老婆", "夫妻", "结婚", "彩礼"],
        "婆媳家庭": ["婆婆", "儿媳", "媳妇", "婆媳", "公公", "家庭", "孩子", "儿子", "女儿", "孙子", "孙女"],
        "真假千金": ["真假", "千金", "身世", "抱错", "亲生的", "富家"],
        "重生纠错": ["重生", "穿越", "回到", "前世", "轮回"],
        "校园恩怨": ["学生", "老师", "校园", "同学", "考试", "毕业", "学校", "大学", "高中"],
        "职场逆袭": ["职场", "辞职", "加班", "裁员", "工资", "老板", "同事", "升职", "面试"],
        "原生家庭": ["父母", "原生", "家庭", "童年", "重男轻女", "扶弟", "扶哥", "啃老", "养老", "遗产"],
        "微悬疑吃瓜": ["真相", "悬疑", "秘密", "反转", "监控", "偷拍", "录音", "证据"],
        "都市猎奇": ["奇闻", "怪事", "离奇", "惊人", "稀奇", "奇葩"],
        "古风短虐": ["古风", "古代", "王爷", "将军", "宫廷", "江湖", "虐恋"],
    }
    for track, keywords in track_keywords.items():
        for kw in keywords:
            if kw in title:
                return track
    # 默认根据情绪分配
    default_tracks = ["婚内打脸", "婆媳家庭", "原生家庭", "职场逆袭", "微悬疑吃瓜"]
    return random.choice(default_tracks)


def generate_emotion_tag(title):
    """根据标题生成情绪标签"""
    emotion_map = {
        "愤怒": ["曝光", "怒斥", "谴责", "气愤", "过分", "不要脸"],
        "不忿": ["凭什么", "不公平", "委屈", "冤枉"],
        "打脸": ["反转", "打脸", "没想到", "真相", "结局"],
        "爽感": ["赢", "胜诉", "追回", "成功", "逆袭"],
        "心酸": ["泪目", "感人", "哭了", "心疼", "可怜"],
        "讽刺": ["讽刺", "果然", "原来", "好笑"],
        "细思极恐": ["秘密", "背后", "隐藏", "监控", "录音"],
    }
    tags = set()
    for tag, keywords in emotion_map.items():
        for kw in keywords:
            if kw in title:
                tags.add(tag)
    if not tags:
        tags.add(random.choice(EMOTION_TAGS[:6]))
    return "、".join(list(tags)[:3])


def generate_summary(item):
    """生成热点精简梗概"""
    title = item["title"]
    if item.get("excerpt"):
        return item["excerpt"][:100]
    return f"{title}"[:100]


def generate_conflict(title, track):
    """生成核心戏剧冲突"""
    conflict_patterns = {
        "婚内打脸": "婚姻信任崩塌→证据收集→公开反转",
        "婆媳家庭": "家庭权力博弈→偏心/财产→法律/道德双重反击",
        "职场逆袭": "职场不公打压→隐忍积蓄力量→逆袭翻盘",
        "原生家庭": "原生家庭伤害→觉醒反抗→自我救赎",
        "微悬疑吃瓜": "表面平静→隐藏秘密→真相大白",
        "真假千金": "身份错位→真假对决→真相揭晓",
        "重生纠错": "前世遗憾→重生机会→改写命运",
        "校园恩怨": "校园矛盾→升级对抗→最终和解/胜负",
        "都市猎奇": "离奇事件→层层解密→惊人真相",
        "古风短虐": "虐恋纠葛→误会重重→生死抉择",
    }
    base = conflict_patterns.get(track, "情感矛盾→冲突升级→结局反转")
    return f"{base}（源自：{title}）"


def generate_novel_core(title, track):
    """生成可直接使用的小说核心梗"""
    title_short = title[:30]
    core_patterns = {
        "婚内打脸": f"发现配偶背叛后，主人公暗中收集证据，在关键时刻当众揭穿，让对方一无所有——原型：{title_short}",
        "婆媳家庭": f"面对婆婆的偏心和不公，主人公用法律武器保护自己，让所有人大跌眼镜——原型：{title_short}",
        "职场逆袭": f"被公司不公平对待后，主人公凭借自己的能力在竞争对手公司大放异彩——原型：{title_short}",
        "原生家庭": f"从小不被重视的主人公，在关键时刻站出来解决家庭危机，父母终于看到TA的价值——原型：{title_short}",
        "微悬疑吃瓜": f"一桩看似普通的日常事件，背后隐藏着令人细思极恐的真相——原型：{title_short}",
    }
    return core_patterns.get(track, f"以「{title_short}」为原型创作：主人公面临类似困境，经历冲突与成长，最终获得想要的结局")


def generate_titles(title, track, emotion):
    """生成三个平台的爆款标题模板"""
    tmpls = TITLE_TEMPLATES.get(track, TITLE_TEMPLATES["default"])

    brief_title = title[:20]
    replacements = {
        "topic": title[:30],
        "brief_title": brief_title,
        "事件": title[:15],
        "角色": "当事人",
        "emoji_url": "",
        "emotion": emotion.split("、")[0] if "、" in emotion else emotion,
        "action": "做出这件事",
        "response": "这样做",
        "z结果": "后悔莫及",
        "z证据": "关键证据",
        "wrong": "一切尽在掌控",
        "right": "结局令人意外",
        "thing": "财产",
        "someone": "别人",
        "情绪词": emotion.split("、")[0] if "、" in emotion else "震惊",
    }

    result = {}
    for platform in ["知乎", "番茄", "小程序"]:
        templates = tmpls.get(platform, [f"{{brief_title}}"])
        chosen = random.choice(templates)
        for k, v in replacements.items():
            chosen = chosen.replace("{" + k + "}", v)
        result[platform] = chosen

    return f"{result['知乎']}\n{result['番茄']}\n{result['小程序']}"


def generate_full_text(item):
    """生成热点完整文字版"""
    title = item["title"]
    platform = item["platform"]
    link = item.get("link", "")
    excerpt = item.get("excerpt", "")

    parts = [
        f"【{platform}热搜】{title}",
        "",
    ]
    if excerpt:
        parts.append(f"{excerpt}")
    else:
        parts.append(f"近日，「{title}」引发广泛关注和讨论。")
    parts.append("")
    parts.append(f"📎 原文链接：{link}" if link else f"📎 搜索关键词：{title}")
    parts.append("")

    return "\n".join(parts)


# ========== 主流程 ==========

def main():
    print(f"=== 每日热点抓取 & 小说梗转化 ===")
    print(f"执行时间: {datetime.now(TZ).strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # 1. 抓取所有平台
    all_items = []
    all_items.extend(fetch_weibo())
    all_items.extend(fetch_zhihu())
    all_items.extend(fetch_toutiao())

    # 2. 去重
    seen = set()
    unique_items = []
    for item in all_items:
        title_hash = hashlib.md5(item["title"].encode()).hexdigest()
        if title_hash not in seen:
            seen.add(title_hash)
            unique_items.append(item)

    print(f"\n总计去重后: {len(unique_items)} 条")

    # 3. 过滤 & 排序
    priority_items = []
    normal_items = []
    blocked_items = []

    for item in unique_items:
        if is_blocked(item["title"]):
            blocked_items.append(item)
        elif is_priority(item["title"]):
            priority_items.append(item)
        else:
            normal_items.append(item)

    # 优先内容排前面，最多取 MAX_HOTSPOTS 条
    selected = (priority_items + normal_items)[:MAX_HOTSPOTS]

    print(f"屏蔽: {len(blocked_items)} 条（时政/敏感/娱乐/广告）")
    print(f"选中: {len(selected)} 条（优先 {len(priority_items)} + 普通 {min(len(normal_items), MAX_HOTSPOTS - len(priority_items))}）")

    # 4. 生成内容
    hotspots = []
    avoid_list = []

    for i, item in enumerate(selected):
        track = classify_track(item["title"])
        emotion = generate_emotion_tag(item["title"])

        hotspot = {
            "id": f"auto_{today_compact()}_{i+1:03d}",
            "subCategory": "当日热点日报",
            "title": item["title"],
            "source": item["platform"],
            "sourceLink": item.get("link", ""),
            "fullText": generate_full_text(item),
            "summary": generate_summary(item),
            "emotionTag": emotion,
            "conflict": generate_conflict(item["title"], track),
            "novelCore": generate_novel_core(item["title"], track),
            "adaptTrack": track,
            "titleTemplates": generate_titles(item["title"], track, emotion),
            "createdAt": today_str()
        }
        hotspots.append(hotspot)

    # 屏蔽条目整理到避雷清单
    for item in blocked_items[:20]:
        reason = "时政敏感" if any(kw in item["title"] for kw in ["政治", "官员", "外交"]) else \
                 "纯娱乐八卦" if any(kw in item["title"] for kw in ["明星", "综艺", "出道"]) else \
                 "广告营销" if any(kw in item["title"] for kw in ["促销", "抢购", "优惠"]) else \
                 "敏感内容"
        avoid_list.append({
            "id": f"avoid_{today_compact()}_{len(avoid_list)+1:03d}",
            "subCategory": "热点避雷清单",
            "title": item["title"],
            "source": item["platform"],
            "sourceLink": item.get("link", ""),
            "summary": f"不适合转化为小说素材",
            "emotionTag": reason,
            "conflict": f"避免原因：{reason}",
            "novelCore": "",
            "adaptTrack": "",
            "titleTemplates": "",
            "fullText": "",
            "createdAt": today_str()
        })

    print(f"\n生成 {len(hotspots)} 条热点素材 + {len(avoid_list)} 条避雷清单")

    # 5. 保存文件
    output = {"hotspots": hotspots}

    json_path = os.path.join(OUTPUT_DIR, "hotspots_export.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n[JSON] 已保存: {json_path}")

    # 生成日报 Markdown
    md_path = os.path.join(OUTPUT_DIR, f"hotspots_daily_{today_compact()}.md")
    lines = [
        f"# 📰 每日热点日报 — {today_str()}",
        "",
        f"> 自动生成时间：{datetime.now(TZ).strftime('%Y-%m-%d %H:%M')}",
        f"> 共抓取 {len(hotspots)} 条有效热点，屏蔽 {len(blocked_items)} 条",
        "",
        "---",
        "",
        "## 🔥 今日热点精选",
        "",
    ]

    for h in hotspots:
        lines.extend([
            f"### {h['title']}",
            f"",
            f"- **来源**：{h['source']}",
            f"- **赛道**：{h['adaptTrack']}",
            f"- **情绪标签**：{h['emotionTag']}",
            f"- **🔗 原文链接**：{h['sourceLink']}",
            f"",
            f"**📝 精简梗概**：{h['summary']}",
            f"",
            f"**⚔️ 核心冲突**：{h['conflict']}",
            f"",
            f"**📖 小说核心梗**：{h['novelCore']}",
            f"",
            f"**📋 爆款标题模板**：",
            f"```",
            f"{h['titleTemplates']}",
            f"```",
            f"",
            f"**📄 完整文字版**：",
            f"```",
            f"{h['fullText']}",
            f"```",
            f"",
            "---",
            "",
        ])

    lines.extend([
        "## ⚠️ 热点避雷清单",
        "",
        "以下热点不适合转化为小说素材：",
        "",
    ])
    for a in avoid_list:
        lines.append(f"- **{a['title']}** — {a['emotionTag']}")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[MD] 已保存日报: {md_path}")

    # 汇总
    print(f"\n{'='*50}")
    print(f"✅ 完成！")
    print(f"  有效热点: {len(hotspots)} 条")
    print(f"  避雷清单: {len(avoid_list)} 条")
    print(f"  JSON: {json_path}")
    print(f"  日报: {md_path}")


if __name__ == "__main__":
    main()
