import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Zod 是一个 TypeScript 优先的 schema 声明和验证库。
 * 
 * 在 LangChain Tool 中的作用：
 * 1. 定义工具参数的结构（schema） - 告诉 LLM 这个工具需要哪些参数
 * 2. 参数类型校验 - 确保 LLM 传入的参数类型正确
 * 3. 参数描述 - 通过 .describe() 为每个参数添加说明，帮助 LLM 理解如何使用
 * 
 * 示例：
 * z.object({
 *   date: z.string().describe('日期参数'),      // 必填字符串
 *   count: z.number().optional().describe('数量') // 可选数字
 * })
 */
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import weekday from 'dayjs/plugin/weekday';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

// 配置 dayjs
dayjs.locale('zh-cn');
dayjs.extend(weekday);
dayjs.extend(relativeTime);
dayjs.extend(duration);

/**
 * 获取当前时间工具
 */
export const getCurrentTimeTool = tool(
  async () => {
    const now = dayjs();
    return JSON.stringify({
      datetime: now.format('YYYY-MM-DD HH:mm:ss'),
      date: now.format('YYYY-MM-DD'),
      time: now.format('HH:mm:ss'),
      weekday: now.format('dddd'),
      timestamp: now.valueOf(),
    });
  },
  {
    name: 'get_current_time',
    description: '获取当前的日期和时间，包括年月日、时分秒、星期几',
  }
);

/**
 * 获取指定日期是星期几的工具
 */
export const getWeekdayTool = tool(
  async ({ date }) => {
    const d = dayjs(date);
    if (!d.isValid()) {
      return `无效的日期格式: ${date}`;
    }
    return JSON.stringify({
      date: d.format('YYYY-MM-DD'),
      weekday: d.format('dddd'),
      weekdayNumber: d.day(), // 0-6, 0 是周日
    });
  },
  {
    name: 'get_weekday',
    description: '获取指定日期是星期几。输入日期格式如 2024-01-15 或 2024/01/15',
    schema: z.object({
      date: z.string().describe('要查询的日期，格式如 2024-01-15'),
    }),
  }
);

/**
 * 计算两个日期之间的间隔工具
 */
export const getDateDiffTool = tool(
  async ({ startDate, endDate }) => {
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    
    if (!start.isValid()) {
      return `无效的开始日期格式: ${startDate}`;
    }
    if (!end.isValid()) {
      return `无效的结束日期格式: ${endDate}`;
    }

    const diffDays = end.diff(start, 'day');
    const diffMonths = end.diff(start, 'month');
    const diffYears = end.diff(start, 'year');
    const diffHours = end.diff(start, 'hour');

    return JSON.stringify({
      startDate: start.format('YYYY-MM-DD'),
      endDate: end.format('YYYY-MM-DD'),
      diff: {
        days: diffDays,
        months: diffMonths,
        years: diffYears,
        hours: diffHours,
      },
      humanReadable: start.to(end, true), // 例如 "3 天" 或 "2 个月"
    });
  },
  {
    name: 'get_date_diff',
    description: '计算两个日期之间相隔多少天、月、年。可用于计算距离某个日子还有多久，或者两个日期间隔多长时间',
    schema: z.object({
      startDate: z.string().describe('开始日期，格式如 2024-01-15'),
      endDate: z.string().describe('结束日期，格式如 2024-12-31'),
    }),
  }
);

/**
 * 日期加减计算工具
 */
export const addToDateTool = tool(
  async ({ date, amount, unit }) => {
    const d = dayjs(date);
    if (!d.isValid()) {
      return `无效的日期格式: ${date}`;
    }

    const result = d.add(amount, unit as dayjs.ManipulateType);
    return JSON.stringify({
      originalDate: d.format('YYYY-MM-DD'),
      operation: `${amount > 0 ? '+' : ''}${amount} ${unit}`,
      resultDate: result.format('YYYY-MM-DD'),
      resultWeekday: result.format('dddd'),
    });
  },
  {
    name: 'add_to_date',
    description: '对日期进行加减计算，例如计算 30 天后是哪天，或者 2 个月前是哪天',
    schema: z.object({
      date: z.string().describe('基准日期，格式如 2024-01-15，或使用 "today" 表示今天'),
      amount: z.number().describe('要加减的数量，正数为加，负数为减'),
      unit: z.enum(['day', 'week', 'month', 'year']).describe('时间单位：day/week/month/year'),
    }),
  }
);

/**
 * 导出所有时间工具
 */
export const timeTools = [
  getCurrentTimeTool,
  getWeekdayTool,
  getDateDiffTool,
  addToDateTool,
];
