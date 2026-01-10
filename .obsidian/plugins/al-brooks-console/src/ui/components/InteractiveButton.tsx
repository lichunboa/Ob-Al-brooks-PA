
import * as React from "react";

export type InteractionVariant = "text" | "mini-cell" | "cover" | "lift";

interface InteractiveButtonProps extends React.ComponentProps<"button"> {
    interaction?: InteractionVariant;
}

export const InteractiveButton: React.FC<InteractiveButtonProps> = ({
    interaction,
    className,
    children,
    ...props
}) => {
    // Map interaction to CSS class
    const getInteractionClass = () => {
        switch (interaction) {
            case "text": return "pa-btn--text";
            case "mini-cell": return "pa-btn--mini-cell";
            case "cover": return "pa-btn--cover";
            case "lift": return "pa-btn--lift";
            default: return "";
        }
    };

    const combinedClassName = `pa-btn ${getInteractionClass()} ${className || ""}`.trim();

    return (
        <button
            className={combinedClassName}
            {...props}
        >
            {children}
        </button>
    );
};
