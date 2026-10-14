from __future__ import annotations

import argparse
import csv
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import numpy as np


plt.rcParams.update(
    {
        "font.family": "serif",
        "font.serif": ["Times New Roman", "Times", "DejaVu Serif"],
        "font.weight": "bold",
        "font.size": 21,
        "axes.labelsize": 24,
        "axes.labelweight": "bold",
        "axes.titlesize": 23,
        "axes.titleweight": "bold",
        "xtick.labelsize": 22,
        "ytick.labelsize": 22,
        "legend.fontsize": 18,
        "axes.spines.top": True,
        "axes.spines.right": True,
        "axes.linewidth": 1.4,
        "axes.edgecolor": "black",
        "axes.grid": True,
        "grid.alpha": 0.30,
        "grid.linestyle": "--",
        "grid.linewidth": 0.9,
        "lines.linewidth": 2.8,
        "lines.markersize": 8.5,
        "pdf.fonttype": 42,
        "ps.fonttype": 42,
        "mathtext.fontset": "stix",
        "savefig.dpi": 600,
        "figure.dpi": 300,
        "figure.facecolor": "white",
        "savefig.facecolor": "white",
    }
)


METHOD_DIRS = {
    "Plaintext": "Plaintext",
    "SecureDeepFM": "SecureDeepFM",
    "FedCTR": "FedCTR",
    "DP-AFedDFM": "AFedDFM",
}

METHOD_LABELS = {
    "Plaintext": "Plaintext",
    "SecureDeepFM": "Ours",
    "FedCTR": "FedCTR",
    "DP-AFedDFM": "AFedDFM",
}

# Soft, template-aligned palette. SecureDeepFM is the highlighted ours method.
# The curves stay in a light red/blue/green family with clear but not
# over-saturated separation.
REFERENCE_COLORS = {
    "neutral_gray": "#6F7478",
    "ours_red": "#E57373",
    "pastel_blue": "#8BCFDC",
    "pastel_green": "#9CCB9E",
}

METHOD_STYLES = {
    "Plaintext": {
        "color": REFERENCE_COLORS["neutral_gray"],
        "linestyle": "--",
        "linewidth": 2.5,
        "marker": None,
        "zorder": 6,
    },
    "SecureDeepFM": {
        "color": REFERENCE_COLORS["ours_red"],
        "linestyle": "-",
        "linewidth": 2.5,
        "marker": "D",
        "markersize": 7.0,
        "markeredgecolor": REFERENCE_COLORS["ours_red"],
        "markeredgewidth": 0.0,
        "zorder": 5,
    },
    "FedCTR": {
        "color": REFERENCE_COLORS["pastel_blue"],
        "linestyle": "-",
        "linewidth": 2.5,
        "marker": "s",
        "markersize": 7.0,
        "markeredgecolor": REFERENCE_COLORS["pastel_blue"],
        "markeredgewidth": 0.0,
        "zorder": 3,
    },
    "DP-AFedDFM": {
        "color": REFERENCE_COLORS["pastel_green"],
        "linestyle": "-",
        "linewidth": 2.5,
        "marker": "o",
        "markersize": 7.0,
        "markeredgecolor": REFERENCE_COLORS["pastel_green"],
        "markeredgewidth": 0.0,
        "zorder": 3,
    },
}

# In the compact two-panel layout, color/marker identifies the method and
# line style identifies the training scale. This preserves every original
# data series while allowing the two scales of each dataset to share one axis.
SCALE_LINESTYLES = ("-", "--", "-.", ":")


AUC_SCALE_BREAK = 0.70
AUC_UPPER_EXPANSION = 4.0


def auc_piecewise_forward(values):
    """Expand the high-AUC region while keeping tick labels in true AUC units."""
    arr = np.asarray(values)
    return np.where(
        arr <= AUC_SCALE_BREAK,
        arr,
        AUC_SCALE_BREAK + (arr - AUC_SCALE_BREAK) * AUC_UPPER_EXPANSION,
    )


def auc_piecewise_inverse(values):
    """Inverse transform for the piecewise AUC axis."""
    arr = np.asarray(values)
    return np.where(
        arr <= AUC_SCALE_BREAK,
        arr,
        AUC_SCALE_BREAK + (arr - AUC_SCALE_BREAK) / AUC_UPPER_EXPANSION,
    )


def auc_piecewise_ticks(lo: float, hi: float) -> List[float]:
    ticks = [0.50, 0.55, 0.60, 0.65, 0.70, 0.72, 0.74, 0.76, 0.78]
    return [tick for tick in ticks if lo <= tick <= hi]


@dataclass(frozen=True)
class MetricRecord:
    method: str
    dataset: str
    scale: int
    epsilon: Optional[float]
    metric: str
    value: float
    source_file: Path
    epoch: int


def parse_float(value: object, default: float = math.nan) -> float:
    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    if text.lower() in {"inf", "+inf", "infinity", "+infinity"}:
        return math.inf
    try:
        return float(text)
    except ValueError:
        return default


def parse_int(value: object, default: int = 0) -> int:
    parsed = parse_float(value, math.nan)
    if math.isnan(parsed) or math.isinf(parsed):
        return default
    return int(parsed)


def normalize_text(value: object) -> str:
    return str(value or "").strip().lower()


def split_list(text: str) -> List[str]:
    return [part.strip() for part in re.split(r"[,; ]+", text) if part.strip()]


def scale_label(scale: int) -> str:
    if scale >= 1000 and scale % 1000 == 0:
        return f"{scale // 1000}K"
    return str(scale)


def epsilon_label(epsilon: float) -> str:
    if math.isinf(epsilon):
        return r"$\infty$"
    if abs(epsilon - round(epsilon)) < 1e-12:
        return str(int(round(epsilon)))
    return f"{epsilon:g}"


def parse_epsilon_token(text: str) -> Optional[float]:
    cleaned = text.strip().lower().replace("_", ".")
    if cleaned in {"inf", "infinity"}:
        return math.inf
    value = parse_float(cleaned, math.nan)
    return None if math.isnan(value) else value


def parse_epsilon_from_path(path: Path) -> Optional[float]:
    match = re.search(r"(?:^|[_-])eps[-_]?([0-9]+(?:_[0-9]+)?|inf)(?:[_-]|\.|$)", path.name, re.I)
    if not match:
        return None
    return parse_epsilon_token(match.group(1))


def parse_epoch_from_path(path: Path) -> int:
    match = re.search(r"(?:^|[_-])epoch[-_]?(\d+)(?:[_-]|\.|$)", path.name, re.I)
    return int(match.group(1)) if match else 0


def parse_scale_from_text(text: str) -> int:
    patterns = [
        r"train[-_](\d+)",
        r"streaming_results_(\d+)",
        r"sample[-_]?(\d+)",
        r"sample_rows=(\d+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return int(match.group(1))
    return 0


def parse_dataset_from_text(text: str) -> str:
    lowered = text.lower()
    for dataset in ("criteo", "avazu", "movielens", "ml-100k", "ml-1m"):
        if dataset in lowered:
            return "movielens" if dataset.startswith("ml-") else dataset
    return ""


def read_csv_rows(path: Path) -> List[Dict[str, str]]:
    with path.open("r", newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def extract_metric(rows: Sequence[Dict[str, str]], metric: str) -> float:
    metric_key = metric.lower()

    # SecureDeepFM uses a long table: metric, online, test, metrics, auc, value.
    for row in rows:
        if (
            normalize_text(row.get("record_type")) == "metric"
            and normalize_text(row.get("phase")) == "online"
            and normalize_text(row.get("split")) == "test"
            and normalize_text(row.get("component")) == "metrics"
            and normalize_text(row.get("metric")) == metric_key
        ):
            return parse_float(row.get("value"))

    # Plaintext/FedCTR/AFedDFM use a wide table with summary/test rows.
    candidates: List[float] = []
    for row in rows:
        if normalize_text(row.get("record_type")) == "summary" and normalize_text(row.get("mode")) == "test":
            value = parse_float(row.get(metric_key))
            if not math.isnan(value):
                candidates.append(value)
    if candidates:
        return candidates[-1]

    # Fallback for future files: use the last test row with a matching metric column.
    for row in reversed(rows):
        if normalize_text(row.get("mode") or row.get("split")) == "test":
            value = parse_float(row.get(metric_key))
            if not math.isnan(value):
                return value

    return math.nan


def infer_metadata(path: Path, rows: Sequence[Dict[str, str]], method: str) -> Tuple[str, int, Optional[float], int]:
    combined = " ".join([path.name, path.as_posix()])
    dataset = parse_dataset_from_text(combined)
    scale = parse_scale_from_text(combined)
    epoch = parse_epoch_from_path(path)
    epsilon = parse_epsilon_from_path(path)

    if rows:
        first = rows[0]
        row_text = " ".join(str(value) for value in first.values())
        dataset = dataset or parse_dataset_from_text(row_text)
        scale = scale or parse_scale_from_text(row_text)
        epoch = epoch or parse_int(first.get("epochs") or first.get("num_rounds") or first.get("epoch_index"), 0)

        if epsilon is None and method in {"FedCTR", "DP-AFedDFM"}:
            for key in ("ldp_epsilon", "ldp_implied_epsilon", "dp_implied_epsilon", "epsilon", "privacy_budget"):
                value = parse_float(first.get(key), math.nan)
                if not math.isnan(value):
                    epsilon = value
                    break

        if not scale:
            for key in ("train_rows", "num_train_rows", "max_samples"):
                scale = parse_int(first.get(key), 0)
                if scale:
                    break

    return dataset, scale, epsilon, epoch


def discover_records(
    scheme_root: Path,
    datasets: Sequence[str],
    scales: Sequence[int],
    metric: str,
) -> List[MetricRecord]:
    wanted_datasets = {dataset.lower() for dataset in datasets}
    wanted_scales = set(scales)
    records: Dict[Tuple[str, str, int, Optional[float]], MetricRecord] = {}

    for method, subdir in METHOD_DIRS.items():
        method_dir = scheme_root / subdir
        if not method_dir.exists():
            print(f"Warning: missing method directory: {method_dir}")
            continue

        for path in sorted(method_dir.glob("*.csv")):
            rows = read_csv_rows(path)
            value = extract_metric(rows, metric)
            if math.isnan(value):
                continue

            dataset, scale, epsilon, epoch = infer_metadata(path, rows, method)
            if not dataset or not scale:
                continue
            if wanted_datasets and dataset.lower() not in wanted_datasets:
                continue
            if wanted_scales and scale not in wanted_scales:
                continue

            if method in {"FedCTR", "DP-AFedDFM"} and epsilon is None:
                continue
            if method in {"Plaintext", "SecureDeepFM"}:
                epsilon = None

            record = MetricRecord(
                method=method,
                dataset=dataset,
                scale=scale,
                epsilon=epsilon,
                metric=metric,
                value=value,
                source_file=path,
                epoch=epoch,
            )
            key = (method, dataset, scale, epsilon)
            old = records.get(key)
            if old is None or (record.epoch, record.source_file.stat().st_mtime) > (
                old.epoch,
                old.source_file.stat().st_mtime,
            ):
                records[key] = record

    return sorted(records.values(), key=lambda r: (r.dataset, r.scale, r.method, epsilon_sort_key(r.epsilon)))


def epsilon_sort_key(epsilon: Optional[float]) -> Tuple[int, float]:
    if epsilon is None:
        return (2, 0.0)
    if math.isinf(epsilon):
        return (1, 0.0)
    return (0, epsilon)


def choose_epsilon_axis(records: Sequence[MetricRecord], requested: Optional[Sequence[float]]) -> List[float]:
    if requested:
        return sorted(requested, key=lambda value: (math.isinf(value), value if not math.isinf(value) else 0.0))
    epsilons = {
        record.epsilon
        for record in records
        if record.method in {"FedCTR", "DP-AFedDFM"} and record.epsilon is not None
    }
    return sorted(epsilons, key=lambda value: (math.isinf(value), value if not math.isinf(value) else 0.0))


def write_summary_csv(records: Sequence[MetricRecord], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "dataset",
                "scale",
                "method",
                "epsilon",
                "epsilon_label",
                "metric",
                "value",
                "epoch",
                "source_file",
            ],
        )
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    "dataset": record.dataset,
                    "scale": record.scale,
                    "method": record.method,
                    "epsilon": "" if record.epsilon is None else ("inf" if math.isinf(record.epsilon) else f"{record.epsilon:g}"),
                    "epsilon_label": "baseline" if record.epsilon is None else epsilon_label(record.epsilon),
                    "metric": record.metric,
                    "value": f"{record.value:.10g}",
                    "epoch": record.epoch,
                    "source_file": str(record.source_file),
                }
            )


def get_record(
    records: Sequence[MetricRecord],
    method: str,
    dataset: str,
    scale: int,
    epsilon: Optional[float] = None,
) -> Optional[MetricRecord]:
    for record in records:
        if record.method != method or record.dataset != dataset or record.scale != scale:
            continue
        if epsilon is None:
            if record.epsilon is None:
                return record
        elif record.epsilon is not None and epsilon_equal(record.epsilon, epsilon):
            return record
    return None


def epsilon_equal(left: float, right: float) -> bool:
    if math.isinf(left) or math.isinf(right):
        return math.isinf(left) and math.isinf(right)
    return abs(left - right) < 1e-12


def axis_limits(values: Sequence[float]) -> Tuple[float, float]:
    finite = [value for value in values if not math.isnan(value) and not math.isinf(value)]
    if not finite:
        return 0.0, 1.0
    lo = max(0.0, min(finite) - 0.03)
    hi = min(1.0, max(finite) + 0.025)
    if hi - lo < 0.08:
        mid = (hi + lo) / 2.0
        lo = max(0.0, mid - 0.04)
        hi = min(1.0, mid + 0.04)
    return lo, hi


def plot_tradeoff(
    records: Sequence[MetricRecord],
    datasets: Sequence[str],
    scales: Sequence[int],
    epsilons: Sequence[float],
    metric: str,
    output_dir: Path,
    output_name: str,
    output_format: str,
) -> List[Path]:
    panels = [(dataset, scale) for dataset in datasets for scale in scales]
    panels = [
        panel
        for panel in panels
        if any(record.dataset == panel[0] and record.scale == panel[1] for record in records)
    ]
    if not panels:
        raise RuntimeError("No matching records were found for the requested datasets/scales.")
    if not epsilons:
        raise RuntimeError("No privacy-budget points were found for FedCTR or DP-AFedDFM.")

    active_datasets = [
        dataset
        for dataset in datasets
        if any(panel_dataset == dataset for panel_dataset, _ in panels)
    ]
    dataset_scales = {
        dataset: [scale for scale in scales if (dataset, scale) in panels]
        for dataset in active_datasets
    }

    # Use two side-by-side dataset panels when the standard 2-dataset x 2-scale
    # evaluation is available. Each panel overlays the two scales, with method
    # encoded by color/marker and scale encoded by line style. For other input
    # shapes, retain a compact multi-panel layout.
    use_two_panel = (
        len(active_datasets) == 2
        and len(scales) == 2
        and all(len(dataset_scales[dataset]) == 2 for dataset in active_datasets)
    )

    x_positions = list(range(len(epsilons)))
    x_labels = [epsilon_label(value) for value in epsilons]

    def configure_axis(
        ax: plt.Axes,
        panel_values: Sequence[float],
        dataset: str,
    ) -> None:
        dataset_key = dataset.lower()
        y_limits = axis_limits(panel_values)

        # Avazu 保留原有数据范围和较密的纵轴刻度。
        if dataset_key == "avazu":
            finite_values = [
                value
                for value in panel_values
                if not math.isnan(value) and not math.isinf(value)
            ]
            if finite_values:
                y_limits = (
                    y_limits[0],
                    min(1.0, max(finite_values) + 0.004),
                )

        if metric.lower() == "auc":
            ax.set_yscale(
                "function",
                functions=(auc_piecewise_forward, auc_piecewise_inverse),
            )

            if dataset_key == "criteo":
                # Criteo 删除拥挤的 0.55 和 0.65，
                # 最高显示 0.77，并预留少量顶部空间。
                auc_ticks = [
                    0.50,
                    0.60,
                    0.70,
                    0.72,
                    0.74,
                    0.76,
                    0.78,
                ]
                y_limits = (
                    y_limits[0],
                    min(y_limits[1], 0.774),
                )
            else:
                # Avazu 使用原有的较密刻度。
                auc_ticks = [
                    0.50,
                    0.55,
                    0.60,
                    0.65,
                    0.70,
                    0.72,
                    0.74,
                ]

            ax.set_yticks(
                [
                    tick
                    for tick in auc_ticks
                    if y_limits[0] <= tick <= y_limits[1]
                ]
            )

        ax.set_ylim(*y_limits)

        ax.set_xticks(x_positions)
        ax.set_xticklabels(x_labels)
        ax.set_xlim(-0.18, len(x_positions) - 0.82)

        ax.grid(
            True,
            which="both",
            axis="y",
            linestyle="--",
            linewidth=0.8,
            alpha=0.30,
        )

        ax.spines["top"].set_visible(True)
        ax.spines["right"].set_visible(True)

        ax.tick_params(
            axis="both",
            which="major",
            labelsize=22,
            width=1.7,
            length=6,
            pad=3,
        )

        # 横、纵坐标刻度统一加粗。
        for label in ax.get_xticklabels() + ax.get_yticklabels():
            label.set_fontweight("bold")

        for spine in ax.spines.values():
            spine.set_linewidth(1.5)
            spine.set_color("black")
            
    if use_two_panel:
        fig, axes = plt.subplots(
            1,
            2,
            figsize=(9.6, 3.85),
            squeeze=False,
            constrained_layout=False,
        )
        scale_styles = {
            scale: SCALE_LINESTYLES[index % len(SCALE_LINESTYLES)]
            for index, scale in enumerate(scales)
        }

        for ax, dataset in zip(axes.ravel(), active_datasets):
            panel_values: List[float] = []
            for scale in dataset_scales[dataset]:
                scale_linestyle = scale_styles[scale]

                for method in ("Plaintext", "SecureDeepFM"):
                    record = get_record(records, method, dataset, scale)
                    if record is None:
                        continue
                    y_values = [record.value] * len(x_positions)
                    panel_values.extend(y_values)
                    style = dict(METHOD_STYLES[method])
                    style["linestyle"] = scale_linestyle
                    ax.plot(x_positions, y_values, **style)

                for method in ("FedCTR", "DP-AFedDFM"):
                    y_values: List[float] = []
                    for epsilon in epsilons:
                        record = get_record(records, method, dataset, scale, epsilon)
                        y_values.append(record.value if record is not None else math.nan)
                    if all(math.isnan(value) for value in y_values):
                        continue
                    panel_values.extend(
                        value for value in y_values if not math.isnan(value)
                    )
                    style = dict(METHOD_STYLES[method])
                    style["linestyle"] = scale_linestyle
                    ax.plot(x_positions, y_values, **style)

            ax.set_title(dataset.capitalize(), pad=4)
            configure_axis(ax, panel_values, dataset)

        method_handles: List[Line2D] = []
        for method in ("Plaintext", "SecureDeepFM", "FedCTR", "DP-AFedDFM"):
            style = METHOD_STYLES[method]
            method_handles.append(
                Line2D(
                    [0],
                    [0],
                    color=style["color"],
                    linestyle="-",
                    linewidth=style.get("linewidth", 2.8),
                    marker=style.get("marker", None),
                    markersize=style.get("markersize", 8.0),
                    markerfacecolor=style.get("color"),
                    markeredgecolor=style["color"],
                    markeredgewidth=0.0,
                    label=METHOD_LABELS[method],
                )
            )

        scale_handles = [
            Line2D(
                [0],
                [0],
                color="black",
                linestyle=scale_styles[scale],
                linewidth=2.6,
                label=scale_label(scale),
            )
            for scale in scales
        ]

        fig.legend(
            handles=method_handles + scale_handles,
            loc="upper center",
            ncol=6,
            frameon=False,
            fontsize=16,
            handlelength=1.65,
            handletextpad=0.38,
            columnspacing=0.72,
            borderaxespad=0.0,
            bbox_to_anchor=(0.5, 0.935),
        )

        ylabel = "AUC" if metric.lower() == "auc" else metric
        axes[0, 0].set_ylabel(ylabel, labelpad=7, fontsize=20, fontweight="bold")
        fig.supxlabel(
            r"Privacy budget $\epsilon$ (strict $\rightarrow$ loose)",
            y=0.012,
            fontsize=20,
            fontweight="bold",
        )
        fig.subplots_adjust(
            left=0.102,
            right=0.992,
            bottom=0.200,
            top=0.785,
            wspace=0.18,
        )

    else:
        ncols = 2 if len(panels) > 1 else 1
        nrows = math.ceil(len(panels) / ncols)
        fig_width = 9.0 if ncols == 2 else 4.9
        fig_height = 5.25 if nrows == 2 else 3.55
        fig, axes = plt.subplots(
            nrows,
            ncols,
            figsize=(fig_width, fig_height),
            squeeze=False,
            constrained_layout=False,
        )

        for ax, (dataset, scale) in zip(axes.ravel(), panels):
            panel_values: List[float] = []
            for method in ("Plaintext", "SecureDeepFM"):
                record = get_record(records, method, dataset, scale)
                if record is None:
                    continue
                y_values = [record.value] * len(x_positions)
                panel_values.extend(y_values)
                ax.plot(x_positions, y_values, **METHOD_STYLES[method])

            for method in ("FedCTR", "DP-AFedDFM"):
                y_values: List[float] = []
                for epsilon in epsilons:
                    record = get_record(records, method, dataset, scale, epsilon)
                    y_values.append(record.value if record is not None else math.nan)
                if all(math.isnan(value) for value in y_values):
                    continue
                panel_values.extend(value for value in y_values if not math.isnan(value))
                ax.plot(x_positions, y_values, **METHOD_STYLES[method])

            ax.set_title(f"{dataset.capitalize()} {scale_label(scale)}", pad=4)
            configure_axis(ax, panel_values, dataset)

        for ax in axes.ravel()[len(panels):]:
            ax.axis("off")

        legend_handles = []
        for method in ("Plaintext", "SecureDeepFM", "FedCTR", "DP-AFedDFM"):
            style = METHOD_STYLES[method]
            legend_handles.append(
                Line2D(
                    [0],
                    [0],
                    color=style["color"],
                    linestyle=style.get("linestyle", "-"),
                    linewidth=style.get("linewidth", 2.8),
                    marker=style.get("marker", None),
                    markersize=style.get("markersize", 8.0),
                    markerfacecolor=style.get("color"),
                    markeredgecolor=style["color"],
                    markeredgewidth=0.0,
                    label=METHOD_LABELS[method],
                )
            )

        fig.legend(
            handles=legend_handles,
            loc="upper center",
            ncol=4,
            frameon=False,
            fontsize=16,
            handlelength=1.8,
            handletextpad=0.40,
            columnspacing=0.80,
            borderaxespad=0.0,
            bbox_to_anchor=(0.5, 0.992),
        )

        ylabel = "AUC" if metric.lower() == "auc" else metric
        fig.supylabel(ylabel, x=0.016, fontsize=21, fontweight="bold")
        fig.supxlabel(
            r"Privacy budget $\epsilon$ (strict $\rightarrow$ loose)",
            y=0.012,
            fontsize=21,
            fontweight="bold",
        )
        fig.subplots_adjust(
            left=0.092,
            right=0.992,
            bottom=0.125,
            top=0.855,
            hspace=0.24,
            wspace=0.18,
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    saved: List[Path] = []
    formats = ["pdf", "png"] if output_format == "both" else [output_format]
    for fmt in formats:
        path = output_dir / f"{output_name}.{fmt}"
        fig.savefig(
            path,
            dpi=600 if fmt == "png" else None,
            bbox_inches="tight",
            pad_inches=0.02,
        )
        saved.append(path)
    plt.close(fig)
    return saved

def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(
        description="Draw Privacy-Utility Trade-off curves from result CSV files."
    )
    parser.add_argument(
        "--scheme-root",
        type=Path,
        default=script_dir / "Scheme",
        help="Root directory containing Plaintext/SecureDeepFM/FedCTR/AFedDFM CSV folders.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=script_dir / "Outs",
        help="Directory for the generated figure and normalized summary CSV.",
    )
    parser.add_argument(
        "--output-name",
        default="privacy_utility_tradeoff",
        help="Output file stem for the generated figure.",
    )
    parser.add_argument(
        "--datasets",
        default="criteo,avazu",
        help="Comma/space separated dataset names. Default: criteo,avazu.",
    )
    parser.add_argument(
        "--scales",
        default="50000,100000",
        help="Comma/space separated train data scales. Default: 50000,100000.",
    )
    parser.add_argument(
        "--eps",
        default="",
        help="Optional comma/space separated epsilon values, e.g. 0.1,0.5,1,5,10,inf.",
    )
    parser.add_argument(
        "--metric",
        default="auc",
        help="Metric column to plot. Default: auc.",
    )
    parser.add_argument(
        "--format",
        choices=("pdf", "png", "both"),
        default="both",
        help="Figure output format. Default: both.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    datasets = [item.lower() for item in split_list(args.datasets)]
    scales = [int(item) for item in split_list(args.scales)]
    requested_eps = [parse_epsilon_token(item) for item in split_list(args.eps)] if args.eps else None
    requested_eps = [value for value in requested_eps or [] if value is not None] or None

    records = discover_records(args.scheme_root, datasets, scales, args.metric)
    epsilons = choose_epsilon_axis(records, requested_eps)
    selected_records = [
        record
        for record in records
        if record.epsilon is None
        or any(record.epsilon is not None and epsilon_equal(record.epsilon, eps) for eps in epsilons)
    ]

    summary_path = args.output_dir / f"{args.output_name}_summary.csv"
    write_summary_csv(selected_records, summary_path)
    figure_paths = plot_tradeoff(
        selected_records,
        datasets,
        scales,
        epsilons,
        args.metric,
        args.output_dir,
        args.output_name,
        args.format,
    )

    print(f"Summary CSV: {summary_path}")
    for path in figure_paths:
        print(f"Figure: {path}")

    available = {(record.dataset, record.scale, record.method, record.epsilon) for record in selected_records}
    for dataset in datasets:
        for scale in scales:
            for method in ("Plaintext", "SecureDeepFM"):
                if (dataset, scale, method, None) not in available:
                    print(f"Warning: missing {method} baseline for {dataset} {scale_label(scale)}.")


if __name__ == "__main__":
    main()