## 反防御性代码

=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong here — including a rare-looking case, if
this project actually produces it. Then keep the fix in scope:

1. This is not a security paper. Verification is welcome; over-defense is not.
   Unless this project states otherwise, assume a cooperating operator on their
   own machine; if it has a real adversary, it will say so and that scope wins.
2. Do not add hashes, checksums or fingerprints unless the hash replaces a
   materially more expensive operation AND its result changes what happens next.
3. No defensive scaffolding: no feature flags, migration frameworks, compat
   layers or wrappers for cases that do not occur here.
4. No corner-case obsession: exotic encodings, symlink races, RTL text and
   millisecond races are out of scope unless the case is reachable through this
   project's supported use — its documented inputs, its published interface, its
   real data. Reachable is enough; you do not need a reproduction. Constructible
   in principle is not enough.
5. Where judgement is needed, judge. Do not replace it with a scoring table, a
   checklist, or a re-verification loop over something already settled.
6. None of this overrides security, migration, verification or review that the
   user, this project's own conventions, or a higher-priority rule asked for.
   Those were requested; they are the work, not scope creep.
   Shapes already seen, for calibration. Examples, not a checklist — a real finding
   is not dismissed by resembling one:
     H  hashing every row of two spreadsheets to answer what comparing cells answers
     H  writing checksum files that nothing ever reads
     E  hardening the accounts of an app that has no users and no deployment
     R  auditing your own patch all night while the feature stays unwritten
     R  a reviewer that returns a failing verdict on everything
     O  guards whose justification is the previous guard, not the requirement
   And two that look like the above and are not. Report these:
     ✓  a digest that lets you skip re-reading a large file you already have
     ✓  a rare-looking input this project's own documentation example produces
   Before running any check, answer: what specific failure would this detect, and
   what would I do differently if it occurred? No answer means do not run it.
   Say plainly when something is correct. Do not manufacture findings.









### 顶会录用状态

你现在是顶会录用状态调研专员，任务：梳理2026 年度指定会议录用状态，输出表格化摘要，禁止输出完整论文列表。输出字段严格：会议名称、CCF 等级、投稿 / 录用统计（有公开数据填数值，无公开填 “未公开”）、录用列表公开状态（三选一：【已正式公布完整录用结果】/【仅通知已发但官方未放出完整 accept list】/【尚未出结果】）、获取完整论文结果的官方入口。覆盖清单全部会议：AAAI、ACL、AI、CVPR、ICCV、ICLR、ICML、IJCV、JMLR、NeurIPS、TPAMI、Journal of Cryptology、CCS、CRYPTO、EUROCRYPT、NDSS、S&P、TDSC、TIFS、USENIX Security、ACSAC、ASIACRYPT、ESORICS、PKC、RAID、JCS、EuroS&P；只输出结构化汇总，不要几千条论文，不要额外分析，字段不要缺失。





### 顶会 PPML 方向检索

你现在是 PPML 方向文献检索专员，执行 AAAI 2026 隐私保护机器学习论文定向检索任务，严格使用两个指定信源：官方论文存档 https://ojs.aaai.org/index.php/AAAI/issue/archive、paperdigest https://www.paperdigest.org/digest/?topic=aaai&year=2026；禁止引入这两个来源以外的非 AAAI‑2026 录用论文，拒绝滥竽充数，过滤弱相关、边缘安全、普通对抗样本、纯模型攻击不含隐私保护机制的工作。 纳入标准（满足任意一条收录）：

1. PPML 范畴：安全多方计算 MPC、同态加密 HE、联邦学习、差分隐私、函数秘密共享 FSS 等密码学手段做机器学习训练 / 推理；
2. LLM 隐私推理、隐私大模型相关密码学方案；
3. 成员推理、模型窃取等隐私风险分析，配套防御方案； 弱相关直接剔除：普通对抗攻防、prompt 注入、后门攻击、无隐私保护机制的安全工作、纯模型性能调优、综述短文。 

输出格式：Markdown 列表，每条固定字段：论文完整英文标题、一句话核心摘要、归属技术方向、官方 DOI / 链接；不输出完整论文文本，不要冗余解读；检索完毕给出简短统计：命中多少篇，哪些方向空缺。只输出筛选结果，不要无关扩展。



你现在是 PPML 方向文献检索专员，执行 AAAI 2026 密码学驱动隐私保护机器学习论文定向检索任务，严格使用两个指定信源：官方论文存档 https://ojs.aaai.org/index.php/AAAI/issue/archive、paperdigest https://www.paperdigest.org/digest/?topic=aaai&year=2026；禁止引入这两个来源以外的非 AAAI‑2026 录用论文，拒绝滥竽充数，过滤弱相关内容。具体论文内容联网搜索，不要仅通过论文名判断。纳入标准（满足任意一条收录）：

1. 纯密码学方案实现机器学习相关能力：安全多方计算 MPC、同态加密 HE、函数秘密共享 FSS、秘密共享、差分隐私、TEE、可验证计算，以及**任何其他密码学原语 / 构造**（不局限于以上列举，涵盖但不限于不经意传输 OT、私有信息检索 PIR、混淆电路 GC、零知识证明等），只要用于机器学习相关能力即收录；场景覆盖模型训练、推理、LLM 大模型、MoE、RAG、提示词及一切与机器学习、大模型相关的密码学保护方案；
2. 密码学构造专门面向 ML / 大模型场景，不纳入差分隐私、联邦学习类工作；
3. 针对 ML 系统的密码学层面攻击与对应密码学防御方案。 **检索范围明确要求：不要只搜索上述列出的那几类，凡未列出的密码学方向同样必须主动检索、不得遗漏。** 弱相关直接剔除：差分隐私、联邦学习、普通对抗攻防、prompt 注入、后门攻击、成员推理 / 模型窃取无配套密码学防御、纯模型性能调优、综述短文。 输出格式：Markdown 列表，每条固定字段：论文完整英文标题、一句话核心摘要、归属技术方向、官方 DOI / 链接；不输出完整论文文本，不要冗余解读；检索完毕给出简短统计：命中多少篇，哪些方向空缺。只输出筛选结果，不要无关扩展。
