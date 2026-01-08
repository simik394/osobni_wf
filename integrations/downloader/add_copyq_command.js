#!/usr/bin/env copyq
// CopyQ script to add Download Images command

var cmds = commands();

// Check if already exists
var exists = false;
for (var i = 0; i < cmds.length; i++) {
    if (cmds[i].name === "Download Images") {
        exists = true;
        break;
    }
}

if (!exists) {
    cmds.push({
        name: "Download Images",
        cmd: 'copyq:\n\
var text = "";\n\
var rows = selectedItems();\n\
for (var i = 0; i < rows.length; i++) {\n\
    text += str(read(rows[i])) + "\\n";\n\
}\n\
if (text.match(/https?:\\/\\//)) {\n\
    var f = temporaryFileName() + ".txt";\n\
    File(f).write(text);\n\
    execute("/home/sim/Obsi/Prods/01-pwf/integrations/downloader/smart_download.sh", "-qn", "-i", f);\n\
}',
        icon: "folder-download",
        inMenu: true,
        automatic: false
    });
    setCommands(cmds);
    print("Command added!");
} else {
    print("Command already exists");
}
