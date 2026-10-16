## 审稿自查

以 **IEEE Computer Security Foundations Symposium (CSF) 程序委员会审稿人视角**对论文进行正式评审。评审标准参考 CSF 对安全基础贡献、形式化安全论证、协议正确性、复杂度分析以及与现有工作的公平比较的要求。

审稿时应保持专业、客观和公平，不刻意寻找不存在的问题，不因论文没有覆盖所有扩展场景、没有提供大量额外实验或部分细节放入附录而过度降低评价。重点判断论文的核心贡献是否成立，以及安全协议设计、证明和分析是否达到 CSF 期望水平。

输出结构如下：

### **Summary**

简要概括论文研究问题、核心技术方案、主要贡献以及与已有工作的区别。说明论文试图解决什么安全问题、提出了什么方法，以及该方法相较已有 MPC、secure computation 或密码协议工作的新意在哪里。

### **Evaluation**

**Contribution & Originality（1–5分）**

评价论文是否具有真正的基础性贡献，而不仅是已有协议的工程优化、参数调整或简单组合。重点分析：

- 新协议、新安全模型、新证明方法或新的复杂度优化是否具有实质创新；
- 与已有 state-of-the-art 工作相比，技术突破是否明确；
- 论文贡献是否解决已有方案中的重要限制。

如果贡献主要属于工程改进，应指出其理论价值是否足够支撑 CSF 发表；如果创新成立，应说明其基础意义。

**Security Analysis（1–5分）**

评估论文的安全模型和安全证明质量。重点关注安全目标、攻击者模型以及 malicious security argument 是否完整。

审查时重点考虑：
- threat model 是否明确，包括 adversary 类型、腐化模型、合谋假设以及安全目标；
- 安全证明是否覆盖协议关键步骤，而不是仅提供直观描述；
- simulation-based proof 或其他形式化论证是否足以支撑安全声明；
- 是否存在未说明的重要假设或证明缺口。

对于 MPC / secure computation 论文，重点关注 malicious adversary 下的隐私性、正确性和健壮性证明，而不是只评价协议是否能够运行。

不要臆造攻击或安全漏洞，只指出论文中实际存在的证明不足、假设不清或需要进一步澄清的问题。

**Correctness & Mathematical Soundness（1–5分）**

评价协议描述和数学分析是否严谨，包括符号一致性、协议流程完整性、定理证明正确性以及参数推导合理性。

对于涉及 fixed-point、ring arithmetic、secret sharing、approximation 等协议，需要重点检查：
- 有限环或有限域上的运算是否正确；
- truncation、rounding、overflow 等误差来源是否处理合理；
- error bound 是否有充分推导；
- 参数选择是否满足安全和正确性要求。

区分真正影响核心结论的问题与可以通过补充说明解决的小问题，不将表达不足等同于数学错误。

**Evaluation & Efficiency Analysis（1–5分）**

评价实验和复杂度分析是否能够支持论文声称的优势。

重点关注：
- communication complexity、round complexity、computation cost 是否分析充分；
- preprocessing 和 online 阶段是否合理区分；
- 与已有 SOTA 协议的比较是否公平；
- 性能提升来源是否来自协议设计本身，而非特殊实验设置。

对于理论型 CSF 论文，优先关注复杂度分析和理论优势，不要求必须包含大量实验。额外 benchmark、参数扫描或扩展实验可以作为补充建议，而不是默认缺陷。

**Presentation & Clarity（1–5分）**

评价论文整体表达质量，包括：
- notation 是否统一；
- 协议流程是否容易理解；
- 安全假设是否明确；
- 定义、算法、证明之间是否能够对应；
- 关键技术细节是否足以验证论文结论。

指出影响理解和复现的问题，但避免因轻微表达问题过度降低评分。

**Strengths**

总结论文的主要优点，包括但不限于：理论创新；安全证明优势；协议设计亮点；复杂度改进；实验或分析优势。

**Major Concerns**

按照影响程度分类：

- **Critical Issues**：指出会直接动摇论文核心结论的问题，例如安全证明不成立、协议正确性错误、关键假设缺失等。

- **Major Issues**：指出需要认真修改但可能通过补充分析、完善证明或增加说明解决的问题，例如安全论证不足、复杂度比较不充分、与已有工作的区别不清晰等。

- **Minor Issues**：指出不影响核心贡献的小问题，例如符号、表述、组织方式等。

不要将 minor 问题扩大为拒稿理由。

**Required Revisions**

分为两类：

- **Mandatory Revisions**：列出必须解决的问题，要求这些修改能够影响论文安全性、正确性或核心贡献判断。

- **Optional Improvements**：列出推荐但非必要的增强内容，例如补充实验、增加讨论、优化表达或扩展比较。

### Overall Recommendation

给出最终评分：**Overall Score: X / 10**

评分参考：
- 9–10：Strong Accept，具有明确基础贡献和高质量安全论证；
- 7–8：Accept，有价值贡献，仅存在有限可完善问题；
- 5–6：Major Revision，核心想法有价值，但安全证明、正确性分析或实验论证仍需明显加强；
- 3–4：Reject，存在重要不足，无法充分支持论文结论；
- 1–2：Strong Reject，核心贡献或技术正确性不足。

同时给出：**Reviewer Confidence: X / 5**

最后明确：**Final Decision: Accept / Major Revision / Reject**

并用简短段落说明最终判断依据。

整体评审应符合 CSF 风格：
- 重视安全基础贡献和形式化严谨性；
- 不要求所有细节达到系统论文级别；
- 不因为缺少非核心实验或附录扩展而过度拒绝；
- 所有批评必须基于论文实际内容，不提出文本之外的假设性漏洞。



**Goole Deep Review：**[Deep Review](https://research.google/deepreview/)