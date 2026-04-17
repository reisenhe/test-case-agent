# Quality Analysis Skill

---
name: quality-analysis
description: 分析测试用例集的覆盖率和分布，提供质量报告和改进建议
allowed_tools: read_file
---

# Quality Analysis Skill

## 功能

对生成的测试用例集进行质量分析：

1. **覆盖率分析**
   - 有效等价类覆盖率 (目标: 95%)
   - 无效等价类覆盖率 (目标: 80%)
   - 边界值覆盖率 (目标: 90%)

2. **分布分析**
   - P1-P5 优先级分布
   - 类型分布（正向/逆向/边界/性能/安全）

3. **缺失检测**
   - 未覆盖的功能点
   - 缺失的异常场景
   - 遗漏的边界条件

4. **改进建议**
   - 针对性补充用例建议
   - 优先级调整建议

## 何时使用

- 测试用例生成完成后，自动进行质量分析
- 用户请求查看质量报告时
- 需要识别测试覆盖缺口时

## 分析方法

### 1. 覆盖率计算

**有效等价类覆盖率**：
```
有效等价类覆盖率 = 有正向用例的功能点数 / 总功能点数
```

**无效等价类覆盖率**：
```
无效等价类覆盖率 = 有逆向用例的异常功能点数 / 异常处理类功能点数
```

**边界值覆盖率**：
```
边界值覆盖率 = 有边界用例的边界功能点数 / 边界条件类功能点数
```

### 2. 优先级分布分析

目标分布：
| 优先级 | 目标占比 | 允许偏差 |
|--------|----------|----------|
| P1 | 27% | ±5% |
| P2 | 20% | ±5% |
| P3 | 33% | ±5% |
| P4 | 16% | ±5% |
| P5 | 4% | ±3% |

### 3. 质量缺口检测

检测以下情况：
- 功能点无任何用例覆盖
- 正向功能缺少 P1/P2 用例
- 边界条件缺少边界值测试
- 异常处理缺少逆向用例
- 安全相关缺少安全用例

## 输出格式

```json
{
  "summary": {
    "total_cases": 75,
    "total_features": 25,
    "avg_cases_per_feature": 3.0,
    "features_covered": 25,
    "features_uncovered": 0
  },
  "coverage": {
    "valid_equivalence": 0.95,
    "invalid_equivalence": 0.82,
    "boundary_value": 0.88
  },
  "coverage_targets": {
    "valid_equivalence": {"current": "95%", "target": "95%", "met": true},
    "invalid_equivalence": {"current": "82%", "target": "80%", "met": true},
    "boundary_value": {"current": "88%", "target": "90%", "met": false}
  },
  "priority_distribution": {
    "P1": {"count": 20, "percentage": "27%", "target": "~27%"},
    "P2": {"count": 15, "percentage": "20%", "target": "~20%"},
    "P3": {"count": 25, "percentage": "33%", "target": "~33%"},
    "P4": {"count": 12, "percentage": "16%", "target": "~16%"},
    "P5": {"count": 3, "percentage": "4%", "target": "~4%"}
  },
  "type_distribution": {
    "positive": 35,
    "negative": 25,
    "boundary": 12,
    "performance": 2,
    "security": 1
  },
  "gaps": [
    {
      "feature_id": "FP-005",
      "feature_name": "密码长度验证",
      "issue": "缺少边界值测试",
      "severity": "high",
      "suggestion": "添加密码最大长度和最小长度的边界测试用例"
    },
    {
      "feature_id": "FP-012",
      "feature_name": "网络请求处理",
      "issue": "缺少网络超时异常测试",
      "severity": "medium",
      "suggestion": "添加网络超时和连接失败的异常处理用例"
    }
  ],
  "recommendations": [
    "建议为 FP-005 添加最大长度边界测试 (P4)",
    "建议为 FP-012 添加网络超时异常测试 (P3)",
    "边界值覆盖率 88% 低于目标 90%，建议补充边界条件测试"
  ],
  "score": 85.5
}
```

## 质量评分计算

综合质量评分 (0-100)：

```
评分 = 覆盖率得分 * 0.4 + 分布得分 * 0.3 + 完整性得分 * 0.3

其中：
- 覆盖率得分 = (有效等价类覆盖率 + 无效等价类覆盖率 + 边界值覆盖率) / 3 * 100
- 分布得分 = 100 - Σ(|实际占比 - 目标占比|) * 2
- 完整性得分 = (1 - 缺口数 / 总功能点数) * 100
```

## 改进建议生成规则

1. **高优先级建议** (severity: high)
   - 覆盖率未达标
   - 核心功能缺失用例
   - 安全相关缺失

2. **中优先级建议** (severity: medium)
   - 分布偏差较大
   - 异常处理缺失
   - 边界条件缺失

3. **低优先级建议** (severity: low)
   - 分布轻微偏差
   - 低频场景缺失
   - 可选功能缺失

## 示例

**输入**：75 个测试用例，25 个功能点

**分析过程**：
1. 计算每个功能点的用例覆盖情况
2. 统计各优先级用例数量
3. 检测未覆盖的测试场景
4. 生成改进建议

**输出**：质量报告 JSON，包含覆盖率、分布、缺口、建议
