/**
 * CSV Import Service
 *
 * 从 CSV 文件导入交易记录，自动创建 Obsidian 笔记
 * 支持多种 CSV 格式：TradingView, MetaTrader, 通用格式
 */

import type { App, TFile, TFolder } from "obsidian";
import type { TradeRecord, TradeOutcome, AccountType } from "../core/contracts";

// ============================================================
// Types
// ============================================================

export type CSVFormat = "auto" | "tradingview" | "metatrader" | "generic" | "custom";

export interface CSVColumnMapping {
  date?: string;
  time?: string;
  datetime?: string;
  symbol?: string;
  direction?: string;
  entryPrice?: string;
  exitPrice?: string;
  stopLoss?: string;
  takeProfit?: string;
  quantity?: string;
  pnl?: string;
  commission?: string;
  notes?: string;
}

export interface CSVImportOptions {
  format: CSVFormat;
  customMapping?: CSVColumnMapping;
  targetFolder: string;
  accountType: AccountType;
  defaultTicker?: string;
  dateFormat?: string;
  delimiter?: string;
  skipHeader?: boolean;
  templatePath?: string;
}

export interface CSVParseResult {
  success: boolean;
  trades: ParsedTrade[];
  errors: string[];
  warnings: string[];
}

export interface ParsedTrade {
  date: string;
  time?: string;
  symbol: string;
  direction: "Long" | "Short";
  entryPrice: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  quantity?: number;
  pnl?: number;
  commission?: number;
  notes?: string;
  rawRow: Record<string, string>;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  createdFiles: string[];
}

// ============================================================
// Column Mappings for Known Formats
// ============================================================

const TRADINGVIEW_MAPPING: CSVColumnMapping = {
  datetime: "Date/Time",
  symbol: "Symbol",
  direction: "Side",
  entryPrice: "Entry Price",
  exitPrice: "Exit Price",
  quantity: "Qty",
  pnl: "Profit",
  commission: "Commission",
};

const METATRADER_MAPPING: CSVColumnMapping = {
  datetime: "Time",
  symbol: "Symbol",
  direction: "Type",
  entryPrice: "Price",
  quantity: "Volume",
  pnl: "Profit",
  commission: "Commission",
  stopLoss: "S/L",
  takeProfit: "T/P",
};

const GENERIC_MAPPING: CSVColumnMapping = {
  date: "date",
  time: "time",
  symbol: "symbol",
  direction: "direction",
  entryPrice: "entry",
  exitPrice: "exit",
  stopLoss: "stop",
  takeProfit: "target",
  quantity: "size",
  pnl: "pnl",
  notes: "notes",
};

// ============================================================
// CSV Parser
// ============================================================

/**
 * Parse CSV string into rows
 */
function parseCSVString(csvContent: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  const lines = csvContent.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;

    const row: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Detect CSV format from headers
 */
function detectFormat(headers: string[]): CSVFormat {
  const headerSet = new Set(headers.map((h) => h.toLowerCase()));

  // TradingView format
  if (headerSet.has("date/time") && headerSet.has("entry price")) {
    return "tradingview";
  }

  // MetaTrader format
  if (headerSet.has("ticket") || (headerSet.has("time") && headerSet.has("type") && headerSet.has("volume"))) {
    return "metatrader";
  }

  // Generic format
  if (headerSet.has("date") && headerSet.has("symbol")) {
    return "generic";
  }

  return "generic";
}

/**
 * Get column mapping for format
 */
function getMapping(format: CSVFormat, customMapping?: CSVColumnMapping): CSVColumnMapping {
  switch (format) {
    case "tradingview":
      return TRADINGVIEW_MAPPING;
    case "metatrader":
      return METATRADER_MAPPING;
    case "custom":
      return customMapping || GENERIC_MAPPING;
    default:
      return GENERIC_MAPPING;
  }
}

/**
 * Find column index by name (case-insensitive)
 */
function findColumnIndex(headers: string[], columnName: string | undefined): number {
  if (!columnName) return -1;
  const lowerName = columnName.toLowerCase();
  return headers.findIndex((h) => h.toLowerCase() === lowerName);
}

/**
 * Parse direction string
 */
function parseDirection(value: string): "Long" | "Short" {
  const lower = value.toLowerCase();
  if (lower.includes("buy") || lower.includes("long") || lower === "b") {
    return "Long";
  }
  return "Short";
}

/**
 * Parse date string
 */
function parseDate(dateStr: string, timeStr?: string): { date: string; time?: string } {
  // Try to parse various date formats
  const cleanDate = dateStr.replace(/['"]/g, "").trim();
  const cleanTime = timeStr?.replace(/['"]/g, "").trim();

  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(cleanDate)) {
    const parts = cleanDate.split(/[T\s]/);
    return { date: parts[0], time: cleanTime || parts[1] };
  }

  // MM/DD/YYYY format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(cleanDate)) {
    const [month, day, year] = cleanDate.split(/[\/\s]/);
    const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return { date: isoDate, time: cleanTime };
  }

  // DD/MM/YYYY format (European)
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(cleanDate)) {
    const [day, month, year] = cleanDate.split(/\./);
    const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return { date: isoDate, time: cleanTime };
  }

  // Fallback: try Date.parse
  const parsed = new Date(cleanDate + (cleanTime ? " " + cleanTime : ""));
  if (!isNaN(parsed.getTime())) {
    return {
      date: parsed.toISOString().split("T")[0],
      time: cleanTime || parsed.toTimeString().split(" ")[0],
    };
  }

  return { date: cleanDate, time: cleanTime };
}

/**
 * Parse numeric value
 */
function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const clean = value.replace(/[,$\s'"]/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? undefined : num;
}

// ============================================================
// Main Functions
// ============================================================

/**
 * Parse CSV content into trade records
 */
export function parseCSV(
  csvContent: string,
  options: Partial<CSVImportOptions> = {}
): CSVParseResult {
  const result: CSVParseResult = {
    success: true,
    trades: [],
    errors: [],
    warnings: [],
  };

  try {
    const delimiter = options.delimiter || ",";
    const rows = parseCSVString(csvContent, delimiter);

    if (rows.length < 2) {
      result.errors.push("CSV 文件至少需要包含表头和一行数据");
      result.success = false;
      return result;
    }

    const headers = rows[0];
    const format = options.format === "auto" ? detectFormat(headers) : options.format || "generic";
    const mapping = getMapping(format, options.customMapping);

    // Find column indices
    const dateIdx = findColumnIndex(headers, mapping.datetime || mapping.date);
    const timeIdx = mapping.time ? findColumnIndex(headers, mapping.time) : -1;
    const symbolIdx = findColumnIndex(headers, mapping.symbol);
    const directionIdx = findColumnIndex(headers, mapping.direction);
    const entryPriceIdx = findColumnIndex(headers, mapping.entryPrice);
    const exitPriceIdx = findColumnIndex(headers, mapping.exitPrice);
    const stopLossIdx = findColumnIndex(headers, mapping.stopLoss);
    const takeProfitIdx = findColumnIndex(headers, mapping.takeProfit);
    const quantityIdx = findColumnIndex(headers, mapping.quantity);
    const pnlIdx = findColumnIndex(headers, mapping.pnl);
    const commissionIdx = findColumnIndex(headers, mapping.commission);
    const notesIdx = findColumnIndex(headers, mapping.notes);

    // Validate required columns
    if (dateIdx === -1) {
      result.errors.push("找不到日期列");
      result.success = false;
      return result;
    }

    // Parse data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every((cell) => !cell.trim())) continue;

      try {
        const rawRow: Record<string, string> = {};
        headers.forEach((h, idx) => {
          rawRow[h] = row[idx] || "";
        });

        const { date, time } = parseDate(
          row[dateIdx] || "",
          timeIdx >= 0 ? row[timeIdx] : undefined
        );

        const trade: ParsedTrade = {
          date,
          time,
          symbol: row[symbolIdx] || options.defaultTicker || "UNKNOWN",
          direction: directionIdx >= 0 ? parseDirection(row[directionIdx]) : "Long",
          entryPrice: parseNumber(row[entryPriceIdx]) || 0,
          exitPrice: parseNumber(row[exitPriceIdx]),
          stopLoss: stopLossIdx >= 0 ? parseNumber(row[stopLossIdx]) : undefined,
          takeProfit: takeProfitIdx >= 0 ? parseNumber(row[takeProfitIdx]) : undefined,
          quantity: quantityIdx >= 0 ? parseNumber(row[quantityIdx]) : undefined,
          pnl: pnlIdx >= 0 ? parseNumber(row[pnlIdx]) : undefined,
          commission: commissionIdx >= 0 ? parseNumber(row[commissionIdx]) : undefined,
          notes: notesIdx >= 0 ? row[notesIdx] : undefined,
          rawRow,
        };

        if (!trade.date) {
          result.warnings.push(`行 ${i + 1}: 无效的日期格式`);
          continue;
        }

        result.trades.push(trade);
      } catch (err) {
        result.warnings.push(`行 ${i + 1}: 解析失败 - ${(err as Error).message}`);
      }
    }

    if (result.trades.length === 0) {
      result.errors.push("没有成功解析任何交易记录");
      result.success = false;
    }
  } catch (err) {
    result.errors.push(`CSV 解析错误: ${(err as Error).message}`);
    result.success = false;
  }

  return result;
}

/**
 * Generate trade note content from parsed trade
 */
export function generateTradeNote(
  trade: ParsedTrade,
  options: Partial<CSVImportOptions> = {}
): string {
  const outcome: TradeOutcome = trade.pnl
    ? trade.pnl > 0
      ? "win"
      : trade.pnl < 0
      ? "loss"
      : "scratch"
    : "unknown";

  const timeStr = trade.time ? trade.time.replace(/:/g, "") : "0000";
  const dateStr = trade.date.replace(/-/g, "");

  let content = `---
date: ${trade.date}
time: "${trade.time || ""}"
ticker: ${trade.symbol}
account_type: ${options.accountType || "Live"}
direction: ${trade.direction}
entry_price: ${trade.entryPrice}
${trade.exitPrice !== undefined ? `exit_price: ${trade.exitPrice}` : ""}
${trade.stopLoss !== undefined ? `stop_loss: ${trade.stopLoss}` : ""}
${trade.takeProfit !== undefined ? `take_profit: ${trade.takeProfit}` : ""}
${trade.quantity !== undefined ? `position_size: ${trade.quantity}` : ""}
${trade.pnl !== undefined ? `pnl: ${trade.pnl}` : ""}
${trade.commission !== undefined ? `commission: ${trade.commission}` : ""}
outcome: ${outcome}
tags:
  - PA/Trade
  - import/csv
---

# ${trade.symbol} ${trade.direction} - ${trade.date}

## 交易概述
- **品种**: ${trade.symbol}
- **方向**: ${trade.direction}
- **入场价**: ${trade.entryPrice}
${trade.exitPrice !== undefined ? `- **出场价**: ${trade.exitPrice}` : ""}
${trade.stopLoss !== undefined ? `- **止损**: ${trade.stopLoss}` : ""}
${trade.takeProfit !== undefined ? `- **止盈**: ${trade.takeProfit}` : ""}
${trade.pnl !== undefined ? `- **盈亏**: ${trade.pnl}` : ""}

## 市场分析
> 待补充

## 入场理由
> 待补充

## 出场理由
> 待补充

## 复盘总结
${trade.notes ? `> ${trade.notes}` : "> 待补充"}

---
*从 CSV 导入: ${new Date().toISOString()}*
`;

  // Clean up empty lines in frontmatter
  content = content.replace(/\n{2,}(?=---)/g, "\n");

  return content;
}

/**
 * Import trades to Obsidian vault
 */
export async function importTradesToVault(
  app: App,
  trades: ParsedTrade[],
  options: CSVImportOptions
): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    imported: 0,
    skipped: 0,
    errors: [],
    createdFiles: [],
  };

  // Ensure target folder exists
  const targetFolder = options.targetFolder || "Daily/Trades";
  let folder = app.vault.getAbstractFileByPath(targetFolder);

  if (!folder) {
    try {
      await app.vault.createFolder(targetFolder);
      folder = app.vault.getAbstractFileByPath(targetFolder);
    } catch (err) {
      result.errors.push(`无法创建目标文件夹: ${targetFolder}`);
      result.success = false;
      return result;
    }
  }

  // Import each trade
  for (const trade of trades) {
    try {
      // Generate filename: YYMMDD_HHMM_accountType_symbol.md
      const dateStr = trade.date.replace(/-/g, "").slice(2); // YYMMDD
      const timeStr = (trade.time || "0000").replace(/:/g, "").slice(0, 4); // HHMM
      const accountType = options.accountType === "Live" ? "实盘" : options.accountType === "Demo" ? "模拟" : "回测";
      const filename = `${dateStr}_${timeStr}_${accountType}_${trade.symbol}.md`;
      const filepath = `${targetFolder}/${filename}`;

      // Check if file already exists
      const existingFile = app.vault.getAbstractFileByPath(filepath);
      if (existingFile) {
        result.skipped++;
        result.errors.push(`跳过已存在的文件: ${filename}`);
        continue;
      }

      // Generate note content
      const content = generateTradeNote(trade, options);

      // Create file
      await app.vault.create(filepath, content);
      result.imported++;
      result.createdFiles.push(filepath);
    } catch (err) {
      result.errors.push(`导入失败 (${trade.date} ${trade.symbol}): ${(err as Error).message}`);
    }
  }

  if (result.imported === 0 && trades.length > 0) {
    result.success = false;
  }

  return result;
}

/**
 * Preview CSV import without actually creating files
 */
export function previewCSVImport(
  csvContent: string,
  options: Partial<CSVImportOptions> = {}
): {
  parseResult: CSVParseResult;
  previewNotes: Array<{ filename: string; content: string }>;
} {
  const parseResult = parseCSV(csvContent, options);
  const previewNotes: Array<{ filename: string; content: string }> = [];

  if (parseResult.success) {
    parseResult.trades.slice(0, 5).forEach((trade) => {
      const dateStr = trade.date.replace(/-/g, "").slice(2);
      const timeStr = (trade.time || "0000").replace(/:/g, "").slice(0, 4);
      const accountType = options.accountType === "Live" ? "实盘" : options.accountType === "Demo" ? "模拟" : "回测";
      const filename = `${dateStr}_${timeStr}_${accountType}_${trade.symbol}.md`;
      const content = generateTradeNote(trade, options);

      previewNotes.push({ filename, content });
    });
  }

  return { parseResult, previewNotes };
}

/**
 * Get supported CSV formats
 */
export function getSupportedFormats(): Array<{ id: CSVFormat; name: string; description: string }> {
  return [
    { id: "auto", name: "自动检测", description: "根据列名自动识别格式" },
    { id: "tradingview", name: "TradingView", description: "TradingView 导出格式" },
    { id: "metatrader", name: "MetaTrader", description: "MT4/MT5 导出格式" },
    { id: "generic", name: "通用格式", description: "标准 CSV 格式" },
    { id: "custom", name: "自定义", description: "自定义列映射" },
  ];
}
