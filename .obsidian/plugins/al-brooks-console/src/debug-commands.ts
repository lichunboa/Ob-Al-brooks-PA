
// Script to list all available commands in Obsidian
// Run this in the console or via a temporary plugin load

const listCommands = (app: any) => {
    const commands = app.commands.listCommands();
    const srsCommands = commands.filter((c: any) => c.id.includes("spaced") || c.id.includes("flashcard") || c.id.includes("review"));
    console.log("=== Available SRS Commands ===");
    srsCommands.forEach((c: any) => console.log(`${c.id}: ${c.name}`));
    console.log("==============================");
    return srsCommands.map((c: any) => c.id);
};

// We can inject this into the plugin temporarily or ask user to run it? 
// Better: We can add a log in the plugin itself on load.
