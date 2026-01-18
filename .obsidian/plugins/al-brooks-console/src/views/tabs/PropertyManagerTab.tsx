/**
 * PropertyManagerTab 属性管理器标签页
 *
 * 基于老版本 pa-view-manager.js V18 Crystal Edition 重构
 * 💎 上帝模式（属性管理器）
 */

import * as React from "react";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { PropertyCard } from "../components/property/PropertyCard";
import { PropertyInspector } from "../components/property/PropertyInspector";
import { PropertyManagerService, type PropertyGroup, type PropertyStats, type BatchOperation, type BatchResult } from "../../core/property-manager";

interface PropertyManagerTabProps {
    app: App;
}

export const PropertyManagerTab: React.FC<PropertyManagerTabProps> = ({ app }) => {
    const [groups, setGroups] = React.useState<PropertyGroup[]>([]);
    const [filteredGroups, setFilteredGroups] = React.useState<PropertyGroup[]>([]);
    const [searchTerm, setSearchTerm] = React.useState("");
    const [isLoading, setIsLoading] = React.useState(true);
    const [selectedProperty, setSelectedProperty] = React.useState<PropertyStats | null>(null);
    const [keyMap, setKeyMap] = React.useState<Record<string, string[]>>({});

    const serviceRef = React.useRef<PropertyManagerService | null>(null);

    // 初始化服务
    React.useEffect(() => {
        serviceRef.current = new PropertyManagerService(app);
        loadProperties();
    }, [app]);

    // 加载属性
    const loadProperties = async () => {
        setIsLoading(true);
        try {
            if (!serviceRef.current) return;

            const { keyMap: km, valMap } = await serviceRef.current.scanProperties();
            setKeyMap(km);

            const grouped = serviceRef.current.groupProperties(km, valMap);
            setGroups(grouped);
            setFilteredGroups(grouped);
        } catch (e) {
            console.error("[PropertyManager] 加载失败", e);
            new Notice("加载属性失败");
        } finally {
            setIsLoading(false);
        }
    };

    // 搜索过滤
    React.useEffect(() => {
        if (!serviceRef.current) return;
        const filtered = serviceRef.current.searchProperties(groups, searchTerm);
        setFilteredGroups(filtered);
    }, [searchTerm, groups]);

    // 批量操作
    const handleBatchUpdate = async (paths: string[], operation: BatchOperation): Promise<BatchResult> => {
        if (!serviceRef.current) {
            return { success: 0, failed: [] };
        }

        new Notice(`🚀 正在处理 ${paths.length} 个文件...`);

        const result = await serviceRef.current.batchUpdate(paths, operation);

        if (result.success > 0) {
            new Notice(`✅ 完成 ${result.success} 处修改`);
            await loadProperties();
        }

        if (result.failed.length > 0) {
            console.warn("[PropertyManager] 部分失败:", result.failed);
            new Notice(`⚠️ ${result.failed.length} 个文件处理失败`);
        }

        return result;
    };

    // 打开文件
    const handleOpenFile = (path: string) => {
        app.workspace.openLinkText(path, "", true);
    };

    // 统计
    const totalProperties = groups.reduce((sum, g) => sum + g.properties.length, 0);
    const totalValues = groups.reduce((sum, g) =>
        sum + g.properties.reduce((s, p) => s + p.valueCount, 0), 0
    );

    return (
        <div style={{ paddingBottom: "40px" }}>
            {/* 头部 - 使用 SectionHeader 统一风格 */}
            <SectionHeader
                title="上帝模式 (God Mode)"
                subtitle={`${totalProperties} 个属性 · ${totalValues} 个值`}
                icon="💎"
            />

            {/* 搜索栏 - 使用 GlassPanel */}
            <GlassPanel style={{ marginBottom: "16px", padding: "12px 16px" }}>
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px"
                }}>
                    <input
                        type="text"
                        placeholder="🔍 搜索属性..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            flex: 1,
                            background: "var(--background-modifier-form-field)",
                            border: "1px solid var(--background-modifier-border)",
                            color: "var(--text-normal)",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            outline: "none",
                            fontSize: "0.9em"
                        }}
                    />
                    <button
                        onClick={loadProperties}
                        style={{
                            background: "var(--background-modifier-form-field)",
                            border: "1px solid var(--background-modifier-border)",
                            color: "var(--text-muted)",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "0.9em"
                        }}
                        title="刷新"
                    >
                        🔄
                    </button>
                </div>
            </GlassPanel>

            {/* 加载中 */}
            {isLoading && (
                <div style={{
                    display: "flex",
                    justifyContent: "center",
                    padding: "40px",
                    color: "var(--text-muted)"
                }}>
                    正在扫描属性...
                </div>
            )}

            {/* 分组列表 */}
            {!isLoading && filteredGroups.map((group, gi) => (
                <div key={gi} style={{ marginBottom: "20px" }}>
                    {/* 分组标题 - 使用统一的底部边框样式 */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        margin: "12px 0 10px",
                        paddingBottom: "8px",
                        borderBottom: "1px solid var(--background-modifier-border)"
                    }}>
                        <span style={{ fontWeight: 700 }}>
                            {group.name}
                        </span>
                        <span style={{
                            background: "var(--background-modifier-form-field)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "0.8em",
                            color: "var(--text-muted)"
                        }}>
                            {group.properties.length}
                        </span>
                    </div>

                    {/* 属性网格 */}
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                        gap: "10px"
                    }}>
                        {group.properties.map((prop, pi) => (
                            <PropertyCard
                                key={pi}
                                property={prop}
                                onClick={() => setSelectedProperty(prop)}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {/* 无结果 */}
            {!isLoading && filteredGroups.length === 0 && (
                <div style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "var(--text-muted)"
                }}>
                    {searchTerm ? `没有找到匹配 "${searchTerm}" 的属性` : "没有找到属性"}
                </div>
            )}

            {/* Inspector 弹窗 */}
            {selectedProperty && (
                <PropertyInspector
                    property={selectedProperty}
                    allPaths={keyMap[selectedProperty.key] || []}
                    onClose={() => setSelectedProperty(null)}
                    onBatchUpdate={handleBatchUpdate}
                    onOpenFile={handleOpenFile}
                />
            )}
        </div>
    );
};
