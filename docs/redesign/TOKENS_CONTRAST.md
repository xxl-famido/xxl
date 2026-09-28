# 토큰 대비 보고서 (자동 생성 — gen_tokens.py)

기준: 텍스트 4.5:1 · UI 컴포넌트(보더·링·아이콘·표식) 3.0:1 · 본문 주요 텍스트 7:1 목표.
중립 램프: OKLCH h=75.0 C=0.004(라이트)/0.002(다크) — 약간 따뜻한 회색, zinc h≈286과 구분. 강조색 후보: cobalt h=255.0, azure h=242.0, indigo-less h=266.0.

## light

| 쌍 | 전경 | 배경 | 대비 | 기준 | 판정 |
|---|---|---|---|---|---|
| accent cobalt: 흰 글씨/solid | `#ffffff` | `#1a73d5` | 4.71 | 4.5 | ✓ |
| accent cobalt: solid 링/surface | `#1a73d5` | `#ffffff` | 4.71 | 3.0 | ✓ |
| accent cobalt: solid 링/subtle | `#1a73d5` | `#f2f0ed` | 4.14 | 3.0 | ✓ |
| accent cobalt: text/canvas | `#1f68bc` | `#f8f6f4` | 5.17 | 4.5 | ✓ |
| accent azure: 흰 글씨/solid | `#ffffff` | `#0278b6` | 4.81 | 4.5 | ✓ |
| accent azure: solid 링/surface | `#0278b6` | `#ffffff` | 4.81 | 3.0 | ✓ |
| accent azure: solid 링/subtle | `#0278b6` | `#f2f0ed` | 4.23 | 3.0 | ✓ |
| accent azure: text/canvas | `#046fa8` | `#f8f6f4` | 5.07 | 4.5 | ✓ |
| accent indigo-less: 흰 글씨/solid | `#ffffff` | `#456cd7` | 4.80 | 4.5 | ✓ |
| accent indigo-less: solid 링/surface | `#456cd7` | `#ffffff` | 4.80 | 3.0 | ✓ |
| accent indigo-less: solid 링/subtle | `#456cd7` | `#f2f0ed` | 4.22 | 3.0 | ✓ |
| accent indigo-less: text/canvas | `#4062be` | `#f8f6f4` | 5.25 | 4.5 | ✓ |
| status danger: text/canvas | `#ab413a` | `#f8f6f4` | 5.49 | 4.5 | ✓ |
| status danger: 흰 글씨/solid | `#ffffff` | `#c74b43` | 4.65 | 4.5 | ✓ |
| status success: text/canvas | `#037e3f` | `#f8f6f4` | 4.80 | 4.5 | ✓ |
| status success: 흰 글씨/solid | `#ffffff` | `#028844` | 4.56 | 4.5 | ✓ |
| status warning: text/canvas | `#935a00` | `#f8f6f4` | 5.26 | 4.5 | ✓ |
| status warning: 흰 글씨/solid | `#ffffff` | `#a66704` | 4.60 | 4.5 | ✓ |
| element fire 점/selected | `#d15e49` | `#e9e7e5` | 3.15 | 3.0 | ✓ |
| element fire 테두리/surface | `#d15e49` | `#ffffff` | 3.88 | 3.0 | ✓ |
| element fire text/subtle | `#b54c3a` | `#ffebe7` | 4.51 | 4.5 | ✓ |
| element fire text/canvas | `#b54c3a` | `#f8f6f4` | 4.80 | 4.5 | ✓ |
| element water 점/selected | `#068dc9` | `#e9e7e5` | 3.01 | 3.0 | ✓ |
| element water 테두리/surface | `#068dc9` | `#ffffff` | 3.71 | 3.0 | ✓ |
| element water text/subtle | `#0574a6` | `#e2f3ff` | 4.56 | 4.5 | ✓ |
| element water text/canvas | `#0574a6` | `#f8f6f4` | 4.80 | 4.5 | ✓ |
| element wood 점/selected | `#2c9647` | `#e9e7e5` | 3.06 | 3.0 | ✓ |
| element wood 테두리/surface | `#2c9647` | `#ffffff` | 3.78 | 3.0 | ✓ |
| element wood text/subtle | `#187e36` | `#e3f6e5` | 4.56 | 4.5 | ✓ |
| element wood text/canvas | `#187e36` | `#f8f6f4` | 4.78 | 4.5 | ✓ |
| element light 점/selected | `#a47f00` | `#e9e7e5` | 3.03 | 3.0 | ✓ |
| element light 테두리/surface | `#a47f00` | `#ffffff` | 3.74 | 3.0 | ✓ |
| element light text/subtle | `#876904` | `#f9f0da` | 4.57 | 4.5 | ✓ |
| element light text/canvas | `#876904` | `#f8f6f4` | 4.81 | 4.5 | ✓ |
| element dark 점/selected | `#956ed2` | `#e9e7e5` | 3.13 | 3.0 | ✓ |
| element dark 테두리/surface | `#956ed2` | `#ffffff` | 3.86 | 3.0 | ✓ |
| element dark text/subtle | `#7d5ab5` | `#f2edfe` | 4.58 | 4.5 | ✓ |
| element dark text/canvas | `#7d5ab5` | `#f8f6f4` | 4.87 | 4.5 | ✓ |
| text-primary/surface | `#1c1a19` | `#ffffff` | 17.34 | 7.0 | ✓ |
| text-secondary/selected | `#4d4b49` | `#e9e7e5` | 7.04 | 4.5 | ✓ |
| text-tertiary/selected | `#696765` | `#e9e7e5` | 4.57 | 4.5 | ✓ |
| border-strong/surface | `#8c8a88` | `#ffffff` | 3.44 | 3.0 | ✓ |
| border-strong/subtle | `#8c8a88` | `#f2f0ed` | 3.02 | 3.0 | ✓ |
| text-inverse/bg-inverse | `#fcfaf7` | `#201f1d` | 15.81 | 4.5 | ✓ |

### 전체 값

| 토큰 | hex |
|---|---|
| `--bg-canvas` | `#f8f6f4` |
| `--bg-surface` | `#ffffff` |
| `--bg-subtle` | `#f2f0ed` |
| `--bg-selected` | `#e9e7e5` |
| `--bg-overlay` | `#ffffff` |
| `--bg-inverse` | `#201f1d` |
| `--border-subtle` | `#e3e1de` |
| `--border-default` | `#d2d1ce` |
| `--border-strong` | `#8c8a88` |
| `--text-primary` | `#1c1a19` |
| `--text-secondary` | `#4d4b49` |
| `--text-tertiary` | `#696765` |
| `--text-disabled` | `#a6a4a2` |
| `--text-inverse` | `#fcfaf7` |
| `--accent-cobalt-solid` | `#1a73d5` |
| `--accent-cobalt-hover` | `#0064c3` |
| `--accent-cobalt-active` | `#0159ae` |
| `--accent-cobalt-text` | `#1f68bc` |
| `--accent-cobalt-subtle` | `#ecf4fe` |
| `--accent-cobalt-muted` | `#d4e6ff` |
| `--accent-azure-solid` | `#0278b6` |
| `--accent-azure-hover` | `#0269a0` |
| `--accent-azure-active` | `#035d8f` |
| `--accent-azure-text` | `#046fa8` |
| `--accent-azure-subtle` | `#e9f5ff` |
| `--accent-azure-muted` | `#cee9fe` |
| `--accent-indigo-less-solid` | `#456cd7` |
| `--accent-indigo-less-hover` | `#385cc6` |
| `--accent-indigo-less-active` | `#2d50b8` |
| `--accent-indigo-less-text` | `#4062be` |
| `--accent-indigo-less-subtle` | `#eef4ff` |
| `--accent-indigo-less-muted` | `#d9e5fe` |
| `--status-danger-solid` | `#c74b43` |
| `--status-danger-text` | `#ab413a` |
| `--status-danger-subtle` | `#ffefed` |
| `--status-success-solid` | `#028844` |
| `--status-success-text` | `#037e3f` |
| `--status-success-subtle` | `#e8f9eb` |
| `--status-warning-solid` | `#a66704` |
| `--status-warning-text` | `#935a00` |
| `--status-warning-subtle` | `#fef1e3` |
| `--element-fire` | `#d15e49` |
| `--element-fire-subtle` | `#ffebe7` |
| `--element-fire-text` | `#b54c3a` |
| `--element-water` | `#068dc9` |
| `--element-water-subtle` | `#e2f3ff` |
| `--element-water-text` | `#0574a6` |
| `--element-wood` | `#2c9647` |
| `--element-wood-subtle` | `#e3f6e5` |
| `--element-wood-text` | `#187e36` |
| `--element-light` | `#a47f00` |
| `--element-light-subtle` | `#f9f0da` |
| `--element-light-text` | `#876904` |
| `--element-dark` | `#956ed2` |
| `--element-dark-subtle` | `#f2edfe` |
| `--element-dark-text` | `#7d5ab5` |
| `--element-none` | `#696765` |
| `--element-none-subtle` | `#e9e7e5` |
| `--element-none-text` | `#4d4b49` |
| `--viz-atk` | `#eb6834` |
| `--viz-skill` | `#1baf7a` |
| `--viz-amp` | `#eda100` |
| `--viz-recv` | `#e87ba4` |
| `--viz-elem` | `#008300` |

## dark

| 쌍 | 전경 | 배경 | 대비 | 기준 | 판정 |
|---|---|---|---|---|---|
| accent cobalt: 어두운 글씨/solid | `#100f0e` | `#72aaf2` | 7.98 | 4.5 | ✓ |
| accent cobalt: solid 링/surface | `#72aaf2` | `#191817` | 7.39 | 3.0 | ✓ |
| accent cobalt: solid 링/selected | `#72aaf2` | `#2b2a29` | 5.97 | 3.0 | ✓ |
| accent cobalt: text/canvas | `#6fa7ee` | `#100f0e` | 7.69 | 4.5 | ✓ |
| accent azure: 어두운 글씨/solid | `#100f0e` | `#5cb0ec` | 8.09 | 4.5 | ✓ |
| accent azure: solid 링/surface | `#5cb0ec` | `#191817` | 7.49 | 3.0 | ✓ |
| accent azure: solid 링/selected | `#5cb0ec` | `#2b2a29` | 6.06 | 3.0 | ✓ |
| accent azure: text/canvas | `#59ade9` | `#100f0e` | 7.82 | 4.5 | ✓ |
| accent indigo-less: 어두운 글씨/solid | `#100f0e` | `#84a5f3` | 7.89 | 4.5 | ✓ |
| accent indigo-less: solid 링/surface | `#84a5f3` | `#191817` | 7.31 | 3.0 | ✓ |
| accent indigo-less: solid 링/selected | `#84a5f3` | `#2b2a29` | 5.91 | 3.0 | ✓ |
| accent indigo-less: text/canvas | `#81a2f0` | `#100f0e` | 7.62 | 4.5 | ✓ |
| status danger: text/canvas | `#e6867b` | `#100f0e` | 7.35 | 4.5 | ✓ |
| status danger: 어두운 글씨/solid | `#100f0e` | `#eb8278` | 7.29 | 4.5 | ✓ |
| status success: text/canvas | `#66ba7f` | `#100f0e` | 8.11 | 4.5 | ✓ |
| status success: 어두운 글씨/solid | `#100f0e` | `#5ebc7b` | 8.17 | 4.5 | ✓ |
| status warning: text/canvas | `#d6954a` | `#100f0e` | 7.53 | 4.5 | ✓ |
| status warning: 어두운 글씨/solid | `#100f0e` | `#da943f` | 7.56 | 4.5 | ✓ |
| element fire 점/selected | `#c46857` | `#2b2a29` | 3.73 | 3.0 | ✓ |
| element fire 테두리/surface | `#c46857` | `#191817` | 4.61 | 3.0 | ✓ |
| element fire text/subtle | `#e18a79` | `#3a211c` | 5.74 | 4.5 | ✓ |
| element fire text/canvas | `#e18a79` | `#100f0e` | 7.40 | 4.5 | ✓ |
| element water 점/selected | `#2d8fc6` | `#2b2a29` | 3.99 | 3.0 | ✓ |
| element water 테두리/surface | `#2d8fc6` | `#191817` | 4.94 | 3.0 | ✓ |
| element water text/subtle | `#5baee1` | `#142c3a` | 5.92 | 4.5 | ✓ |
| element water text/canvas | `#5baee1` | `#100f0e` | 7.83 | 4.5 | ✓ |
| element wood 점/selected | `#4e9a5b` | `#2b2a29` | 4.16 | 3.0 | ✓ |
| element wood 테두리/surface | `#4e9a5b` | `#191817` | 5.15 | 3.0 | ✓ |
| element wood text/subtle | `#73b87d` | `#1b2e1e` | 6.10 | 4.5 | ✓ |
| element wood text/canvas | `#73b87d` | `#100f0e` | 8.10 | 4.5 | ✓ |
| element light 점/selected | `#a48118` | `#2b2a29` | 3.91 | 3.0 | ✓ |
| element light 테두리/surface | `#a48118` | `#191817` | 4.84 | 3.0 | ✓ |
| element light text/subtle | `#c1a04c` | `#312810` | 5.83 | 4.5 | ✓ |
| element light text/canvas | `#c1a04c` | `#100f0e` | 7.66 | 4.5 | ✓ |
| element dark 점/selected | `#9274c3` | `#2b2a29` | 3.76 | 3.0 | ✓ |
| element dark 테두리/surface | `#9274c3` | `#191817` | 4.65 | 3.0 | ✓ |
| element dark text/subtle | `#af95df` | `#2c243a` | 5.76 | 4.5 | ✓ |
| element dark text/canvas | `#af95df` | `#100f0e` | 7.47 | 4.5 | ✓ |
| text-primary/surface | `#ecebea` | `#191817` | 14.89 | 7.0 | ✓ |
| text-secondary/selected | `#b8b7b6` | `#2b2a29` | 7.15 | 4.5 | ✓ |
| text-tertiary/selected | `#939291` | `#2b2a29` | 4.61 | 4.5 | ✓ |
| border-strong/surface | `#6e6d6c` | `#191817` | 3.43 | 3.0 | ✓ |
| border-strong/overlay | `#6e6d6c` | `#252423` | 3.00 | 3.0 | ✓ |
| text-inverse/bg-inverse | `#100f0e` | `#efeeed` | 16.52 | 4.5 | ✓ |

### 전체 값

| 토큰 | hex |
|---|---|
| `--bg-canvas` | `#100f0e` |
| `--bg-surface` | `#191817` |
| `--bg-subtle` | `#21201f` |
| `--bg-selected` | `#2b2a29` |
| `--bg-overlay` | `#252423` |
| `--bg-inverse` | `#efeeed` |
| `--border-subtle` | `#272625` |
| `--border-default` | `#333332` |
| `--border-strong` | `#6e6d6c` |
| `--text-primary` | `#ecebea` |
| `--text-secondary` | `#b8b7b6` |
| `--text-tertiary` | `#939291` |
| `--text-disabled` | `#5e5d5c` |
| `--text-inverse` | `#100f0e` |
| `--accent-cobalt-solid` | `#72aaf2` |
| `--accent-cobalt-hover` | `#86bafe` |
| `--accent-cobalt-active` | `#9dc7fe` |
| `--accent-cobalt-text` | `#6fa7ee` |
| `--accent-cobalt-subtle` | `#162232` |
| `--accent-cobalt-muted` | `#1d3451` |
| `--accent-azure-solid` | `#5cb0ec` |
| `--accent-azure-hover` | `#6cc0fd` |
| `--accent-azure-active` | `#8accfe` |
| `--accent-azure-text` | `#59ade9` |
| `--accent-azure-subtle` | `#122431` |
| `--accent-azure-muted` | `#12364f` |
| `--accent-indigo-less-solid` | `#84a5f3` |
| `--accent-indigo-less-hover` | `#96b6fe` |
| `--accent-indigo-less-active` | `#a9c3fe` |
| `--accent-indigo-less-text` | `#81a2f0` |
| `--accent-indigo-less-subtle` | `#1a2133` |
| `--accent-indigo-less-muted` | `#243251` |
| `--status-danger-solid` | `#eb8278` |
| `--status-danger-text` | `#e6867b` |
| `--status-danger-subtle` | `#2f1c1a` |
| `--status-success-solid` | `#5ebc7b` |
| `--status-success-text` | `#66ba7f` |
| `--status-success-subtle` | `#16261a` |
| `--status-warning-solid` | `#da943f` |
| `--status-warning-text` | `#d6954a` |
| `--status-warning-subtle` | `#2b1f12` |
| `--element-fire` | `#c46857` |
| `--element-fire-subtle` | `#3a211c` |
| `--element-fire-text` | `#e18a79` |
| `--element-water` | `#2d8fc6` |
| `--element-water-subtle` | `#142c3a` |
| `--element-water-text` | `#5baee1` |
| `--element-wood` | `#4e9a5b` |
| `--element-wood-subtle` | `#1b2e1e` |
| `--element-wood-text` | `#73b87d` |
| `--element-light` | `#a48118` |
| `--element-light-subtle` | `#312810` |
| `--element-light-text` | `#c1a04c` |
| `--element-dark` | `#9274c3` |
| `--element-dark-subtle` | `#2c243a` |
| `--element-dark-text` | `#af95df` |
| `--element-none` | `#939291` |
| `--element-none-subtle` | `#2b2a29` |
| `--element-none-text` | `#b8b7b6` |
| `--viz-atk` | `#d95926` |
| `--viz-skill` | `#199e70` |
| `--viz-amp` | `#c98500` |
| `--viz-recv` | `#d55181` |
| `--viz-elem` | `#008300` |
