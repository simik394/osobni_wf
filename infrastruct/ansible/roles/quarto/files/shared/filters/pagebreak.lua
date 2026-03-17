-- pagebreak.lua
-- Ensures {{< pagebreak >}} works correctly in PDF/LaTeX and other formats

local function is_latex()
  return FORMAT:match 'latex' or FORMAT:match 'beamer'
end

function RawInline(el)
  if el.text == '{{< pagebreak >}}' or el.text == '{{<pagebreak>}}' then
    if is_latex() then
      return pandoc.RawInline('tex', '
ewpage{}')
    elseif FORMAT:match 'html' then
      return pandoc.RawInline('html', '<div style="page-break-after: always;"></div>')
    end
  end
  return el
end

function Shortcode(el)
  if el.name == 'pagebreak' then
    if is_latex() then
      return pandoc.RawBlock('tex', '
ewpage{}')
    elseif FORMAT:match 'html' then
      return pandoc.RawBlock('html', '<div style="page-break-after: always;"></div>')
    end
  end
end
