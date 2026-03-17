-- obsidian-embeds.lua
-- Final, aggressive version for in-memory .canvas -> .png swap

function Image(img)
  if img.src:match("%.canvas$") then
    local base = img.src:gsub("%.canvas$", "")
    img.src = base .. ".png"
    -- We force the extension change in the internal link
  end
  return img
end

return {
  {
    Image = Image,
    CodeBlock = function(elem)
      if elem.classes[1] == "mermaid" then
        elem.classes[1] = "{mermaid}"
        return elem
      end
      return elem
    end
  }
}
