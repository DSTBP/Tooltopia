"""
Reads `results/val_vs_scar_leakage_*.txt` produced by `experiments/compare_val_scar_leakage.py`
and plots:
  - Figure 1: Line plot with x=leakage rate, y=correct recovery rate (main axis)
              + recall/accuracy on secondary axis or subplot
              + 95% CI error bars from multiple runs

Usage:
  python plots/plot_leakage_comparison.py --input results/val_vs_scar_leakage_2025-12-15_xx.xx.xx.txt
  python plots/plot_leakage_comparison.py  # uses the latest results/val_vs_scar_leakage_*.txt
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import tempfile
from typing import Any, Dict, List, Optional

import numpy as np


# Color scheme for dual-dataset comparison
VAL_COLOR = "#74C4E3"      # Blue RGB(116, 196, 227)
SCAR_COLOR = "#EC8F8F"     # Pink RGB(236, 143, 143)

# 解析正则表达式
_HEADER_RE = re.compile(r"^Dataset=(?P<dataset>[^,]+),\s*Keywords=(?P<keywords>\d+)$")
_LEAKAGE_HEADER_RE = re.compile(r"^Leakage rates=\[(?P<rates>[^\]]+)\],\s*Runs=(?P<runs>\d+)$")
_MULTIPLIER_RE = re.compile(r"^Multiplier=(?P<multiplier>[\d.]+),\s*External blend weight=(?P<weight>[\d.]+)$")

# 每个 run 的详细数据行
# Run 1: VAL=38.30% (召回=100.00%, 准确=38.30%), SCAR=40.12% (召回=100.00%, 准确=40.12%)
# Also accepts VAL-K instead of SCAR
_RUN_LINE_RE = re.compile(
    r"^\s*Run\s+(?P<run>\d+):\s*"
    r"VAL=(?P<val_correct>[\d.]+)%\s*\(召回=(?P<val_recall>[\d.]+)%,\s*准确=(?P<val_acc>[\d.]+)%\),\s*"
    r"(?:SCAR|VAL-K)=(?P<scar_correct>[\d.]+)%\s*\(召回=(?P<scar_recall>[\d.]+)%,\s*准确=(?P<scar_acc>[\d.]+)%\)$"
)

# 泄露率标题行
_LEAKAGE_RATE_RE = re.compile(r"^Leakage Rate\s+(?P<rate>[\d.]+)%:$")

# 平均值行 (accepts both SCAR and VAL-K)
_AVG_LINE_RE = re.compile(
    r"^\s*平均:\s*VAL=(?P<val_avg>[\d.]+)%\s*\(±(?P<val_std>[\d.]+)%\),\s*"
    r"(?:SCAR|VAL-K)=(?P<scar_avg>[\d.]+)%\s*\(±(?P<scar_std>[\d.]+)%\)"
)


def _find_latest_result(pattern: str) -> str:
    candidates = glob.glob(pattern)
    if not candidates:
        raise FileNotFoundError(f"No result file found: pattern={pattern!r}")
    return max(candidates, key=os.path.getmtime)


def _parse_leakage_results(path: str) -> Dict[str, Any]:
    """
    解析泄露率对比实验结果文件。

    Returns:
        {
            "meta": {...},
            "by_leakage_rate": {
                rate: {
                    "runs": [
                        {"val_correct": ..., "val_recall": ..., "val_acc": ...,
                         "scar_correct": ..., "scar_recall": ..., "scar_acc": ...},
                        ...
                    ],
                    "val_avg": ..., "val_std": ...,
                    "scar_avg": ..., "scar_std": ...,
                }
            }
        }
    """
    result: Dict[str, Any] = {
        "meta": {"source": path},
        "by_leakage_rate": {},
    }

    current_leakage_rate: Optional[float] = None
    current_runs: List[Dict[str, float]] = []

    with open(path, "r", encoding="utf-8") as fh:
        for raw_line in fh:
            line = raw_line.strip()
            if not line:
                continue

            # 解析元数据
            if match := _HEADER_RE.match(line):
                result["meta"]["dataset"] = match.group("dataset")
                result["meta"]["keywords"] = int(match.group("keywords"))
                continue

            if match := _LEAKAGE_HEADER_RE.match(line):
                rates_str = match.group("rates")
                result["meta"]["leakage_rates"] = [float(r.strip()) for r in rates_str.split(",")]
                result["meta"]["runs"] = int(match.group("runs"))
                continue

            if match := _MULTIPLIER_RE.match(line):
                result["meta"]["multiplier"] = float(match.group("multiplier"))
                result["meta"]["external_blend_weight"] = float(match.group("weight"))
                continue

            # 检测泄露率标题
            if match := _LEAKAGE_RATE_RE.match(line):
                # 保存上一个泄露率的数据
                if current_leakage_rate is not None and current_runs:
                    result["by_leakage_rate"][current_leakage_rate] = {
                        "runs": current_runs.copy(),
                    }
                current_leakage_rate = float(match.group("rate"))
                current_runs = []
                continue

            # 解析每个 run 的数据
            if match := _RUN_LINE_RE.match(line):
                if current_leakage_rate is not None:
                    current_runs.append({
                        "run": int(match.group("run")),
                        "val_correct": float(match.group("val_correct")),
                        "val_recall": float(match.group("val_recall")),
                        "val_acc": float(match.group("val_acc")),
                        "scar_correct": float(match.group("scar_correct")),
                        "scar_recall": float(match.group("scar_recall")),
                        "scar_acc": float(match.group("scar_acc")),
                    })
                continue

            # 解析平均值行
            if match := _AVG_LINE_RE.match(line):
                if current_leakage_rate is not None:
                    if current_leakage_rate not in result["by_leakage_rate"]:
                        result["by_leakage_rate"][current_leakage_rate] = {"runs": current_runs.copy()}
                    result["by_leakage_rate"][current_leakage_rate]["val_avg"] = float(match.group("val_avg"))
                    result["by_leakage_rate"][current_leakage_rate]["val_std"] = float(match.group("val_std"))
                    result["by_leakage_rate"][current_leakage_rate]["scar_avg"] = float(match.group("scar_avg"))
                    result["by_leakage_rate"][current_leakage_rate]["scar_std"] = float(match.group("scar_std"))
                continue

    # 保存最后一个泄露率的数据
    if current_leakage_rate is not None and current_runs:
        if current_leakage_rate not in result["by_leakage_rate"]:
            result["by_leakage_rate"][current_leakage_rate] = {"runs": current_runs.copy()}

    return result


def _compute_95ci(values: List[float]) -> float:
    """计算 95% 置信区间的半宽度。"""
    if len(values) < 2:
        return 0.0
    std = np.std(values, ddof=1)  # 样本标准差
    n = len(values)
    return 1.96 * std / np.sqrt(n)


def plot_leakage_comparison(
    *,
    meta: Dict[str, Any],  # noqa: ARG001 - kept for API compatibility
    by_leakage_rate: Dict[float, Dict[str, Any]],
    output_path: str,
    dpi: int = 150,
) -> None:
    """
    绘制泄露率对比折线图（图 1）。

    主图：恢复正确率 (VAL vs SCAR) + 95% CI 误差条
    """
    try:
        os.environ.setdefault(
            "MPLCONFIGDIR", os.path.join(tempfile.gettempdir(), "matplotlib")
        )
        os.makedirs(os.environ["MPLCONFIGDIR"], exist_ok=True)
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ModuleNotFoundError as exc:
        raise SystemExit("Missing dependency: matplotlib (e.g. `pip install matplotlib`)") from exc

    # 按泄露率排序
    leakage_rates = sorted(by_leakage_rate.keys())

    # 收集数据
    val_correct_means = []
    val_correct_cis = []
    scar_correct_means = []
    scar_correct_cis = []

    for rate in leakage_rates:
        data = by_leakage_rate[rate]
        runs = data.get("runs", [])

        if runs:
            # 从原始数据计算
            val_corrects = [r["val_correct"] for r in runs]
            scar_corrects = [r["scar_correct"] for r in runs]

            val_correct_means.append(np.mean(val_corrects))
            val_correct_cis.append(_compute_95ci(val_corrects))
            scar_correct_means.append(np.mean(scar_corrects))
            scar_correct_cis.append(_compute_95ci(scar_corrects))
        else:
            # 使用预计算的平均值（无 CI）
            val_correct_means.append(data.get("val_avg", 0))
            val_correct_cis.append(0)
            scar_correct_means.append(data.get("scar_avg", 0))
            scar_correct_cis.append(0)

    # 创建图形
    fig, ax1 = plt.subplots(figsize=(12, 7))

    # ========== 主图：恢复正确率 ==========
    # VAL 曲线
    ax1.errorbar(
        leakage_rates, val_correct_means, yerr=val_correct_cis,
        marker="o", markersize=8, capsize=5, capthick=2,
        color="#4c72b0", linewidth=2.5, elinewidth=2,
        linestyle="--",
        label="VAL"
    )
    ax1.fill_between(
        leakage_rates,
        [m - c for m, c in zip(val_correct_means, val_correct_cis)],
        [m + c for m, c in zip(val_correct_means, val_correct_cis)],
        alpha=0.15, color="#4c72b0"
    )

    # SCAR 曲线
    ax1.errorbar(
        leakage_rates, scar_correct_means, yerr=scar_correct_cis,
        marker="s", markersize=8, capsize=5, capthick=2,
        color="#c44e52", linewidth=2.5, elinewidth=2,
        label="SCAR"
    )
    ax1.fill_between(
        leakage_rates,
        [m - c for m, c in zip(scar_correct_means, scar_correct_cis)],
        [m + c for m, c in zip(scar_correct_means, scar_correct_cis)],
        alpha=0.15, color="#c44e52"
    )

    # 标注每个点的差值
    for i, rate in enumerate(leakage_rates):
        diff = scar_correct_means[i] - val_correct_means[i]
        if diff > 0:
            y_pos = max(val_correct_means[i], scar_correct_means[i]) + max(val_correct_cis[i], scar_correct_cis[i]) + 1
            ax1.annotate(
                f"+{diff:.1f}%",
                xy=(rate, y_pos),
                ha="center", va="bottom",
                fontsize=8, fontweight="bold", color="#2e7d32"
            )

    ax1.set_xlabel("Leakage Rate (%)", fontsize=20, labelpad=10)
    ax1.set_ylabel("Correct Recovery Rate (%)", fontsize=20, labelpad=10)
    ax1.set_xticks(leakage_rates)
    ax1.set_xticklabels([f"{r:.1f}" for r in leakage_rates])
    ax1.grid(True, alpha=0.3, linestyle="--")
    ax1.legend(loc="lower right", fontsize=14)

    # 设置 Y 轴范围
    all_vals = val_correct_means + scar_correct_means
    all_cis = val_correct_cis + scar_correct_cis
    y_min = min(all_vals) - max(all_cis) - 5
    y_max = max(all_vals) + max(all_cis) + 8
    ax1.set_ylim(max(0, y_min), min(100, y_max))

    # 保存
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    fig.tight_layout()
    fig.savefig(output_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)

    print(f"Saved: {output_path}")


def plot_improvement_bar(
    *,
    meta: Dict[str, Any],
    by_leakage_rate: Dict[float, Dict[str, Any]],
    output_path: str,
    dpi: int = 150,
) -> None:
    """
    绘制 SCAR 相对于 VAL 的提升柱状图。
    """
    try:
        os.environ.setdefault(
            "MPLCONFIGDIR", os.path.join(tempfile.gettempdir(), "matplotlib")
        )
        os.makedirs(os.environ["MPLCONFIGDIR"], exist_ok=True)
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ModuleNotFoundError as exc:
        raise SystemExit("Missing dependency: matplotlib (e.g. `pip install matplotlib`)") from exc

    leakage_rates = sorted(by_leakage_rate.keys())

    improvements = []
    for rate in leakage_rates:
        data = by_leakage_rate[rate]
        runs = data.get("runs", [])
        if runs:
            val_mean = np.mean([r["val_correct"] for r in runs])
            scar_mean = np.mean([r["scar_correct"] for r in runs])
        else:
            val_mean = data.get("val_avg", 0)
            scar_mean = data.get("scar_avg", 0)
        improvements.append(scar_mean - val_mean)

    fig, ax = plt.subplots(figsize=(10, 6))

    colors = ["#2e7d32" if imp >= 0 else "#c62828" for imp in improvements]
    bars = ax.bar([f"{r:.1f}%" for r in leakage_rates], improvements, color=colors, alpha=0.8, edgecolor="black")

    # 在柱子上方/下方标注数值
    for bar, imp in zip(bars, improvements):
        height = bar.get_height()
        va = "bottom" if height >= 0 else "top"
        offset = 0.3 if height >= 0 else -0.3
        ax.annotate(
            f"{imp:+.2f}%",
            xy=(bar.get_x() + bar.get_width() / 2, height + offset),
            ha="center", va=va,
            fontsize=10, fontweight="bold"
        )

    ax.axhline(y=0, color="black", linewidth=1)
    ax.set_xlabel("Leakage Rate", fontsize=12)
    ax.set_ylabel("Improvement (SCAR - VAL) (%)", fontsize=12)
    ax.set_title(
        f"SCAR Improvement over VAL by Leakage Rate\n"
        f"(dataset={meta.get('dataset', 'unknown')})",
        fontsize=14
    )
    ax.grid(True, axis="y", alpha=0.3, linestyle="--")

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    fig.tight_layout()
    fig.savefig(output_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)

    print(f"Saved: {output_path}")


def plot_dual_dataset_comparison(
    *,
    enron_data: Dict[str, Any],
    ccnews_data: Dict[str, Any],
    output_path: str,
    dpi: int = 300,
) -> None:
    """
    Plot dual-dataset leakage comparison as two horizontal subplots.
    Left: Enron dataset, Right: CC-News dataset.
    Uses unified color scheme: VAL (blue), SCAR (pink).
    """
    try:
        os.environ.setdefault(
            "MPLCONFIGDIR", os.path.join(tempfile.gettempdir(), "matplotlib")
        )
        os.makedirs(os.environ["MPLCONFIGDIR"], exist_ok=True)
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ModuleNotFoundError as exc:
        raise SystemExit("Missing dependency: matplotlib (e.g. `pip install matplotlib`)") from exc

    # Global Style Configuration (Times New Roman, matching demo.py)
    plt.rcParams.update({
        'font.family': 'serif',
        'font.serif': ['Times New Roman'],
        'pdf.fonttype': 42,
        'ps.fonttype': 42,
        'font.size': 30,
        'axes.labelsize': 32,
        'axes.titlesize': 32,
        'xtick.labelsize': 34,
        'ytick.labelsize': 34,
        'legend.fontsize': 32,
        'axes.spines.top': True,
        'axes.spines.right': True,
        'axes.linewidth': 1.5,
        'axes.grid': True,
        'grid.alpha': 0.3,
        'grid.linestyle': '--',
        'grid.linewidth': 1.0,
    })

    # Create 1x2 subplot layout
    fig, axes = plt.subplots(1, 2, figsize=(18, 7))

    # Calculate unified y-axis range across both datasets
    all_values = []
    for data in [enron_data, ccnews_data]:
        by_leakage = data["by_leakage_rate"]
        for rate_data in by_leakage.values():
            runs = rate_data.get("runs", [])
            if runs:
                all_values.extend([r["val_correct"] for r in runs])
                all_values.extend([r["scar_correct"] for r in runs])
            else:
                all_values.append(rate_data.get("val_avg", 0))
                all_values.append(rate_data.get("scar_avg", 0))


    datasets = [
        ("Enron", enron_data),
        ("CC-News", ccnews_data),
    ]

    for idx, (dataset_name, data) in enumerate(datasets):
        ax = axes[idx]
        by_leakage_rate = data["by_leakage_rate"]
        leakage_rates = sorted(by_leakage_rate.keys())

        # Collect data
        val_correct_means = []
        val_correct_cis = []
        scar_correct_means = []
        scar_correct_cis = []

        for rate in leakage_rates:
            rate_data = by_leakage_rate[rate]
            runs = rate_data.get("runs", [])

            if runs:
                val_corrects = [r["val_correct"] for r in runs]
                scar_corrects = [r["scar_correct"] for r in runs]

                val_correct_means.append(np.mean(val_corrects))
                val_correct_cis.append(_compute_95ci(val_corrects))
                scar_correct_means.append(np.mean(scar_corrects))
                scar_correct_cis.append(_compute_95ci(scar_corrects))
            else:
                val_correct_means.append(rate_data.get("val_avg", 0))
                val_correct_cis.append(0)
                scar_correct_means.append(rate_data.get("scar_avg", 0))
                scar_correct_cis.append(0)

        # Plot VAL curve
        ax.errorbar(
            leakage_rates, val_correct_means, yerr=val_correct_cis,
            marker="o", markersize=8, capsize=5, capthick=2,
            color=VAL_COLOR, linewidth=2.5, elinewidth=2,
            linestyle="--",
            label="VAL"
        )
        ax.fill_between(
            leakage_rates,
            [m - c for m, c in zip(val_correct_means, val_correct_cis)],
            [m + c for m, c in zip(val_correct_means, val_correct_cis)],
            alpha=0.2, color=VAL_COLOR
        )

        # Plot SCAR curve
        ax.errorbar(
            leakage_rates, scar_correct_means, yerr=scar_correct_cis,
            marker="s", markersize=8, capsize=5, capthick=2,
            color=SCAR_COLOR, linewidth=2.5, elinewidth=2,
            label="Whisper"
        )
        ax.fill_between(
            leakage_rates,
            [m - c for m, c in zip(scar_correct_means, scar_correct_cis)],
            [m + c for m, c in zip(scar_correct_means, scar_correct_cis)],
            alpha=0.2, color=SCAR_COLOR
        )

        # Annotate improvement at each point
        # for i, rate in enumerate(leakage_rates):
        #     diff = scar_correct_means[i] - val_correct_means[i]
        #     if diff > 0:
        #         y_pos = max(val_correct_means[i], scar_correct_means[i]) + max(val_correct_cis[i], scar_correct_cis[i]) + 1
        #         ax.annotate(
        #             f"+{diff:.1f}%",
        #             xy=(rate, y_pos),
        #             ha="center", va="bottom",
        #             fontsize=12, fontweight="bold", color="#2e7d32"
        #         )

        # X-axis label
        ax.set_xlabel("Known Data Rate (%)", labelpad=15, fontsize=40)

        # Subplot labels: (a) Enron, (b) CC-News - positioned below the x-axis
        subplot_label = "(a)" if idx == 0 else "(b)"
        ax.text(0.5, -0.3, f"{subplot_label} {dataset_name}",
                transform=ax.transAxes, fontsize=40, fontweight='bold',
                ha='center', va='top')

        ax.set_ylabel("Correct Recovery Rate (%)", fontsize=34, labelpad=10)

        # Show x-ticks at 0.2 intervals (0, 0.2, 0.4, 0.6, 0.8, 1.0)
        filtered_ticks = [r for r in leakage_rates if abs(r % 0.2) < 0.01 or abs(r % 0.2 - 0.2) < 0.01]
        # Add 0 tick at the beginning
        if 0 not in filtered_ticks:
            filtered_ticks = [0] + filtered_ticks
        ax.set_xticks(filtered_ticks)
        ax.set_yticks([25, 50, 75, 100])
        ax.set_xticklabels(["0" if r == 0 else f"{r:.1f}" for r in filtered_ticks])
        ax.grid(True, alpha=0.3, linestyle="--")
        ax.set_ylim(0,105)
        ax.set_xlim(0,1.05)

        # Add legend inside each subplot
        ax.legend(loc="lower right", fontsize=30, frameon=True, fancybox=True, shadow=True)


    # Save
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    plt.tight_layout()
    plt.subplots_adjust(top=1.1, wspace=0.3)
    fig.savefig(output_path, dpi=300, bbox_inches="tight")
    plt.close(fig)

    print(f"Saved: {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Plot leakage rate comparison results from compare_val_scar_leakage.py"
    )
    parser.add_argument(
        "--input",
        "-i",
        default=None,
        help="Path to results txt (default: latest results/val_vs_scar_leakage_*.txt)",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Output image path prefix (default: photos/leakage/<input>)",
    )
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument(
        "--only-main",
        action="store_true",
        help="Only generate the main comparison plot",
    )
    parser.add_argument(
        "--only-improvement",
        action="store_true",
        help="Only generate the improvement bar chart",
    )
    # Dual-dataset mode arguments
    parser.add_argument(
        "--dual",
        action="store_true",
        help="Generate dual-dataset comparison plot (Enron vs CC-News)",
    )
    parser.add_argument(
        "--enron",
        default=None,
        help="Path to Enron results file (for dual mode)",
    )
    parser.add_argument(
        "--ccnews",
        default=None,
        help="Path to CC-News results file (for dual mode)",
    )

    args = parser.parse_args()

    # Dual-dataset mode
    if args.dual or (args.enron and args.ccnews):
        enron_path = args.enron or "results/enron_overall.txt"
        ccnews_path = args.ccnews or "results/ccnews_overall.txt"

        if not os.path.exists(enron_path):
            raise FileNotFoundError(f"Enron results file not found: {enron_path}")
        if not os.path.exists(ccnews_path):
            raise FileNotFoundError(f"CC-News results file not found: {ccnews_path}")

        enron_data = _parse_leakage_results(enron_path)
        ccnews_data = _parse_leakage_results(ccnews_path)

        print(f"Parsed Enron results from {enron_path}")
        print(f"  Leakage rates: {sorted(enron_data['by_leakage_rate'].keys())}")
        print(f"Parsed CC-News results from {ccnews_path}")
        print(f"  Leakage rates: {sorted(ccnews_data['by_leakage_rate'].keys())}")

        output_path = args.output or "photos/enron_ccnews_leakage_comparison.pdf"

        plot_dual_dataset_comparison(
            enron_data=enron_data,
            ccnews_data=ccnews_data,
            output_path=output_path,
            dpi=args.dpi,
        )
        return

    # Single-dataset mode (original behavior)
    input_path = args.input or _find_latest_result("results/val_vs_scar_leakage_*.txt")
    stem = os.path.splitext(os.path.basename(input_path))[0]

    if args.output:
        output_prefix = args.output
    else:
        output_prefix = os.path.join("photos", "leakage", stem)

    # 确保输出目录存在
    os.makedirs(os.path.dirname(output_prefix) or ".", exist_ok=True)

    # 解析结果
    results = _parse_leakage_results(input_path)
    meta = results["meta"]
    by_leakage_rate = results["by_leakage_rate"]

    print(f"Parsed results from {input_path}")
    print(f"  Dataset: {meta.get('dataset', 'unknown')}")
    print(f"  Leakage rates: {sorted(by_leakage_rate.keys())}")
    print(f"  Runs per rate: {meta.get('runs', 'unknown')}")

    # 生成图表
    generate_all = not (args.only_main or args.only_improvement)

    if generate_all or args.only_main:
        plot_leakage_comparison(
            meta=meta,
            by_leakage_rate=by_leakage_rate,
            output_path=f"{output_prefix}_comparison.png",
            dpi=args.dpi,
        )

    if generate_all or args.only_improvement:
        plot_improvement_bar(
            meta=meta,
            by_leakage_rate=by_leakage_rate,
            output_path=f"{output_prefix}_improvement.png",
            dpi=args.dpi,
        )


if __name__ == "__main__":
    main()
