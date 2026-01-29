import * as React from "react";
import { Component, MarkdownRenderer } from "obsidian";

export const MarkdownBlock: React.FC<{ markdown: string; sourcePath?: string }> = ({
    markdown,
    sourcePath = "",
}) => {
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.innerHTML = "";

        const component = new Component();
        void MarkdownRenderer.renderMarkdown(markdown, el, sourcePath, component);
        return () => component.unload();
    }, [markdown, sourcePath]);

    return <div ref={ref} />;
};
