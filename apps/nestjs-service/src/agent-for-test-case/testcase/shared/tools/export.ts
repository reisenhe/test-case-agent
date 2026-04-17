/**
 * Export tools for TestCase Agent (TypeScript port of shared/tools/export.py).
 *
 * Provides export functionality for test cases.
 * Note: These are utility functions called by the controller, not Agent tools.
 *
 * Excel export requires the 'xlsx' package:
 *   npm install xlsx
 * If not installed, JSON export is used as fallback.
 */

import * as fs from 'fs';
import * as path from 'path';

export type ExportFormat = 'excel' | 'xmind' | 'json';

/**
 * 导出测试用例（仅由 Controller 调用，非 Agent 工具）
 *
 * @param testCases  测试用例列表
 * @param format     导出格式（excel/xmind/json）
 * @param filename   文件名（不含扩展名）
 * @returns 导出文件路径
 */
export async function exportTestcases(
  testCases: Record<string, unknown>[],
  format: ExportFormat,
  filename: string,
): Promise<string> {
  if (!testCases || testCases.length === 0) {
    throw new Error('No test cases to export');
  }

  // 确保 exports 目录存在
  const exportsDir = path.resolve('exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  switch (format) {
    case 'excel':
      return exportExcel(testCases, filename, exportsDir);
    case 'xmind':
      return exportXmind(testCases, filename, exportsDir);
    case 'json':
      return exportJson(testCases, filename, exportsDir);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * 导出为 Excel
 *
 * Requires 'xlsx' package. Falls back to JSON if xlsx is not installed.
 */
async function exportExcel(
  testCases: Record<string, unknown>[],
  filename: string,
  exportsDir: string,
): Promise<string> {
  // 尝试动态 require xlsx（需要安装：npm install xlsx）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let xlsx: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    xlsx = require('xlsx');
  } catch {
    console.warn(
      '[Export] xlsx package not found, falling back to JSON. Install with: npm install xlsx',
    );
    return exportJson(testCases, `${filename}_excel_fallback`, exportsDir);
  }

  console.log(`[Export] Exporting ${testCases.length} test cases to Excel`);

  const headers = [
    '用例ID',
    '功能点ID',
    '标题',
    '类型',
    '优先级',
    '测试目的',
    '前置条件',
    '测试步骤',
    '预期结果',
    '标签',
  ];

  const rows: unknown[][] = [headers];

  for (const tc of testCases) {
    const steps = (tc.steps as Record<string, unknown>[] | undefined) ?? [];
    const stepsText = steps
      .map(
        (s, i) =>
          `${(s.step_no as number) ?? i + 1}. ${s.action ?? ''} (数据: ${s.test_data ?? ''})`,
      )
      .join('\n');

    const expectedResult = steps
      .map((s) => (s.expected_result as string) ?? '')
      .join('\n');

    const preconditions = ((tc.preconditions as string[] | undefined) ?? []).join('\n');
    const tags = ((tc.tags as string[] | undefined) ?? []).join(', ');

    rows.push([
      tc.id ?? '',
      tc.feature_point_id ?? '',
      tc.title ?? '',
      tc.type ?? '',
      tc.priority ?? '',
      tc.purpose ?? '',
      preconditions,
      stepsText,
      expectedResult,
      tags,
    ]);
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);

  // 调整列宽
  ws['!cols'] = headers.map(() => ({ wch: 20 }));

  xlsx.utils.book_append_sheet(wb, ws, '测试用例');

  const outputPath = path.join(exportsDir, `${filename}.xlsx`);
  xlsx.writeFile(wb, outputPath);

  console.log(`[Export] Excel saved to: ${outputPath}`);
  return outputPath;
}

/**
 * 导出为 JSON
 */
async function exportJson(
  testCases: Record<string, unknown>[],
  filename: string,
  exportsDir: string,
): Promise<string> {
  console.log(`[Export] Exporting ${testCases.length} test cases to JSON`);

  const outputPath = path.join(exportsDir, `${filename}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(testCases, null, 2), 'utf-8');

  console.log(`[Export] JSON saved to: ${outputPath}`);
  return outputPath;
}

/**
 * 导出为 XMind
 *
 * XMind 导出需要 xmind 库，目前使用 JSON 格式作为备选。
 */
async function exportXmind(
  testCases: Record<string, unknown>[],
  filename: string,
  exportsDir: string,
): Promise<string> {
  console.warn('[Export] XMind export not implemented, using JSON as fallback');
  return exportJson(testCases, `${filename}_xmind_fallback`, exportsDir);
}
