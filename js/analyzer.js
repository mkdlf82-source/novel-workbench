// ===== 拆文分析引擎 =====
// 客户端文本分析：字数统计、题材识别、开篇提取、对话提取、情绪扫描、冲突检测、结构分析、拆文报告生成

// ===== 关键词词库 =====
const GENRE_KEYWORDS = {
  '婚内打脸': ['结婚','老公','老婆','妻子','丈夫','出轨','离婚','小三','婚姻','民政局','结婚证','婆家','娘家'],
  '婆媳家庭': ['婆婆','儿媳','媳妇','婆媳','公公','小叔子','大伯子','妯娌','孙子','孙女','退休金','养老金','房产'],
  '真假千金': ['千金','真假','豪门','亲生','认亲','调换','血脉','世家','嫡女','庶女','真小姐','假小姐'],
  '重生纠错': ['重生','上一世','前世','重来','回到','重新来过','前世记忆','上辈子','重来一次','重生回'],
  '校园恩怨': ['校园','同学','老师','学校','宿舍','考试','大学','高中','同学会','班主任','校园霸凌','高考'],
  '职场逆袭': ['职场','老板','上司','同事','公司','辞职','升职','项目','方案','汇报','领导','加班','部门'],
  '原生家庭': ['原生家庭','父母','家暴','偏心','扶弟魔','凤凰男','爸妈','弟弟','哥哥','姐姐','吸血','养老'],
  '微悬疑吃瓜': ['悬疑','谋杀','推理','秘密','真相','诡异','消失','尸体','案发现场','不在场证明','线索'],
  '都市猎奇': ['都市','猎奇','奇遇','都市传说','神秘','诡异','灵异','惊悚','都市怪谈','深夜'],
  '古风短虐': ['王爷','将军','公主','侯府','深宫','嫡','庶','皇帝','妃子','世子','郡主','侍郎','将军府','侯爷'],
};

const EMOTION_WORDS = {
  '愤怒': ['怒','气','愤','恨','怒火','愤怒','暴怒','气死','怒火中烧','咬牙切齿'],
  '委屈': ['委屈','心酸','酸楚','眼泪','哭','泪','难受','心痛','心寒','心如刀割'],
  '爽感': ['爽','痛快','解气','打脸','活该','报应','大快人心','痛快淋漓'],
  '拉扯': ['纠结','犹豫','矛盾','挣扎','左右为难','进退两难','心如乱麻'],
  '甜蜜': ['甜','心动','喜欢','爱','温柔','宠溺','幸福','暖','暖意'],
  '绝望': ['绝望','崩溃','窒息','无力','黑暗','深渊','万念俱灰'],
  '讽刺': ['讽刺','可笑','荒唐','滑稽','啼笑皆非','可悲'],
};

const CONFLICT_WORDS = ['吵','骂','打','闹','冲突','矛盾','争吵','对峙','撕','翻脸','质问','逼问','摊牌','揭穿','甩','砸','摔','拍桌'];

const HOOK_WORDS = ['？','？','？','。','突然','可是','没想到','然而','直到','那天','那天','那天','那一刻','从此','原来','其实','事实上','殊不知','谁知道','偏偏'];

// ===== 主分析函数 =====
function analyzeText(text) {
  if (!text || text.trim().length < 100) {
    return { error: '文本太短，请粘贴至少100字的短篇内容' };
  }

  // 1. 字数统计（中文字符）
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = text.length;
  const wordCount = chineseChars;

  // 2. 分节检测
  const sections = text.split(/\n\s*\n+/).filter(s => s.trim().length > 20);
  const sectionCount = sections.length > 0 ? sections.length : Math.ceil(wordCount / 1000);

  // 3. 题材识别
  let genre = '未识别';
  let genreScores = {};
  let maxScore = 0;
  for (const [g, keywords] of Object.entries(GENRE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      const matches = text.split(kw).length - 1;
      score += matches;
    }
    genreScores[g] = score;
    if (score > maxScore) { maxScore = score; genre = g; }
  }

  // 4. 开篇提取（前300字）
  const opening = text.substring(0, 300).trim();

  // 5. 结尾提取（最后300字）
  const ending = text.substring(Math.max(0, text.length - 300)).trim();

  // 6. 对话提取
  const dialoguePattern = /[""'']([^""'']{5,80})[""'']/g;
  const dialogues = [];
  let match;
  while ((match = dialoguePattern.exec(text)) !== null && dialogues.length < 10) {
    dialogues.push(match[1].trim());
  }
  // 中文引号也匹配
  const dialoguePattern2 = /\u201c([^\u201d]{5,80})\u201d/g;
  while ((match = dialoguePattern2.exec(text)) !== null && dialogues.length < 10) {
    dialogues.push(match[1].trim());
  }

  // 7. 情绪关键词扫描
  const emotions = {};
  for (const [emo, words] of Object.entries(EMOTION_WORDS)) {
    let count = 0;
    for (const w of words) {
      count += (text.split(w).length - 1);
    }
    if (count > 0) emotions[emo] = count;
  }
  // 按频次排序
  const sortedEmotions = Object.entries(emotions).sort((a, b) => b[1] - a[1]);

  // 8. 冲突关键词检测
  let conflictCount = 0;
  const conflictMatches = [];
  for (const kw of CONFLICT_WORDS) {
    const c = text.split(kw).length - 1;
    if (c > 0) { conflictCount += c; conflictMatches.push(kw + '(' + c + '次)'); }
  }

  // 9. 角色提取（通过"XX说/道/笑/怒"模式）
  const namePattern = /([\u4e00-\u9fa5]{2,3})(?:说|道|笑|哭|怒道|冷笑|冷声道|叹道|问道|喊道|低声说|大声说)/g;
  const charSet = new Set();
  while ((match = namePattern.exec(text)) !== null) {
    charSet.add(match[1]);
  }
  const characters = [...charSet].slice(0, 8);

  // 10. 结构分析
  const structureAnalysis = analyzeStructure(text, sections, wordCount);

  // 11. 生成拆文报告
  const report = generateReport({
    text, wordCount, totalChars, sectionCount, genre, genreScores,
    opening, ending, dialogues, emotions: sortedEmotions,
    conflictCount, conflictMatches, characters, structureAnalysis
  });

  // 12. 生成仿写公式
  const formula = generateFormula(genre, emotions, opening, ending);

  // 13. 生成改写方案
  const rewritePlan = generateRewritePlan(genre, wordCount, characters, emotions);

  // 14. 自动入库数据（对应模块1-10）
  const moduleData = generateModuleData({
    genre, wordCount, sectionCount, opening, ending,
    dialogues, emotions, conflictCount, characters, formula, rewritePlan
  });

  return {
    wordCount, totalChars, sectionCount, genre, genreScores,
    opening, ending, dialogues, emotions: sortedEmotions,
    conflictCount, conflictMatches, characters, structureAnalysis,
    report, formula, rewritePlan, moduleData
  };
}

// ===== 结构分析 =====
function analyzeStructure(text, sections, wordCount) {
  const result = {
    type: '',
    ratio: '',
    rhythm: '',
    foreshadow: '',
    reversal: '',
    emotionCurve: '',
  };

  // 判断结构类型
  if (wordCount < 5000) {
    result.type = '短篇紧凑型（5000字以下）';
  } else if (wordCount <= 8000) {
    result.type = '标准短篇（5000-8000字）';
  } else if (wordCount <= 12000) {
    result.type = '万字标准型（8000-12000字）';
  } else {
    result.type = '中长篇（12000字以上）';
  }

  // 三幕比例
  const act1 = Math.ceil(wordCount * 0.2);
  const act2 = Math.ceil(wordCount * 0.6);
  const act3 = wordCount - act1 - act2;
  result.ratio = '第一幕（建置约' + act1 + '字，' + Math.round(act1/wordCount*100) + '%）→ 第二幕（对抗约' + act2 + '字，' + Math.round(act2/wordCount*100) + '%）→ 第三幕（结局约' + act3 + '字，' + Math.round(act3/wordCount*100) + '%）';

  // 分节节奏
  const sec = sections.length > 0 ? sections.length : Math.ceil(wordCount / 1000);
  result.rhythm = '共' + sec + '节，平均每节约' + Math.round(wordCount/sec) + '字。每节应包含1个独立冲突+节末悬念钩子。';

  // 反转频次建议
  const bigReversals = Math.max(2, Math.floor(sec / 4));
  const smallReversals = Math.floor(sec / 2);
  result.reversal = '建议大反转' + bigReversals + '次（第' + Math.floor(sec*0.5) + '节左右中转，第' + Math.floor(sec*0.8) + '节终转），小反转每2-3节1次，共约' + smallReversals + '次。';

  // 情绪曲线
  result.emotionCurve = '憋屈（1-' + Math.floor(sec*0.25) + '节）→ 拉扯（' + Math.floor(sec*0.25+1) + '-' + Math.floor(sec*0.5) + '节）→ 爆发（' + Math.floor(sec*0.5+1) + '-' + Math.floor(sec*0.7) + '节）→ 打脸（' + Math.floor(sec*0.7+1) + '-' + Math.floor(sec*0.9) + '节）→ 收尾（' + Math.floor(sec*0.9+1) + '-' + sec + '节）';

  // 伏笔建议
  result.foreshadow = '前' + Math.floor(sec*0.25) + '节埋3条伏笔线，中段暗收1条，高潮集中回收2条。伏笔回收密度：每2节至少收1条。';

  return result;
}

// ===== 生成拆文报告 =====
function generateReport(data) {
  const { wordCount, sectionCount, genre, opening, ending, dialogues, emotions, conflictCount, conflictMatches, characters, structureAnalysis } = data;

  // 核心大梗
  const mainPlot = extractMainPlot(opening, genre, emotions);
  // 辅助小梗
  const subPlots = extractSubPlots(dialogues, emotions, conflictMatches);

  // 主线冲突
  const mainConflict = extractMainConflict(emotions, conflictCount, characters);

  // 钩子分布
  const hooks = extractHooks(opening, ending, sectionCount);

  // 高能爽虐点
  const climax = extractClimax(emotions, dialogues, conflictCount);

  // 节奏评价
  const rhythmReview = evaluateRhythm(wordCount, sectionCount, emotions, conflictCount);

  // 逻辑漏洞
  const logicHoles = detectLogicHoles(characters, wordCount, sectionCount);

  // 爆火归因
  const viralReason = analyzeViralReason(genre, emotions, opening, conflictCount);

  // 对标仿写方案
  const adaptPlan = generateAdaptPlan(genre, mainPlot, characters);

  // 改写思路
  const rewrite = generateRewriteIdea(genre, mainConflict);

  let report = '';
  report += '═══════════════════════════\n';
  report += '     拆 文 报 告\n';
  report += '═══════════════════════════\n\n';

  report += '【基础数据】\n';
  report += '字数：' + wordCount + '字 | 分节：' + sectionCount + '节 | 题材：' + genre + '\n';
  if (characters.length > 0) report += '主要角色：' + characters.join('、') + '\n';
  report += '冲突关键词命中：' + conflictCount + '次\n';
  if (conflictMatches.length > 0) report += '冲突词分布：' + conflictMatches.join('、') + '\n';
  report += '\n';

  report += '【情绪分析】\n';
  if (emotions.length > 0) {
    emotions.forEach(([emo, count]) => {
      report += emo + '(' + count + '次)  ';
    });
    report += '\n';
    const topEmo = emotions[0][0];
    report += '主导情绪：' + topEmo + '\n';
  } else {
    report += '未检测到明显情绪关键词\n';
  }
  report += '\n';

  report += '【核心大梗+辅助小梗】\n';
  report += '大梗：' + mainPlot + '\n\n';
  report += '小梗：\n' + subPlots + '\n\n';

  report += '【主线冲突】\n';
  report += mainConflict + '\n\n';

  report += '【钩子分布】\n';
  report += hooks + '\n\n';

  report += '【高能爽虐点】\n';
  report += climax + '\n\n';

  report += '【节奏优缺点】\n';
  report += rhythmReview + '\n\n';

  report += '【逻辑漏洞/待注意点】\n';
  report += logicHoles + '\n\n';

  report += '【爆火归因】\n';
  report += viralReason + '\n\n';

  report += '【对标仿写方案】\n';
  report += adaptPlan + '\n\n';

  report += '【换汤不换药改写思路】\n';
  report += rewrite + '\n\n';

  report += '【结构分析】\n';
  report += '结构类型：' + structureAnalysis.type + '\n';
  report += '字数配比：' + structureAnalysis.ratio + '\n';
  report += '节奏规范：' + structureAnalysis.rhythm + '\n';
  report += '反转频次：' + structureAnalysis.reversal + '\n';
  report += '伏笔建议：' + structureAnalysis.foreshadow + '\n';
  report += '情绪曲线：' + structureAnalysis.emotionCurve + '\n\n';

  report += '【开篇原文（前300字）】\n';
  report += opening.substring(0, 200) + '...\n\n';

  if (dialogues.length > 0) {
    report += '【提取的典型对话（前5条）】\n';
    dialogues.slice(0, 5).forEach((d, i) => {
      report += (i+1) + '. "' + d + '"\n';
    });
    report += '\n';
  }

  report += '═══════════════════════════\n';
  report += '报告生成时间：' + new Date().toLocaleString('zh-CN') + '\n';
  report += '═══════════════════════════\n';

  return report;
}

// ===== 辅助提取函数 =====
function extractMainPlot(opening, genre, emotions) {
  const topEmo = emotions.length > 0 ? emotions[0][0] : '冲突';
  const plots = {
    '婚内打脸': '婚姻背叛→证据收集→当众揭穿→打脸收场',
    '婆媳家庭': '偏心控制→隐忍积累→证据出现→当众对峙→打脸',
    '真假千金': '身份错位→真相浮现→认亲反转→地位回归',
    '重生纠错': '前世记忆→关键节点→反向操作→步步拆局→终极打脸',
    '校园恩怨': '校园矛盾→隐忍→证据→当众揭穿→逆袭',
    '职场逆袭': '职场打压→收集证据→关键时刻→当众反击→升职',
    '原生家庭': '家庭偏心→吸血压榨→觉醒反击→经济独立→断舍离',
    '微悬疑吃瓜': '悬念设置→线索铺排→反转推理→真相大白',
    '都市猎奇': '奇遇发生→深入调查→反转→真相揭晓',
    '古风短虐': '身份困境→虐心拉扯→真相反转→结局收束',
  };
  return plots[genre] || '核心矛盾→情绪积累→证据出现→当众打脸→收尾';
}

function extractSubPlots(dialogues, emotions, conflictMatches) {
  let result = '';
  if (dialogues.length >= 2) {
    result += '1. 对话冲突线：通过"' + dialogues[0].substring(0, 20) + '..."等对话推动矛盾升级\n';
  }
  if (emotions.length >= 2) {
    result += '2. 情绪拉扯线：' + emotions[0][0] + '与' + emotions[1][0] + '交织，制造情绪张力\n';
  }
  if (conflictMatches.length >= 3) {
    result += '3. 冲突升级线：' + conflictMatches.slice(0, 3).join('→') + '，逐层加码\n';
  }
  if (!result) result = '未检测到明显辅助小梗，建议补充情绪拉扯和对话冲突线';
  return result;
}

function extractMainConflict(emotions, conflictCount, characters) {
  const topEmo = emotions.length > 0 ? emotions[0][0] : '矛盾';
  let result = '核心矛盾：' + topEmo + '驱动的对抗关系';
  if (characters.length >= 2) {
    result += '（' + characters[0] + ' vs ' + characters[1] + '）';
  }
  if (conflictCount > 10) result += '，冲突密度高（' + conflictCount + '次冲突关键词）';
  else if (conflictCount > 5) result += '，冲突密度中等（' + conflictCount + '次）';
  else result += '，冲突密度偏低（' + conflictCount + '次），建议增加冲突场景';
  return result;
}

function extractHooks(opening, ending, sectionCount) {
  let result = '';
  if (opening.length > 0) {
    result += '开篇钩：前50字设置信息差/悬念\n';
  }
  result += '节末钩：每' + Math.max(1, Math.floor(sectionCount/3)) + '节应有1个节末悬念\n';
  if (ending.length > 0) {
    result += '结尾钩：' + (ending.includes('？') ? '留白悬念' : '情绪收束') + '\n';
  }
  return result;
}

function extractClimax(emotions, dialogues, conflictCount) {
  const topEmo = emotions.length > 0 ? emotions[0][0] : '冲突';
  let result = '爽点：';
  if (topEmo === '爽感') result += '当众打脸/揭穿的爽感高潮\n';
  else if (topEmo === '愤怒') result += '情绪爆发后的反击打脸\n';
  else result += '冲突升级到顶点后的反转打脸\n';

  result += '虐点：';
  if (emotions.some(e => e[0] === '委屈')) result += '隐忍委屈的情绪低谷\n';
  else if (emotions.some(e => e[0] === '绝望')) result += '绝望窒息的至暗时刻\n';
  else result += '被打压/误解的情绪拉扯\n';

  if (dialogues.length > 0) {
    result += '高能对话："' + dialogues[0].substring(0, 30) + '..."\n';
  }
  return result;
}

function evaluateRhythm(wordCount, sectionCount, emotions, conflictCount) {
  let pros = '', cons = '';
  const avgSec = wordCount / Math.max(sectionCount, 1);

  if (avgSec < 800) pros += '节奏紧凑，每节字数控制得当\n';
  else if (avgSec > 1500) cons += '每节过长，可能拖沓\n';
  else pros += '每节字数适中\n';

  if (conflictCount > sectionCount * 1.5) pros += '冲突密度高，读者持续紧张\n';
  else cons += '冲突密度偏低，需要增加冲突节点\n';

  if (emotions.length >= 3) pros += '情绪层次丰富（' + emotions.map(e => e[0]).join('/') + '）\n';
  else cons += '情绪层次单一，建议增加情绪变化\n';

  if (wordCount < 5000) cons += '篇幅偏短，建议扩充到8000字以上\n';
  else if (wordCount > 12000) cons += '篇幅偏长，短篇建议控制在12000字以内\n';
  else pros += '篇幅符合万字短篇标准\n';

  let result = '优点：\n' + (pros || '无明显优点\n');
  result += '\n缺点/不足：\n' + (cons || '暂无明显不足\n');
  return result;
}

function detectLogicHoles(characters, wordCount, sectionCount) {
  let result = '';
  if (characters.length > 5) result += '1. 角色过多（' + characters.length + '个），万字短篇建议控制在4-5个主要角色内\n';
  if (sectionCount > 15) result += '2. 分节过多（' + sectionCount + '节），可能导致每节内容碎片化\n';
  if (sectionCount < 3 && wordCount > 5000) result += '3. 分节过少，长文不分节影响阅读体验\n';
  if (!result) result = '暂未检测到明显逻辑漏洞';
  return result;
}

function analyzeViralReason(genre, emotions, opening, conflictCount) {
  let result = '';
  result += '1. 题材选择：' + genre + '属于流量赛道，自带受众基础\n';
  if (emotions.length > 0) {
    result += '2. 情绪命中：' + emotions[0][0] + '是高频共鸣情绪，容易引发读者代入\n';
  }
  if (opening.length > 0) {
    result += '3. 开篇吸引力：前300字' + (opening.includes('？') || opening.includes('？') ? '设置了疑问钩子' : '有信息差设置') + '\n';
  }
  if (conflictCount > 10) result += '4. 冲突密度：高频冲突（' + conflictCount + '次）维持阅读紧张感\n';
  result += '5. 平台适配：符合知乎/番茄/小程序的快节奏、高情绪要求\n';
  return result;
}

function generateAdaptPlan(genre, mainPlot, characters) {
  return '对标仿写方案：\n1. 保留核心骨架：' + mainPlot + '\n2. 换设定：保持' + genre + '赛道，更换具体冲突场景\n' +
    (characters.length > 0 ? '3. 换人物：' + characters[0] + '可换为不同身份设定\n' : '3. 换人物关系和身份设定\n') +
    '4. 换情绪切入点：保持核心情绪，调整进入角度\n5. 保留节奏框架：每节冲突+钩子的结构不变';
}

function generateRewriteIdea(genre, mainConflict) {
  const altGenres = ['婚内打脸','婆媳家庭','职场逆袭','原生家庭'].filter(g => g !== genre);
  return '换汤不换药改写：\n1. 核心冲突不变：' + mainConflict.substring(0, 50) + '\n' +
    '2. 换赛道方向：' + genre + '→' + altGenres.slice(0, 2).join('/') + '\n' +
    '3. 换场景：家庭场景↔职场场景↔社交场景互换\n4. 换人物关系：婆媳↔同事↔邻居↔朋友\n5. 保留情绪曲线和打脸结构';
}

// ===== 生成仿写公式 =====
function generateFormula(genre, emotions, opening, ending) {
  const topEmo = emotions.length > 0 ? emotions[0][0] : '冲突';
  let formula = '';

  formula += '【' + genre + '赛道·仿写公式】\n\n';

  // 开篇公式
  formula += '开篇公式（300字）：\n';
  if (opening.includes('？') || opening.includes('？')) {
    formula += '提问式钩子→补充悬念→抛出矛盾核心→设置留人悬念\n';
  } else {
    formula += '冲突场景切入→情绪冲击→信息差设置→悬念留人\n';
  }

  // 中段公式
  formula += '\n中段公式：\n';
  formula += '隐忍积累（' + topEmo + '铺垫）→ 小反转 → 证据收集 → 拉扯升级 → 大反转预告\n';

  // 高潮公式
  formula += '\n高潮公式：\n';
  formula += '当众对峙 → 亮出底牌 → 打脸 → 反应描写 → 情绪峰值\n';

  // 收尾公式
  formula += '\n收尾公式：\n';
  if (ending.includes('？')) {
    formula += '留白式收束 → 一句话点题 → 意犹未尽\n';
  } else {
    formula += '金句收口 → 余韵留白 → 情感收束\n';
  }

  formula += '\n情绪曲线：憋屈→拉扯→爆发→打脸→收尾\n';
  formula += '适用平台：知乎/番茄/小程序（需根据平台微调节奏）\n';

  return formula;
}

// ===== 生成改写方案 =====
function generateRewritePlan(genre, wordCount, characters, emotions) {
  const altTracks = ['婚内打脸','婆媳家庭','真假千金','重生纠错','校园恩怨','职场逆袭','原生家庭'].filter(g => g !== genre);
  const topEmo = emotions.length > 0 ? emotions[0][0] : '冲突';

  let plan = '';
  plan += '【改写方案·基于拆文结果】\n\n';
  plan += '方案A：同赛道换设定\n';
  plan += '赛道：' + genre + '\n';
  plan += '换设定：保持"' + topEmo + '驱动"的核心，换具体冲突场景\n';
  plan += '字数目标：' + (wordCount < 8000 ? '8000-10000字' : '8000-12000字') + '\n\n';

  plan += '方案B：跨赛道换汤\n';
  plan += '原赛道：' + genre + ' → 换到：' + altTracks[0] + '或' + (altTracks[1] || altTracks[0]) + '\n';
  plan += '核心保留：隐忍→证据→当众打脸的骨架\n';
  plan += '场景替换：家庭场景→职场/社交场景\n';
  if (characters.length > 0) {
    plan += '人物替换：' + characters[0] + '→对应赛道的角色设定\n';
  }
  plan += '\n';

  plan += '方案C：情绪角度换切\n';
  plan += '原情绪：' + topEmo + ' → 换到：';
  const altEmos = ['愤怒','委屈','爽感','拉扯'].filter(e => e !== topEmo);
  plan += altEmos.slice(0, 2).join('/') + '\n';
  plan += '换法：同一个事件，从不同情绪角度切入，产生不同阅读体验\n';

  return plan;
}

// ===== 生成各模块入库数据 =====
function generateModuleData(data) {
  const { genre, wordCount, sectionCount, opening, ending, dialogues, emotions, conflictCount, characters, formula, rewritePlan } = data;
  const topEmo = emotions.length > 0 ? emotions[0][0] : '冲突';
  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  // 模块1：作品入库
  const archive = {
    title: '（拆文入库·待命名）',
    platform: '',
    genre: genre !== '未识别' ? genre : '',
    wordCount: wordCount,
    sectionCount: sectionCount,
    corePlot: extractMainPlot(opening, genre, emotions),
    performance: '（待补充数据表现）',
    adaptScene: '基于拆文分析，适合' + genre + '赛道仿写',
  };

  // 模块2：开篇钩子
  const openingHook = {
    type: opening.includes('？') || opening.includes('？') ? '知乎提问式' : '番茄冲突式',
    title: '拆文提取·' + genre + '赛道开篇',
    formula300: '开篇公式：冲突场景切入→情绪冲击→信息差→悬念留人。原文前300字已提取。',
    hookTemplate: opening.substring(0, 100),
    prosCons: '优点：开篇节奏快，情绪前置；缺点：需根据具体平台调整',
    avoidList: '1.开篇不宜超过300字才出钩子 2.前50字不宜出现太多人物 3.钩子要与后文反转关联',
  };

  // 模块3：赛道选题（如果题材已识别）
  const topic = genre !== '未识别' ? {
    track: genre,
    title: '拆文提取·' + genre + '赛道选题',
    formula: formula.split('\n').slice(0, 3).join('\n'),
    conflictTpl: '核心冲突：' + topEmo + '驱动的对抗关系',
    plots: '隐忍积累→证据出现→当众打脸→收尾',
    ideas: '基于此赛道可拓展的选题方向',
    painPoints: '受众痛点：' + topEmo + '情绪共鸣；爽点：当众打脸',
  } : null;

  // 模块4：人设（如果有角色）
  const character = characters.length > 0 ? {
    type: '功能性配角',
    name: '拆文提取·' + characters[0] + '人设',
    surface: '外在表现（基于原文提取）',
    deep: '内在驱动：' + topEmo + '情绪驱动',
    contrast: '表里反差设计',
    entrance: '出场方式：通过对话/冲突场景出场',
    function: '叙事功能：推动' + topEmo + '情绪发展',
    avoidPoints: '避免脸谱化，需有逻辑支撑',
  } : null;

  // 模块5：剧情结构
  const structure = {
    title: '拆文提取·' + wordCount + '字结构框架',
    structureType: wordCount <= 5000 ? '线性递进' : '三幕式',
    wordRange: wordCount + '字',
    ratio: '第一幕20%→第二幕60%→第三幕20%',
    rhythm: '每节：独立冲突+节末悬念',
    foreshadow: '前1/4埋伏笔，中段暗收，高潮集中回收',
    reversal: '大反转2次，小反转每2-3节1次',
    emotionCurve: '憋屈→拉扯→爆发→打脸→收尾',
  };

  // 模块6：拆文复盘（完整报告）
  const analysis = {
    title: '拆文入库·' + dateStr,
    platform: '',
    genre: genre !== '未识别' ? genre : '',
    mainPlot: extractMainPlot(opening, genre, emotions),
    conflict: extractMainConflict(emotions, conflictCount, characters),
    hooks: extractHooks(opening, ending, sectionCount),
    climax: extractClimax(emotions, dialogues, conflictCount),
    rhythmReview: evaluateRhythm(wordCount, sectionCount, emotions, conflictCount),
    logicHoles: detectLogicHoles(characters, wordCount, sectionCount),
    viralReason: analyzeViralReason(genre, emotions, opening, conflictCount),
    adaptPlan: generateAdaptPlan(genre, extractMainPlot(opening, genre, emotions), characters),
    rewrite: generateRewriteIdea(genre, extractMainConflict(emotions, conflictCount, characters)),
  };

  // 模块7：金句（如果有对话）
  const quotes = dialogues.length > 0 ? {
    category: '对峙打脸对话',
    content: '"' + dialogues[0] + '"',
    scene: '拆文提取·' + genre + '赛道',
    tags: [genre, topEmo, '拆文提取'],
    notes: '从原文提取的典型对话，可改写使用',
  } : null;

  // 模块8：结局模板
  const endingTpl = {
    type: ending.includes('？') ? '遗憾留白结局' : '爽文打脸结局',
    title: '拆文提取·结局模板',
    template: '最后2节：冲突收束→情绪峰值→金句收口',
    fastEnd: '最后800字：1段过渡→1段收束→1句金句',
    avoidList: '1.不要拖太长 2.不要开新坑 3.要有情绪余韵',
    callback: '回收前文伏笔，形成闭环',
  };

  // 模块9：合规（通用）
  const compliance = {
    platform: '通用',
    title: '拆文提取·合规自查',
    redLines: '1.不攻击特定群体 2.不涉及真实事件 3.不渲染极端暴力',
    taboo: '敏感剧情需谨慎处理',
    limitTraps: '标题太极端/开头负能量会限流',
    retention: '开篇300字有钩子→每节末留悬念→善用短句',
    checklist: '□标题不极端 □开篇有钩子 □无敏感内容 □每节有悬念 □结尾有收束',
    caseStudy: '（待补充）',
  };

  // 模块10：冲突素材
  const conflict = {
    type: '情绪拉扯片段',
    title: '拆文提取·' + topEmo + '情绪拉扯',
    content: '基于原文的' + topEmo + '情绪拉扯片段，冲突密度' + conflictCount + '次',
    scene: genre + '赛道·情绪拉扯节点',
    tags: [genre, topEmo, '拆文提取'],
    notes: '可变形使用，换不同场景说出类似情绪',
  };

  return {
    archive, openings: openingHook, topics: topic,
    characters: character, structure, analysis,
    quotes, endings: endingTpl, compliance, conflicts: conflict,
    // 附带仿写公式和改写方案
    _formula: formula,
    _rewritePlan: rewritePlan,
  };
}
