/**
 * FrontmatterUpdater - Frontmatter更新器
 * 
 * 负责安全地读写Markdown文件的Frontmatter
 */

import type { App } from "obsidian";
import { parseYaml, stringifyYaml } from "obsidian";
import type { SchemaValidator } from "./schema-validator";

export class FrontmatterUpdater {
    private app: App;
    private validator: SchemaValidator;

    constructor(app: App, validator: SchemaValidator) {
        this.app = app;
        this.validator = validator;
    }

    /**
     * 解析Frontmatter
     */
    parseFrontmatter(content: string): {
        frontmatter: Record<string, unknown>;
        body: string;
    } {
        // 1. 检查是否有frontmatter
        if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
            return { frontmatter: {}, body: content };
        }

        // 2. 找到结束标记
        const lines = content.split('\n');
        let endIndex = -1;

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                endIndex = i;
                break;
            }
        }

        if (endIndex === -1) {
            return { frontmatter: {}, body: content };
        }

        // 3. 提取frontmatter部分
        const fmLines = lines.slice(1, endIndex);
        const fmText = fmLines.join('\n');
        const bodyLines = lines.slice(endIndex + 1);
        const body = bodyLines.join('\n');

        // 4. 解析YAML (使用Obsidian的API)
        try {
            const frontmatter = parseYaml(fmText) || {};
            return { frontmatter, body };
        } catch (e) {
            console.error('Failed to parse frontmatter:', e);
            return { frontmatter: {}, body: content };
        }
    }

    /**
     * 序列化Frontmatter
     */
    serializeFrontmatter(
        frontmatter: Record<string, unknown>,
        body: string
    ): string {
        // 1. 如果frontmatter为空，只返回body
        if (Object.keys(frontmatter).length === 0) {
            return body;
        }

        // 2. 序列化frontmatter为YAML (使用Obsidian的API)
        try {
            const fmText = stringifyYaml(frontmatter);

            // 3. 组合frontmatter和body
            // 确保body前面有换行符
            const bodyWithNewline = body.startsWith('\n') ? body : '\n' + body;
            return `---\n${fmText}---${bodyWithNewline}`;
        } catch (e) {
            console.error('Failed to serialize frontmatter:', e);
            // 如果序列化失败，返回原始body
            return body;
        }
    }

    /**
     * 应用更新 (使用规范名称)
     */
    applyUpdates(
        frontmatter: Record<string, unknown>,
        updates: Record<string, unknown>
    ): Record<string, unknown> {
        const result = { ...frontmatter };

        for (const [key, value] of Object.entries(updates)) {
            const schema = this.validator.getFieldSchema(key);

            if (schema) {
                // 使用规范名称
                result[schema.canonicalName] = value;

                // 删除旧的别名 (避免重复)
                for (const alias of schema.aliases || []) {
                    if (alias !== schema.canonicalName && alias in result) {
                        delete result[alias];
                    }
                }
            } else {
                // 未定义的字段，保持原样
                result[key] = value;
            }
        }

        return result;
    }
}
