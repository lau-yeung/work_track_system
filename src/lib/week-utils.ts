/**
 * 月度周划分工具
 *
 * 规则：
 * 1. 每周按 周一 ~ 周五（5 个工作日）作为一个周报周期。
 * 2. 若提供了 workStart/workEnd（管理员设置的本月工作期）：
 *    - 首周 = mondayOf(workStart)（workStart 回溯到所在周一）
 *    - 仅当 周一 <= workEnd 时入列；周归属唯一由该月配置窗口决定，杜绝跨月重复。
 * 3. 未提供配置（默认兜底）：一周归属本月当且仅当其周一所在月 === 目标月。
 *    （删除原"周五在本月且周一在上月"分支，消除 0831~0904 同周同时属 8 月和 9 月的 bug。）
 * 4. 周报日报数据取 [weekStart, weekEnd]（周一~周五）区间的 time_entries。
 */

export interface MonthWeek {
  weekIndex: number; // 1..N
  weekStart: string; // 周一 yyyy-mm-dd
  weekEnd: string; // 周五 yyyy-mm-dd
}

export interface WorkPeriod {
  workStart?: string; // yyyy-mm-dd
  workEnd?: string; // yyyy-mm-dd
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, days: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
};
const monthLinear = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const parseDate = (s: string) => {
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) throw new Error(`无效日期: ${s}`);
  return d;
};

/** 找到本月第一个工作日（周一~周五） */
function firstWorkdayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month - 1, 1);
  while (true) {
    const day = d.getDay(); // 0=Sun..6=Sat
    if (day >= 1 && day <= 5) return d;
    d.setDate(d.getDate() + 1);
  }
}

/** 给定日期，回溯到所在周的周一 */
function mondayOf(d: Date): Date {
  const day = d.getDay() || 7; // 周日=7
  return addDays(d, -(day - 1));
}

/**
 * 返回某年某月的所有周（周一~周五），weekIndex 从 1 开始。
 * @param period 可选：管理员设置的本月工作期 workStart/workEnd
 */
export function getMonthWeeks(year: number, month: number, period?: WorkPeriod): MonthWeek[] {
  const targetLinear = year * 12 + (month - 1);

  let cursor: Date;
  let hardStop: Date | null = null;

  if (period?.workStart && period?.workEnd) {
    // 有配置：从 workStart 回溯到的周一起，按周推进，周一 <= workEnd 才入列
    cursor = mondayOf(parseDate(period.workStart));
    hardStop = parseDate(period.workEnd);
  } else {
    // 无配置兜底：本月第一个工作日回溯到周一
    cursor = mondayOf(firstWorkdayOfMonth(year, month));
  }

  const weeks: MonthWeek[] = [];
  let idx = 1;
  while (idx <= 8) {
    if (hardStop && cursor > hardStop) break;

    const monLinear = monthLinear(cursor);
    if (!hardStop && monLinear > targetLinear) break;

    // 无配置时：周一必须在本月才归属（杜绝跨月重复）
    if (!hardStop && monLinear !== targetLinear) {
      cursor = addDays(cursor, 7);
      continue;
    }

    const friday = addDays(cursor, 4);
    weeks.push({
      weekIndex: idx,
      weekStart: fmt(cursor),
      weekEnd: fmt(friday),
    });
    idx++;
    cursor = addDays(cursor, 7);
  }

  return weeks;
}

/** 当前年月（Asia/Shanghai 时区下的本地年月） */
export function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

