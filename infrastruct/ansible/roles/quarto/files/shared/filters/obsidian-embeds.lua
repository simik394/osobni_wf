-- obsidian-embeds.lua
-- Simplified Lua filter for Quarto
-- Images are handled by the pre-render Python script for maximum cross-reference compatibility.
-- This filter can handle other Obsidian-specific syntax if needed.

return {
  {CodeBlock = function(elem)
    -- Convert Obsidian-style ```mermaid to Quarto-style ```{mermaid}
    if elem.classes[1] == "mermaid" then
      elem.classes[1] = "{mermaid}"
      return elem
    end
    return elem
  end}
}